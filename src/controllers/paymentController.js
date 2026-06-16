const { PaymentModel, C2bPaymentModel } = require('../models/paymentModel');
const InvoiceModel = require('../models/invoiceModel');

// ─── Daraja token cache ───────────────────────────────────────────────────────
// Tokens are valid for 3600 s. Caching avoids re-fetching on every request.

let _tokenCache = null; // { token: string, expiresAt: number (ms) }

async function getDarajaToken() {
  const now = Date.now();

  if (_tokenCache && _tokenCache.expiresAt - now > 60_000) {
    return _tokenCache.token;
  }

  const key    = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;

  if (!key || !secret) throw new Error('MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET not set');

  const creds = Buffer.from(`${key}:${secret}`).toString('base64');

  const res = await fetch(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${creds}` } }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Daraja token request failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  if (!data.access_token) throw new Error('No access_token in Daraja response');

  const ttl = (data.expires_in || 3600) * 1000;
  _tokenCache = { token: data.access_token, expiresAt: now + ttl };

  return data.access_token;
}

/**
 * Safely parse JSON from a fetch Response.
 * Returns null instead of throwing if body is not JSON (e.g. Incapsula block page).
 */
async function safeJsonFromResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const body = await res.text().catch(() => '');
    console.warn(`[Daraja] Non-JSON response (${res.status}): ${body.slice(0, 200)}`);
    return null;
  }
  try {
    return await res.json();
  } catch (err) {
    const body = await res.text().catch(() => '');
    console.warn(`[Daraja] JSON parse error: ${err.message} — body: ${body.slice(0, 200)}`);
    return null;
  }
}

/**
 * Shared invoice pre-payment validation.
 * Returns { ok: true, invoice } or { ok: false, status, message }.
 */
async function validateInvoiceForPayment(invoice_id) {
  const invoice = await InvoiceModel.findById(invoice_id);
  if (!invoice)
    return { ok: false, status: 404, message: 'Invoice not found' };
  if (invoice.status === 'PAID')
    return { ok: false, status: 400, message: 'Invoice is already fully paid' };
  if (invoice.status === 'CANCELLED')
    return { ok: false, status: 400, message: 'Cannot record payment on a cancelled invoice' };
  return { ok: true, invoice };
}

// ─── Controller ──────────────────────────────────────────────────────────────

const PaymentController = {

  // ── GET /api/payments ──────────────────────────────────────────────────────
  async getAll(req, res, next) {
    try {
      const { method, from, to, limit } = req.query;
      const payments = await PaymentModel.findAll({ method, from, to, limit });
      res.json({ success: true, data: payments });
    } catch (err) {
      next(err);
    }
  },

  // ── GET /api/payments/invoice/:invoice_id ──────────────────────────────────
  async getByInvoice(req, res, next) {
    try {
      const payments = await PaymentModel.findByInvoice(req.params.invoice_id);
      res.json({ success: true, data: payments });
    } catch (err) {
      next(err);
    }
  },

  // ── GET /api/payments/invoice-lookup?q=INV-2026-0041 ──────────────────────
  async invoiceLookup(req, res, next) {
    try {
      const { q } = req.query;
      if (!q) return res.status(400).json({ success: false, message: 'q param required' });

      const results = await InvoiceModel.findAll({ search: q });

      const invoice =
        results.find(i => i.invoice_number.toLowerCase() === q.toLowerCase()) ||
        results[0] ||
        null;

      if (!invoice)
        return res.status(404).json({ success: false, message: 'Invoice not found' });

      res.json({ success: true, data: invoice });
    } catch (err) {
      next(err);
    }
  },

  // ── POST /api/payments — record a manual payment (Cash / Bank Transfer) ────
  async record(req, res, next) {
    try {
      const { invoice_id, amount, method, reference, notes } = req.body;

      if (!invoice_id || !amount || !method) {
        return res.status(400).json({
          success: false,
          message: 'invoice_id, amount and method are required',
        });
      }

      // MPESA manual entries are allowed here (staff pastes a received ref)
      const validMethods = ['MPESA', 'CASH', 'BANK_TRANSFER'];
      if (!validMethods.includes(method)) {
        return res.status(400).json({
          success: false,
          message: `method must be one of: ${validMethods.join(', ')}`,
        });
      }

      if (parseFloat(amount) <= 0) {
        return res.status(400).json({ success: false, message: 'Amount must be greater than zero' });
      }

      const check = await validateInvoiceForPayment(invoice_id);
      if (!check.ok) return res.status(check.status).json({ success: false, message: check.message });

      const payment = await PaymentModel.record({
        invoice_id,
        amount:      parseFloat(amount),
        method,
        reference:   reference || null,
        notes:       notes     || null,
        recorded_by: req.user.id,
      });

      res.status(201).json({ success: true, data: payment });
    } catch (err) {
      next(err);
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // C2B  (Till / Buy Goods)
  //
  // Flow:
  //   1. On server startup (or via POST /api/payments/mpesa/register-urls),
  //      register your validation + confirmation URLs with Daraja once.
  //   2. Customer opens M-Pesa on their phone, goes to:
  //        Lipa na M-Pesa → Buy Goods → enters your till number + amount
  //   3. Safaricom calls your ValidationURL — you respond 0 to accept.
  //   4. Safaricom calls your ConfirmationURL — you record the payment.
  //   5. The frontend polls GET /api/payments/mpesa/c2b-status/:invoiceId
  //      every few seconds to know when the invoice flips to PAID/PARTIAL.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/payments/mpesa/register-urls
   *
   * Registers C2B validation + confirmation URLs with Safaricom.
   * Only needs to be called ONCE per shortcode (or after your URL changes).
   * Protect it with the `protect` middleware so only staff can call it.
   *
   * Required env vars:
   *   MPESA_SHORTCODE          — your Till number
   *   MPESA_C2B_VALIDATION_URL — your public HTTPS validation endpoint
   *   MPESA_C2B_CONFIRM_URL    — your public HTTPS confirmation endpoint
   */
  async registerC2BUrls(req, res, next) {
    try {
      const token     = await getDarajaToken();
      const shortcode = process.env.MPESA_SHORTCODE;
      const validUrl  = process.env.MPESA_C2B_VALIDATION_URL;
      const confirmUrl= process.env.MPESA_C2B_CONFIRM_URL;

      if (!shortcode || !validUrl || !confirmUrl) {
        return res.status(500).json({
          success: false,
          message: 'MPESA_SHORTCODE, MPESA_C2B_VALIDATION_URL and MPESA_C2B_CONFIRM_URL must all be set',
        });
      }

      const darajaRes = await fetch(
        'https://sandbox.safaricom.co.ke/mpesa/c2b/v1/registerurl',
        {
          method:  'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ShortCode:       shortcode,
            ResponseType:    'Completed',  // auto-accept if our validation URL is slow
            ConfirmationURL: confirmUrl,
            ValidationURL:   validUrl,
          }),
        }
      );

      const data = await safeJsonFromResponse(darajaRes);

      if (!data) {
        return res.status(502).json({ success: false, message: 'Could not reach Safaricom' });
      }

      console.log('[C2B registerUrls]', JSON.stringify(data));

      // Daraja returns ResponseDescription "Success" on success
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/payments/mpesa/c2b-validate
   *
   * Safaricom calls this BEFORE processing a C2B transaction.
   * You have a few seconds to respond:
   *   { ResultCode: 0, ResultDesc: 'Accepted' }  → allow
   *   { ResultCode: 1, ResultDesc: 'Rejected' }  → block
   *
   * For Buy Goods you typically always accept (return 0).
   * Add business logic here if you ever need to reject (e.g. known blacklisted number).
   *
   * This route must NOT have auth middleware — Safaricom calls it directly.
   */
  async c2bValidation(req, res) {
    // Always accept; Safaricom requires a fast response
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    // Log for debugging — remove or thin down in production
    console.log('[C2B validate]', JSON.stringify(req.body));
  },

  /**
   * POST /api/payments/mpesa/c2b-confirm
   *
   * Safaricom calls this AFTER a transaction completes successfully.
   * Payload shape (key fields):
   *   TransactionType    — "Buy Goods"
   *   TransID            — M-Pesa receipt number  (e.g. "RHL7NJUKB4")
   *   TransAmount        — amount paid
   *   BusinessShortCode  — your till number
   *   BillRefNumber      — what the customer typed as account reference
   *                        (you can instruct customers to type the invoice number)
   *   MSISDN             — customer phone (254...)
   *   FirstName / LastName / MiddleName
   *
   * This route must NOT have auth middleware — Safaricom calls it directly.
   * Respond 200 immediately; process async.
   */
  async c2bConfirmation(req, res) {
    // Acknowledge immediately — Daraja retries if it doesn't get a fast 200
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    try {
      const body = req.body;

      if (!body || !body.TransID) {
        console.warn('[C2B confirm] Empty or malformed payload:', JSON.stringify(body));
        return;
      }

      const transId     = body.TransID;           // M-Pesa receipt
      const amount      = parseFloat(body.TransAmount);
      const phone       = body.MSISDN;
      const billRef     = (body.BillRefNumber || '').trim().toUpperCase(); // customer typed this
      const customerName= [body.FirstName, body.MiddleName, body.LastName].filter(Boolean).join(' ');

      console.log(
        `[C2B confirm] KES ${amount} | Ref: ${transId} | ` +
        `Phone: ${phone} | BillRef: ${billRef} | Customer: ${customerName}`
      );

      // ── 1. Try to match the bill reference to an invoice number ────────────
      //
      // You instruct customers to type the invoice number (e.g. "INV-2026-0041")
      // as the account reference when they pay. Match it here.
      //
      // If the reference doesn't match any invoice we still record the payment
      // as unmatched so you can reconcile manually in the payments table.

      let invoiceId    = null;
      let invoiceFound = false;

      if (billRef) {
        const results = await InvoiceModel.findAll({ search: billRef });
        const match   = results.find(
          i => (i.invoice_number || '').toUpperCase() === billRef
        ) || results[0] || null;

        if (match && !['PAID', 'CANCELLED'].includes(match.status)) {
          invoiceId    = match.id;
          invoiceFound = true;
        }
      }

      // ── 2. Save the raw C2B transaction (for reconciliation + idempotency) ─
      await C2bPaymentModel.create({
        trans_id:      transId,
        invoice_id:    invoiceId,   // null if unmatched
        amount,
        phone,
        bill_ref:      billRef,
        customer_name: customerName,
        raw_payload:   JSON.stringify(body),
      });

      // ── 3. Record the payment against the invoice if matched ───────────────
      if (invoiceFound && invoiceId) {
        await PaymentModel.record({
          invoice_id:  invoiceId,
          amount,
          method:      'MPESA',
          reference:   transId,
          notes:       `M-Pesa Buy Goods from ${phone} (${customerName}) — auto via C2B callback`,
          recorded_by: 1,           // system user — change to your system user ID
        });

        console.log(`[C2B confirm] Payment recorded for invoice #${invoiceId} | Ref: ${transId}`);
      } else {
        console.warn(
          `[C2B confirm] Could not match BillRefNumber "${billRef}" to any open invoice. ` +
          `Transaction ${transId} saved to c2b_payments as unmatched.`
        );
      }

    } catch (err) {
      console.error('[C2B confirm] Processing error:', err.message);
    }
  },

  /**
   * GET /api/payments/mpesa/c2b-status/:invoiceId
   *
   * The frontend polls this every few seconds after the customer is sent to pay.
   * Returns the current invoice status + balance_due so the UI can react when
   * the payment comes in and the DB trigger flips the invoice to PAID/PARTIAL.
   *
   * Also returns whether a C2B transaction has been recorded against this invoice
   * since the poll started (checked via the c2b_payments table).
   */
  async c2bStatus(req, res, next) {
    try {
      const { invoiceId } = req.params;

      const invoice = await InvoiceModel.findById(invoiceId);
      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }

      // Also check c2b_payments table for the most recent transaction on this invoice
      const latestC2b = await C2bPaymentModel.findLatestByInvoice(invoiceId);

      res.json({
        success: true,
        data: {
          invoice_status: invoice.status,            // UNPAID | PARTIAL | PAID | OVERDUE
          balance_due:    invoice.balance_due,
          amount_paid:    invoice.amount_paid,
          // If there's a recent C2B hit, surface the receipt for the UI to display
          last_trans_id:  latestC2b?.trans_id  || null,
          last_amount:    latestC2b?.amount    || null,
          last_phone:     latestC2b?.phone     || null,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/payments/mpesa/unmatched
   *
   * Returns C2B transactions that have no matched invoice_id.
   * Useful for the admin to manually reconcile payments.
   */
  async unmatchedC2b(req, res, next) {
    try {
      const rows = await C2bPaymentModel.findUnmatched();
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/payments/mpesa/match-c2b
   *
   * Manually match an unmatched C2B transaction to an invoice.
   * Body: { c2b_id, invoice_id }
   */
  async matchC2b(req, res, next) {
    try {
      const { c2b_id, invoice_id } = req.body;
      if (!c2b_id || !invoice_id) {
        return res.status(400).json({ success: false, message: 'c2b_id and invoice_id are required' });
      }

      const check = await validateInvoiceForPayment(invoice_id);
      if (!check.ok) return res.status(check.status).json({ success: false, message: check.message });

      const c2b = await C2bPaymentModel.findById(c2b_id);
      if (!c2b) return res.status(404).json({ success: false, message: 'C2B transaction not found' });
      if (c2b.invoice_id) {
        return res.status(400).json({ success: false, message: 'Transaction is already matched to an invoice' });
      }

      // Link c2b row to invoice
      await C2bPaymentModel.linkToInvoice({ c2b_id, invoice_id });

      // Record the payment
      const payment = await PaymentModel.record({
        invoice_id,
        amount:      c2b.amount,
        method:      'MPESA',
        reference:   c2b.trans_id,
        notes:       `Manually matched C2B payment from ${c2b.phone} (${c2b.customer_name})`,
        recorded_by: req.user.id,
      });

      res.json({ success: true, data: payment });
    } catch (err) {
      next(err);
    }
  },

};

module.exports = PaymentController;