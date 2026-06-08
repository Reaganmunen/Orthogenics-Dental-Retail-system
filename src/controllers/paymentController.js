const PaymentModel = require('../models/paymentModel');
const InvoiceModel = require('../models/invoiceModel');

const PaymentController = {

  // GET /api/payments/invoice/:invoice_id
  async getByInvoice(req, res, next) {
    try {
      const payments = await PaymentModel.findByInvoice(req.params.invoice_id);
      res.json({ success: true, data: payments });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/payments  — record a manual payment (cash or bank transfer)
  async record(req, res, next) {
    try {
      const { invoice_id, amount, method, reference, notes } = req.body;

      if (!invoice_id || !amount || !method) {
        return res.status(400).json({ success: false, message: 'invoice_id, amount and method are required' });
      }

      const validMethods = ['MPESA', 'CASH', 'BANK_TRANSFER'];
      if (!validMethods.includes(method)) {
        return res.status(400).json({ success: false, message: `method must be one of: ${validMethods.join(', ')}` });
      }

      if (parseFloat(amount) <= 0) {
        return res.status(400).json({ success: false, message: 'Amount must be greater than zero' });
      }

      // Check invoice exists
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
        amount: parseFloat(amount),
        method,
        reference: reference || null,
        notes:     notes || null,
        recorded_by: req.user.id,
      });

      res.status(201).json({ success: true, data: payment });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/payments/mpesa/callback  — Safaricom Daraja sends payment confirmation here
  async mpesaCallback(req, res, next) {
    try {
      const body = req.body?.Body?.stkCallback;

      // Always respond 200 quickly — Daraja expects it
      res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

      if (!body || body.ResultCode !== 0) {
        // Payment failed or was cancelled by user — nothing to record
        console.log('M-Pesa callback: payment not completed', body?.ResultDesc);
        return;
      }

      // Extract fields from the callback metadata
      const meta    = body.CallbackMetadata?.Item || [];
      const get     = (name) => meta.find(i => i.Name === name)?.Value;

      const amount    = get('Amount');
      const mpesaRef  = get('MpesaReceiptNumber');
      const phone     = get('PhoneNumber');
      const accountRef = body.CheckoutRequestID; // or use BillRefNumber if paybill

      console.log(`M-Pesa payment received: KES ${amount} | Ref: ${mpesaRef} | Phone: ${phone}`);

      // TODO: match accountRef to an invoice_id and record the payment
      // This requires you to store the CheckoutRequestID when initiating STK push
      // Example:
      // const invoice = await InvoiceModel.findByCheckoutRequestId(accountRef);
      // if (invoice) {
      //   await PaymentModel.record({ invoice_id: invoice.id, amount, method: 'MPESA',
      //     reference: mpesaRef, notes: `M-Pesa from ${phone}`, recorded_by: 1 });
      // }

    } catch (err) {
      console.error('M-Pesa callback error:', err.message);
    }
  },

};

module.exports = PaymentController;