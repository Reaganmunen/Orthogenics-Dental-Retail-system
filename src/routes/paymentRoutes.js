const express           = require('express');
const router            = express.Router();
const PaymentController = require('../controllers/paymentController');
const { protect }       = require('../middleware/authMiddleware');
const { validate, rules } = require('../middleware/validateMiddleware');

// ─────────────────────────────────────────────────────────────────────────────
//  IMPORTANT: specific routes must come BEFORE param routes.
// ─────────────────────────────────────────────────────────────────────────────

// GET  /api/payments — list all payments (with optional ?method=&from=&to=&limit=)
router.get('/', protect, PaymentController.getAll);

// GET  /api/payments/invoice-lookup?q=INV-2026-0041 — look up invoice for record form
router.get('/invoice-lookup', protect, PaymentController.invoiceLookup);

// GET  /api/payments/invoice/:invoice_id — all payments for a specific invoice
router.get('/invoice/:invoice_id', protect, PaymentController.getByInvoice);

// POST /api/payments/mpesa/stk-push — initiate STK push
router.post('/mpesa/stk-push', protect, PaymentController.stkPush);

// GET  /api/payments/mpesa/status/:checkoutRequestId — poll for STK push result
router.get('/mpesa/status/:checkoutRequestId', protect, PaymentController.stkStatus);

// POST /api/payments/mpesa/callback — Safaricom Daraja webhook (NO auth)
router.post('/mpesa/callback', PaymentController.mpesaCallback);

// POST /api/payments — record a payment manually
router.post('/', protect, validate(rules.recordPayment), PaymentController.record);

module.exports = router;