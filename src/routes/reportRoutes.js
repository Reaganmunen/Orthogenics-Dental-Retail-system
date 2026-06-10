const express            = require('express');
const router             = express.Router();
const ReportController   = require('../controllers/reportController');
const { protect }        = require('../middleware/authMiddleware');
const { requireAdmin }   = require('../middleware/roleMiddleware');

// All reports require login — admin only for financial details
router.use(protect);

// GET /api/reports/sales?from=&to=
router.get('/sales',        requireAdmin, ReportController.salesByProduct);

// GET /api/reports/revenue?from=&to=
router.get('/revenue',      requireAdmin, ReportController.revenueByDay);

// GET /api/reports/dead-stock?days=90
router.get('/dead-stock',   requireAdmin, ReportController.deadStock);

// GET /api/reports/outstanding
router.get('/outstanding',  ReportController.outstanding);

module.exports = router;