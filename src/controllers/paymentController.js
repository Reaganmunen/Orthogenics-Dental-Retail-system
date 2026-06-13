const { PaymentModel, StkPushModel } = require('../models/paymentModel');
const InvoiceModel = require('../models/invoiceModel');

// ─── Daraja token cache ───────────────────────────────────────────────────────
// Daraja OAuth tokens are valid for 3600 seconds.
// Caching here means every 5-second poll reuses the same token instead of
// fetching a new one — that single change eliminates the SpikeArrestViolation
// and the downstream Incapsula 403 blocks.

let _tokenCache = null; // { token: string, expiresAt: number (ms) }

async function getDarajaToken() {
  const now = Date.now();

  // Return cached token if it still has >60 s of life left
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

  // Cache: Daraja returns expires_in in seconds (default 3600)
  const ttl = (data.expires_in || 3600) * 1000;
  _tokenCache = { token: data.access_token, expiresAt: now + ttl };

  return data.access_token;
}

/**
 * Build the STK password + timestamp.
 * Uses EAT (UTC+3) — Daraja requires the timestamp match its server clock.
 */
function buildStkPassword() {
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey   = process.env.MPESA_PASSKEY;

  if (!shortcode || !passkey) throw new Error('MPESA_SHORTCODE / MPESA_PASSKEY not set');

  const nowEAT    = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const timestamp = nowEAT.toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
  const password  = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  return { shortcode, password, timestamp };
}

/**
 * Normalise a Kenyan phone number to the 2547XXXXXXXX format Daraja expects.
 * Handles: 07XX, +2547XX, 2547XX
 */
function normalisePhone(phone) {
  const cleaned = String(phone).replace(/\s+/g, '').replace(/^\+/, '');
  if (cleaned.startsWith('0'))   return '254' + cleaned.slice(1);
  if (cleaned.startsWith('254')) return cleaned;
  return cleaned;
}

/**
 * Safely parse JSON from a fetch Response.
 * If Daraja returns an HTML block page (Incapsula 403) or any non-JSON body,
 * this returns null instead of throwing — the caller treats null as "unreachable".
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

/**
 * Query Daraja directly for the current status of an STK push.
 *
 * This is the KEY FIX for "status stays PENDING forever":
 *
 * The Daraja callback fires asynchronously — if your server restarts, ngrok
 * rotates, or the callback is slow, the stk_push_requests row never updates.
 * Calling the query API from stkStatus() means the frontend poll ALWAYS gets
 * a definitive answer directly from Safaricom, regardless of whether the
 * callback fired.
 *
 * Returns the raw Daraja response object, or null if the request failed.
 */
async function queryDarajaSTKStatus(checkoutRequestId) {
  try {
    const token                              = await getDarajaToken(); // uses cache — no new token request
    const { shortcode, password, timestamp } = buildStkPassword();

    const res = await fetch(
      'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query',
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          BusinessShortCode: shortcode,
          Password:          password,
          Timestamp:         timestamp,
          CheckoutRequestID: checkoutRequestId,
        }),
      }
    );

    const data = await safeJsonFromResponse(res);
    if (data) {
      console.log(`[Daraja query] CheckoutRequestID=${checkoutRequestId} →`, JSON.stringify(data));
    }
    return data; // null if Incapsula blocked or JSON parse failed
  } catch (err) {
    console.error('[Daraja query] Failed:', err.message);
    return null;
  }
}

// ─── Controller ─────────────────────────────────────────────────────────────

