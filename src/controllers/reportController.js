const ReportModel = require('../models/reportModel');

// Helper — default date range to current month if not provided
function getDateRange(query) {
  const now   = new Date();
  const from  = query.from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const to    = query.to   || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  return { from, to };
}

const ReportController = {

  // GET /api/reports/sales?from=2026-01-01&to=2026-01-31
  async salesByProduct(req, res, next) {
    try {
      const { from, to } = getDateRange(req.query);
      const data = await ReportModel.salesByProduct({ from, to });
      res.json({ success: true, from, to, data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/reports/revenue?from=&to=
  async revenueByDay(req, res, next) {
    try {
      const { from, to } = getDateRange(req.query);
      const data = await ReportModel.revenueByDay({ from, to });
      res.json({ success: true, from, to, data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/reports/dead-stock?days=90
  async deadStock(req, res, next) {
    try {
      const days = parseInt(req.query.days) || 90;
      const data = await ReportModel.deadStock(days);
      res.json({ success: true, days, data });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/reports/outstanding
  async outstanding(req, res, next) {
    try {
      const data = await ReportModel.outstandingByCustomer();
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

};

module.exports = ReportController;