const OrderModel     = require('../models/orderModel');
const OrderItemModel = require('../models/orderItemModel');

const OrderController = {

  // GET /api/orders?status=&customer_id=&is_quote=
  async getAll(req, res, next) {
    try {
      const { status, customer_id, is_quote, limit } = req.query;
      const orders = await OrderModel.findAll({
        status,
        customer_id,
        is_quote: is_quote !== undefined ? is_quote === 'true' : undefined,
        limit:    limit ? parseInt(limit) : undefined,
      });
      res.json({ success: true, data: orders });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/orders/:id
  async getOne(req, res, next) {
    try {
      const order = await OrderModel.findById(req.params.id);
      if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

      // Attach line items
      const items = await OrderItemModel.findByOrder(order.id);
      res.json({ success: true, data: { ...order, items } });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/orders
  async create(req, res, next) {
    try {
      const { customer_id, is_quote, notes, items } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Order must have at least one item' });
      }

      // Validate each line item has the required fields
      for (const item of items) {
        if (!item.product_id || !item.quantity || item.selling_price == null) {
          return res.status(400).json({
            success: false,
            message: 'Each item requires product_id, quantity and selling_price',
          });
        }
        if (parseInt(item.quantity) <= 0) {
          return res.status(400).json({ success: false, message: 'Item quantity must be greater than zero' });
        }
      }

      const order = await OrderModel.create({
        customer_id: customer_id || null,
        is_quote:    is_quote || false,
        notes,
        created_by:  req.user.id,
        items,
      });

      res.status(201).json({ success: true, data: order });
    } catch (err) {
      // Price below minimum
      if (err.message.startsWith('Selling price')) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next(err);
    }
  },

  // PATCH /api/orders/:id/confirm
  // Confirms order → deducts stock (DB trigger) → generates invoice
  async confirm(req, res, next) {
    try {
      const result = await OrderModel.confirm(req.params.id, req.user.id);
      res.json({ success: true, data: result });
    } catch (err) {
      if (err.message === 'Order not found or already confirmed') {
        return res.status(400).json({ success: false, message: err.message });
      }
      next(err);
    }
  },

  // PATCH /api/orders/:id/status
  async updateStatus(req, res, next) {
    try {
      const { status } = req.body;
      const validStatuses = ['PENDING', 'CONFIRMED', 'DISPATCHED', 'COMPLETE', 'CANCELLED'];

      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: `status must be one of: ${validStatuses.join(', ')}` });
      }

      const order = await OrderModel.updateStatus(req.params.id, status);
      if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
      res.json({ success: true, data: order });
    } catch (err) {
      next(err);
    }
  },

};

module.exports = OrderController;