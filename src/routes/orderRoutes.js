const express           = require('express');
const router            = express.Router();
const OrderController   = require('../controllers/orderController');
const { protect }       = require('../middleware/authMiddleware');

router.use(protect);

// GET   /api/orders?status=&customer_id=&is_quote=
router.get('/',                     OrderController.getAll);

// GET   /api/orders/:id
router.get('/:id',                  OrderController.getOne);

// POST  /api/orders                — create new order or quote
router.post('/',                    OrderController.create);

// PATCH /api/orders/:id/confirm    — confirm order → deducts stock + generates invoice
router.patch('/:id/confirm',        OrderController.confirm);

// PATCH /api/orders/:id/status     — update to DISPATCHED, COMPLETE, CANCELLED
router.patch('/:id/status',         OrderController.updateStatus);

module.exports = router;