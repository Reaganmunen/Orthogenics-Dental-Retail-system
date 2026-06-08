const StockBatchModel      = require('../models/stockBatchModel');
const StockAdjustmentModel = require('../models/stockAdjustmentModel');
const ProductModel         = require('../models/productModel');

const StockController = {

  // GET /api/stock/batches/:product_id
  async getBatches(req, res, next) {
    try {
      const batches = await StockBatchModel.findByProduct(req.params.product_id);
      res.json({ success: true, data: batches });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/stock/receive  — log a new delivery
  async receiveBatch(req, res, next) {
    try {
      const { product_id, quantity, expiry_date, delivery_note } = req.body;

      if (!product_id || !quantity) {
        return res.status(400).json({ success: false, message: 'product_id and quantity are required' });
      }
      if (parseInt(quantity) <= 0) {
        return res.status(400).json({ success: false, message: 'Quantity must be greater than zero' });
      }

      const product = await ProductModel.findById(product_id);
      if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

      const batch = await StockBatchModel.receive({ product_id, quantity, expiry_date, delivery_note });
      res.status(201).json({ success: true, data: batch });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/stock/adjust  — manual stock correction
  async adjust(req, res, next) {
    try {
      const { product_id, quantity, reason, notes } = req.body;

      if (!product_id || quantity == null || !reason) {
        return res.status(400).json({ success: false, message: 'product_id, quantity and reason are required' });
      }

      const validReasons = ['DAMAGED', 'EXPIRED', 'LOST', 'SAMPLE_GIVEN', 'COUNT_CORRECTION', 'OTHER'];
      if (!validReasons.includes(reason)) {
        return res.status(400).json({ success: false, message: `reason must be one of: ${validReasons.join(', ')}` });
      }

      const adjustment = await StockAdjustmentModel.adjust({
        product_id,
        quantity: parseInt(quantity),
        reason,
        notes,
        created_by: req.user.id,
      });

      res.status(201).json({ success: true, data: adjustment });
    } catch (err) {
      // Stock would go negative
      if (err.message.startsWith('Cannot remove')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next(err);
    }
  },

  // GET /api/stock/low  — items at or below reorder point
  async getLowStock(req, res, next) {
    try {
      const products = await ProductModel.getLowStock();
      res.json({ success: true, data: products });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/stock/expiring?days=30
  async getExpiring(req, res, next) {
    try {
      const days = parseInt(req.query.days) || 30;
      const batches = await StockBatchModel.expiringSoon(days);
      res.json({ success: true, data: batches });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/stock/adjustments/:product_id
  async getAdjustments(req, res, next) {
    try {
      const adjustments = await StockAdjustmentModel.findByProduct(req.params.product_id);
      res.json({ success: true, data: adjustments });
    } catch (err) {
      next(err);
    }
  },

};

module.exports = StockController;