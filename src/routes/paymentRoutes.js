const express           = require('express');
const router            = express.Router();
const PaymentController = require('../controllers/paymentController');
const { protect }       = require('../middleware/authMiddleware');
const { validate, rules } = require('../middleware/validateMiddleware');

// ─────────────────────────────────────────────────────────────────────────────
//  IMPORTANT: specific routes must come BEFORE param routes.
//  e.g. /mpesa/stk-push must be declared before /mpesa/callback,
//  and /mpesa/status/:id must also be above any generic /:id route.
// ─────────────────────────────────────────────────────────────────────────────

// GET  /api/payments/invoice/:invoice_id — all payments for an invoice
router.get('/invoice/:invoice_id', protect, PaymentController.getByInvoice);

// POST /api/payments/mpesa/stk-push — initiate STK push (authenticated: staff triggers this)
router.post('/mpesa/stk-push', protect, PaymentController.stkPush);

// GET  /api/payments/mpesa/status/:checkoutRequestId — poll for STK push result
router.get('/mpesa/status/:checkoutRequestId', protect, PaymentController.stkStatus);

// POST /api/payments/mpesa/callback — Safaricom Daraja webhook (NO auth — Safaricom calls this)
router.post('/mpesa/callback', PaymentController.mpesaCallback);

// POST /api/payments — record any payment manually (cash / bank transfer / M-Pesa by hand)
router.post('/', protect, validate(rules.recordPayment), PaymentController.record);

module.exports = router;