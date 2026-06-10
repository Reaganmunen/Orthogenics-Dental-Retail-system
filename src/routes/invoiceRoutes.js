const express             = require('express');
const router              = express.Router();
const InvoiceController   = require('../controllers/invoiceController');
const { protect }         = require('../middleware/authMiddleware');
const { requireAdmin }    = require('../middleware/roleMiddleware');

router.use(protect);

// GET  /api/invoices?status=&search=
router.get('/',                       InvoiceController.getAll);

// GET  /api/invoices/overdue          — must be before /:id
router.get('/overdue',                InvoiceController.getOverdue);

// GET  /api/invoices/by-order/:order_id
router.get('/by-order/:order_id',     InvoiceController.getByOrder);

// GET  /api/invoices/:id              — full detail with items + payments
router.get('/:id',                    InvoiceController.getOne);

// POST /api/invoices/run-overdue-sweep — admin only, run daily via cron
router.post('/run-overdue-sweep', requireAdmin, InvoiceController.runOverdueSweep);

module.exports = router;