const express             = require('express');
const router              = express.Router();
const StockController     = require('../controllers/stockController');
const { protect }         = require('../middleware/authMiddleware');
const { validate, rules } = require('../middleware/validateMiddleware');

router.use(protect);

// GET  /api/stock/low                         — low stock alert list
router.get('/low',                  StockController.getLowStock);

// GET  /api/stock/expiring?days=30            — items expiring soon
router.get('/expiring',             StockController.getExpiring);

// GET  /api/stock/batches/:product_id         — delivery history per product
router.get('/batches/:product_id',  StockController.getBatches);

// GET  /api/stock/adjustments/:product_id     — adjustment log per product
router.get('/adjustments/:product_id', StockController.getAdjustments);

// POST /api/stock/receive                     — log a new delivery
router.post('/receive', validate(rules.receiveBatch), StockController.receiveBatch);

// POST /api/stock/adjust                      — manual stock correction
router.post('/adjust',  validate(rules.stockAdjust),  StockController.adjust);

module.exports = router;