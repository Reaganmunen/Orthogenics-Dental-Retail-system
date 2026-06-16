const express           = require('express');
const router            = express.Router();
const PaymentController = require('../controllers/paymentController');
const { protect }       = require('../middleware/authMiddleware');
const { validate, rules } = require('../middleware/validateMiddleware');

// ─────────────────────────────────────────────────────────────────────────────
//  IMPORTANT: specific routes BEFORE param routes.
// ─────────────────────────────────────────────────────────────────────────────

// GET  /api/payments — list all payments (with optional ?method=&from=&to=&limit=)
router.get('/', protect, PaymentController.getAll);

// GET  /api/payments/invoice-lookup?q=INV-2026-0041
router.get('/invoice-lookup', protect, PaymentController.invoiceLookup);

// GET  /api/payments/invoice/:invoice_id — all payments for a specific invoice
router.get('/invoice/:invoice_id', protect, PaymentController.getByInvoice);

// ─── C2B (Buy Goods / Till) ──────────────────────────────────────────────────

// POST /api/payments/mpesa/register-urls
// One-time call to register your C2B validation + confirmation URLs with Safaricom.
// Call this once after deploy (or whenever your Vercel URL changes).
router.post('/mpesa/register-urls', protect, PaymentController.registerC2BUrls);

// POST /api/payments/mpesa/c2b-validate
// Safaricom validation webhook — NO auth middleware (Safaricom calls this directly).
router.post('/mpesa/c2b-validate', PaymentController.c2bValidation);

// POST /api/payments/mpesa/c2b-confirm
// Safaricom confirmation webhook — NO auth middleware (Safaricom calls this directly).
router.post('/mpesa/c2b-confirm', PaymentController.c2bConfirmation);

// GET  /api/payments/mpesa/c2b-status/:invoiceId
// Frontend polls this to detect when a C2B payment lands on an invoice.
router.get('/mpesa/c2b-status/:invoiceId', protect, PaymentController.c2bStatus);

// GET  /api/payments/mpesa/unmatched
// Admin: list C2B transactions with no matched invoice.
router.get('/mpesa/unmatched', protect, PaymentController.unmatchedC2b);

// POST /api/payments/mpesa/match-c2b
// Admin: manually link an unmatched C2B transaction to an invoice.
router.post('/mpesa/match-c2b', protect, PaymentController.matchC2b);

// ─── Manual payment recording ────────────────────────────────────────────────

// POST /api/payments — record Cash / Bank Transfer / manual MPESA
router.post('/', protect, validate(rules.recordPayment), PaymentController.record);

module.exports = router;