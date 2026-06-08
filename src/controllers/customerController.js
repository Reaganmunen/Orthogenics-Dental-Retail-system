const CustomerModel = require('../models/customerModel');

const CustomerController = {

  // GET /api/customers?type=CLINIC&search=
  async getAll(req, res, next) {
    try {
      const { type, search } = req.query;
      const customers = await CustomerModel.findAll({ type, search });
      res.json({ success: true, data: customers });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/customers/:id
  async getOne(req, res, next) {
    try {
      const customer = await CustomerModel.findById(req.params.id);
      if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
      res.json({ success: true, data: customer });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/customers/:id/history
  async getHistory(req, res, next) {
    try {
      const customer = await CustomerModel.findById(req.params.id);
      if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

      const history = await CustomerModel.getPurchaseHistory(req.params.id);
      res.json({ success: true, data: history });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/customers
  async create(req, res, next) {
    try {
      const { name, type } = req.body;
      if (!name) return res.status(400).json({ success: false, message: 'Customer name is required' });

      const validTypes = ['CLINIC', 'STUDENT', 'WALK_IN'];
      if (type && !validTypes.includes(type)) {
        return res.status(400).json({ success: false, message: `type must be one of: ${validTypes.join(', ')}` });
      }

      const customer = await CustomerModel.create(req.body);
      res.status(201).json({ success: true, data: customer });
    } catch (err) {
      next(err);
    }
  },

  // PUT /api/customers/:id
  async update(req, res, next) {
    try {
      const customer = await CustomerModel.update(req.params.id, req.body);
      if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
      res.json({ success: true, data: customer });
    } catch (err) {
      next(err);
    }
  },

  // DELETE /api/customers/:id  (soft delete)
  async deactivate(req, res, next) {
    try {
      const customer = await CustomerModel.deactivate(req.params.id);
      if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
      res.json({ success: true, data: customer });
    } catch (err) {
      next(err);
    }
  },

};

module.exports = CustomerController;