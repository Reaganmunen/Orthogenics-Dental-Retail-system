const { PaymentModel, StkPushModel } = require('../models/paymentModel');
const InvoiceModel = require('../models/invoiceModel');

// ─── Daraja helpers ──────────────────────────────────────────────────────────

/**
 * Get a fresh Daraja OAuth token.
 * Consumer key + secret come from environment variables.
 */
async function getDarajaToken() {
  const key    = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  const creds  = Buffer.from(`${key}:${secret}`).toString('base64');

  const res = await fetch(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${creds}` } }
  );

  if (!res.ok) throw new Error(`Daraja token request failed: ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error('No access_token in Daraja response');
  return data.access_token;
}

/**
 * Build the STK push password and timestamp Daraja expects.
 * Format: Base64(Shortcode + Passkey + Timestamp)  where Timestamp = YYYYMMDDHHmmss
 */
function buildStkPassword() {
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey   = process.env.MPESA_PASSKEY;
  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
  const password  = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  return { shortcode, password, timestamp };
}

/**
 * Normalise phone to 2547XXXXXXXX format.
 * Accepts: 07XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX
 */
function normalisePhone(phone) {
  return String(phone).replace(/^\+/, '').replace(/^0/, '254');
}

// ─── Controller ─────────────────────────────────────────────────────────────

const PaymentController = {

  // ── GET /api/payments/invoice/:invoice_id ────────────────────────────────
  async getByInvoice(req, res, next) {
    try {
      const payments = await PaymentModel.findByInvoice(req.params.invoice_id);
      res.json({ success: true, data: payments });
    } catch (err) {
      next(err);
    }
  },

  // ── POST /api/payments ───────────────────────────────────────────────────
  // Record a manual payment (cash, bank transfer, or M-Pesa entered by hand)
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

      const invoice = await InvoiceModel.findById(invoice_id);
      if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

      if (invoice.status === 'PAID') {
        return res.status(400).json({ success: false, message: 'Invoice is already fully paid' });
      }
      if (invoice.status === 'CANCELLED') {
        return res.status(400).json({ success: false, message: 'Cannot record payment on a cancelled invoice' });
      }

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
  // Initiate an STK push to a customer's phone via Safaricom Daraja.
  // The frontend sends { invoice_id, phone, amount }.
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

      // Validate invoice exists and is payable
      const invoice = await InvoiceModel.findById(invoice_id);
      if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

      if (invoice.status === 'PAID') {
        return res.status(400).json({ success: false, message: 'Invoice is already fully paid' });
      }
      if (invoice.status === 'CANCELLED') {
        return res.status(400).json({ success: false, message: 'Cannot pay a cancelled invoice' });
      }

      // Build Daraja request
      const formattedPhone          = normalisePhone(phone);
      const { shortcode, password, timestamp } = buildStkPassword();
      const token                   = await getDarajaToken();

      // NOTE: switch to production URL when going live:
      //   https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest
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
            TransactionType:   'CustomerPayBillOnline',  // use CustomerBuyGoodsOnline for till numbers
            Amount:            Math.ceil(parseFloat(amount)),  // Daraja requires integer
            PartyA:            formattedPhone,
            PartyB:            shortcode,
            PhoneNumber:       formattedPhone,
            CallBackURL:       process.env.MPESA_CALLBACK_URL,  // e.g. https://yourdomain.com/api/payments/mpesa/callback
            AccountReference:  invoice.invoice_number || `INV-${invoice_id}`,
            TransactionDesc:   `Payment for ${invoice.invoice_number || 'invoice ' + invoice_id}`,
          }),
        }
      );

      const stkData = await stkRes.json();

      // Daraja returns ResponseCode '0' on success (it's a string, not a number)
      if (stkData.ResponseCode !== '0') {
        console.error('Daraja STK push error:', stkData);
        return res.status(502).json({
          success: false,
          message: stkData.errorMessage || stkData.ResultDesc || 'STK push failed',
        });
      }

      // Save request so we can:
      //  1. Match it in the callback (CheckoutRequestID → invoice_id)
      //  2. Respond to the frontend's status poll
      await StkPushModel.create({
        checkout_request_id: stkData.CheckoutRequestID,
        invoice_id,
        amount:              parseFloat(amount),
        phone:               formattedPhone,
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
  // The frontend polls this every 5 seconds after sending the STK push.
  // Returns { status: 'PENDING' | 'COMPLETED' | 'FAILED', mpesa_ref, message }
  async stkStatus(req, res, next) {
    try {
      const row = await StkPushModel.findByCheckoutRequestId(req.params.checkoutRequestId);
      if (!row) {
        return res.status(404).json({ success: false, message: 'STK push request not found' });
      }
      res.json({
        success: true,
        data: {
          status:    row.status,
          mpesa_ref: row.mpesa_ref  || null,
          message:   row.message    || null,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // ── POST /api/payments/mpesa/callback ────────────────────────────────────
  // Safaricom Daraja calls this endpoint after the customer approves/rejects
  // the STK push on their phone. No auth — Safaricom calls this directly.
  async mpesaCallback(req, res, next) {
    try {
      const body = req.body?.Body?.stkCallback;

      // Always respond 200 immediately — Daraja retries if it doesn't get it
      res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

      if (!body) {
        console.warn('M-Pesa callback: empty or malformed body');
        return;
      }

      const checkoutRequestId = body.CheckoutRequestID;

      if (body.ResultCode !== 0) {
        // Customer cancelled, insufficient funds, wrong PIN, timeout, etc.
        console.log(`M-Pesa callback: payment not completed — ${body.ResultDesc} (${checkoutRequestId})`);
        await StkPushModel.markFailed({
          checkout_request_id: checkoutRequestId,
          message: body.ResultDesc || 'Payment not completed',
        });
        return;
      }

      // Extract metadata from the successful callback
      const meta      = body.CallbackMetadata?.Item || [];
      const get       = (name) => meta.find((i) => i.Name === name)?.Value;
      const amount    = get('Amount');
      const mpesaRef  = get('MpesaReceiptNumber');
      const phone     = get('PhoneNumber');

      console.log(`M-Pesa payment received: KES ${amount} | Ref: ${mpesaRef} | Phone: ${phone} | CheckoutID: ${checkoutRequestId}`);

      // Mark the STK push request as completed — status poll on frontend will pick this up
      const stkRow = await StkPushModel.markCompleted({
        checkout_request_id: checkoutRequestId,
        mpesa_ref:           mpesaRef,
      });

      if (!stkRow) {
        // This can happen if the row was never saved (shouldn't occur in normal flow)
        console.error(`M-Pesa callback: no stk_push_request found for CheckoutRequestID ${checkoutRequestId}`);
        return;
      }

      // ── Server-side payment record ────────────────────────────────────────
      // The frontend's auto-submit (submitPayment()) will also call POST /api/payments
      // after the poll returns COMPLETED, so recording here as well would create a
      // duplicate. Uncomment the block below ONLY if you want a server-side fallback
      // (e.g. for cases where the user closed the browser before the poll finished).
      //
      // await PaymentModel.record({
      //   invoice_id:  stkRow.invoice_id,
      //   amount:      stkRow.amount,
      //   method:      'MPESA',
      //   reference:   mpesaRef,
      //   notes:       `M-Pesa from ${phone} (auto-confirmed via callback)`,
      //   recorded_by: 1,  // system user — create a dedicated system user in your users table
      // });

    } catch (err) {
      // Don't call next(err) — we already responded 200 to Daraja
      console.error('M-Pesa callback error:', err.message);
    }
  },

};

module.exports = PaymentController;