const PaymentController = {

  // ── GET /api/payments ────────────────────────────────────────────────────
  async getAll(req, res, next) {
    try {
      const { method, from, to, limit } = req.query;
      const payments = await PaymentModel.findAll({ method, from, to, limit });
      res.json({ success: true, data: payments });
    } catch (err) {
      next(err);
    }
  },

  // ── GET /api/payments/invoice/:invoice_id ────────────────────────────────
  async getByInvoice(req, res, next) {
    try {
      const payments = await PaymentModel.findByInvoice(req.params.invoice_id);
      res.json({ success: true, data: payments });
    } catch (err) {
      next(err);
    }
  },

  // ── GET /api/payments/invoice-lookup?q=INV-2026-0041 ─────────────────────
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

  // ── POST /api/payments ───────────────────────────────────────────────────
  async record(req, res, next) {
    try {
      const { invoice_id, amount, method, reference, notes } = req.body;

      if (!invoice_id || !amount || !method) {
        return res.status(400).json({
          success: false,
          message: 'invoice_id, amount and method are required',
        });
      }

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

  // ── POST /api/payments/mpesa/stk-push ────────────────────────────────────
  async stkPush(req, res, next) {
    try {
      const { invoice_id, phone, amount } = req.body;

      if (!invoice_id || !phone || !amount) {
        return res.status(400).json({
          success: false,
          message: 'invoice_id, phone and amount are required',
        });
      }

      if (parseFloat(amount) <= 0) {
        return res.status(400).json({ success: false, message: 'Amount must be greater than zero' });
      }

      const check = await validateInvoiceForPayment(invoice_id);
      if (!check.ok) return res.status(check.status).json({ success: false, message: check.message });
      const { invoice } = check;

      const formattedPhone                    = normalisePhone(phone);
      const { shortcode, password, timestamp } = buildStkPassword();
      const token                             = await getDarajaToken();

      const stkRes = await fetch(
        'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
        {
          method:  'POST',
          headers: {
            Authorization:  `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            BusinessShortCode: shortcode,
            Password:          password,
            Timestamp:         timestamp,
            TransactionType:   'CustomerPayBillOnline',
            Amount:            Math.ceil(parseFloat(amount)),
            PartyA:            formattedPhone,
            PartyB:            shortcode,
            PhoneNumber:       formattedPhone,
            CallBackURL:       process.env.MPESA_CALLBACK_URL,
            AccountReference:  invoice.invoice_number || `INV-${invoice_id}`,
            TransactionDesc:   `Payment for ${invoice.invoice_number || 'invoice ' + invoice_id}`,
          }),
        }
      );

      const stkData = await safeJsonFromResponse(stkRes);

      if (!stkData) {
        return res.status(502).json({
          success: false,
          message: 'Could not reach Safaricom — please try again in a moment.',
        });
      }

      if (stkData.ResponseCode !== '0') {
        console.error('Daraja STK push error:', stkData);
        return res.status(502).json({
          success: false,
          message: stkData.errorMessage || stkData.ResultDesc || 'STK push failed',
        });
      }

      await StkPushModel.create({
        checkout_request_id: stkData.CheckoutRequestID,
        invoice_id,
        amount:  parseFloat(amount),
        phone:   formattedPhone,
      });

      res.json({
        success: true,
        data: { CheckoutRequestID: stkData.CheckoutRequestID },
      });
    } catch (err) {
      next(err);
    }
  },

  // ── GET /api/payments/mpesa/status/:checkoutRequestId ───────────────────
  //
  // THE MAIN FIX IS HERE.
  //
  // Old behaviour: only read stk_push_requests table → stays PENDING forever
  // if the callback never fired (ngrok down, slow network, server restart).
  //
  // New behaviour:
  //   1. Read local DB row.
  //   2. If still PENDING → ask Daraja directly via the STK query API.
  //   3. If Daraja says completed/failed → update DB row + return real status.
  //   4. Frontend poll now always gets a definitive answer.
  //
  async stkStatus(req, res, next) {
    try {
      const { checkoutRequestId } = req.params;

      const row = await StkPushModel.findByCheckoutRequestId(checkoutRequestId);
      if (!row) {
        return res.status(404).json({ success: false, message: 'STK push request not found' });
      }

      // Already settled from the callback — just return it
      if (row.status !== 'PENDING') {
        return res.json({
          success: true,
          data: {
            status:    row.status,
            mpesa_ref: row.mpesa_ref || null,
            message:   row.message  || null,
          },
        });
      }

      // ── Still PENDING — query Daraja directly ────────────────────────────
      const darajaRes = await queryDarajaSTKStatus(checkoutRequestId);

      if (!darajaRes) {
        // Daraja unreachable (Incapsula block, network error, etc.) —
        // return PENDING so the frontend retries on the next tick.
        return res.json({ success: true, data: { status: 'PENDING', mpesa_ref: null, message: null } });
      }

      // ── Determine if the transaction is still being processed ────────────
      //
      // Daraja ResultCode / errorCode meanings for the QUERY endpoint:
      //
      //   ResultCode 0           → Success (use this)
      //   ResultCode 4999        → Transaction still being processed (treat as PENDING)
      //   errorCode 500.001.1001 → Request still in queue (treat as PENDING)
      //   errorCode 500.001.1001 → "in process" / "not found" message (treat as PENDING)
      //
      // ResultCode 4999 was the bug: parseInt('4999') !== 0, so it fell into
      // the FAILED branch and called markFailed() on an in-flight payment.

      const resultCodeRaw = darajaRes.ResultCode ?? darajaRes.errorCode ?? null;
      const resultCode    = resultCodeRaw !== null ? parseInt(String(resultCodeRaw), 10) : NaN;

      const stillProcessing =
        resultCode === 4999 ||                                                // ← THE FIX
        darajaRes.errorCode === '500.001.1001' ||
        darajaRes.errorMessage?.toLowerCase().includes('in process') ||
        darajaRes.errorMessage?.toLowerCase().includes('not found') ||        // very fresh push
        darajaRes.ResponseDescription?.toLowerCase().includes('in process');

      if (stillProcessing) {
        return res.json({ success: true, data: { status: 'PENDING', mpesa_ref: null, message: null } });
      }

      if (isNaN(resultCode)) {
        // Unexpected Daraja shape — log and stay PENDING rather than falsely failing
        console.warn('[Daraja query] Unexpected response shape:', JSON.stringify(darajaRes));
        return res.json({ success: true, data: { status: 'PENDING', mpesa_ref: null, message: null } });
      }

      if (resultCode === 0) {
        // SUCCESS — Daraja query doesn't return MpesaReceiptNumber, only the callback does.
        // Mark COMPLETED in DB; mpesa_ref will be filled when callback arrives (usually seconds later).
        const updated = await StkPushModel.markCompleted({
          checkout_request_id: checkoutRequestId,
          mpesa_ref: null, // callback will update this
        });

        return res.json({
          success: true,
          data: {
            status:    'COMPLETED',
            mpesa_ref: updated?.mpesa_ref || null,
            message:   'Payment confirmed by Safaricom',
          },
        });

      } else {
        // FAILED / CANCELLED — map common codes to readable messages
        const messageMap = {
          1032: 'Payment request was cancelled.',
          1037: 'Payment request timed out — no response from phone.',
          1:    'Insufficient M-Pesa balance.',
          2001: 'Wrong M-Pesa PIN entered.',
          17:   'M-Pesa transaction limit reached.',
          1019: 'Transaction expired.',
        };
        const message = messageMap[resultCode]
          || darajaRes.ResultDesc
          || darajaRes.errorMessage
          || 'Payment was not completed.';

        await StkPushModel.markFailed({
          checkout_request_id: checkoutRequestId,
          message,
        });

        return res.json({
          success: true,
          data: { status: 'FAILED', mpesa_ref: null, message },
        });
      }

    } catch (err) {
      next(err);
    }
  },

  // ── POST /api/payments/mpesa/callback ────────────────────────────────────
  //
  // Safaricom calls this after the customer approves or declines the prompt.
  // Respond 200 immediately (Daraja requires a fast ack), then process async.
  //
  async mpesaCallback(req, res) {
    // Acknowledge immediately — Daraja will retry if it doesn't get a fast 200
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    try {
      const body = req.body?.Body?.stkCallback;

      if (!body) {
        console.warn('M-Pesa callback: empty or malformed payload', JSON.stringify(req.body));
        return;
      }

      const checkoutRequestId = body.CheckoutRequestID;

      // ── Payment failed / cancelled by user ───────────────────────────────
      if (body.ResultCode !== 0) {
        console.log(`M-Pesa callback: not completed — ${body.ResultDesc} (code ${body.ResultCode}) — ${checkoutRequestId}`);
        await StkPushModel.markFailed({
          checkout_request_id: checkoutRequestId,
          message: body.ResultDesc || 'Payment not completed',
        });
        return;
      }

      // ── Payment succeeded ────────────────────────────────────────────────
      const meta     = body.CallbackMetadata?.Item || [];
      const get      = (name) => meta.find(i => i.Name === name)?.Value;
      const amount   = get('Amount');
      const mpesaRef = get('MpesaReceiptNumber');
      const phone    = get('PhoneNumber');

      console.log(
        `M-Pesa payment received: KES ${amount} | Ref: ${mpesaRef} | ` +
        `Phone: ${phone} | CheckoutID: ${checkoutRequestId}`
      );

      // Mark the STK row as completed (this also fills mpesa_ref)
      const stkRow = await StkPushModel.markCompleted({
        checkout_request_id: checkoutRequestId,
        mpesa_ref:           mpesaRef,
      });

      if (!stkRow) {
        console.error(
          `M-Pesa callback: no stk_push_request found for CheckoutRequestID ${checkoutRequestId}`
        );
        return;
      }

      // Record the payment. The DB has a unique constraint on (invoice_id, reference)
      // so even if the frontend also submits, only one row is ever inserted.
      await PaymentModel.record({
        invoice_id:  stkRow.invoice_id,
        amount:      stkRow.amount,
        method:      'MPESA',
        reference:   mpesaRef,
        notes:       `M-Pesa from ${phone} (confirmed via Daraja callback)`,
        recorded_by: 1, // system user — change to your system user ID
      });

      console.log(`Payment recorded for invoice ${stkRow.invoice_id} | Ref: ${mpesaRef}`);

    } catch (err) {
      console.error('M-Pesa callback processing error:', err.message);
    }
  },

};

module.exports = PaymentController;