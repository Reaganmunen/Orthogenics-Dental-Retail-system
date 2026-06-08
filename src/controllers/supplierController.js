const SupplierModel = require('../models/supplierModel');

const SupplierController = {

  // GET /api/suppliers
  async getAll(req, res, next) {
    try {
      const suppliers = await SupplierModel.findAll();
      res.json({ success: true, data: suppliers });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/suppliers/:id
  async getOne(req, res, next) {
    try {
      const supplier = await SupplierModel.findById(req.params.id);
      if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
      res.json({ success: true, data: supplier });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/suppliers
  async create(req, res, next) {
    try {
      const { name, contact_name, phone, email, address, notes } = req.body;
      if (!name) return res.status(400).json({ success: false, message: 'Supplier name is required' });

      const supplier = await SupplierModel.create({ name, contact_name, phone, email, address, notes });
      res.status(201).json({ success: true, data: supplier });
    } catch (err) {
      next(err);
    }
  },

  // PUT /api/suppliers/:id
  async update(req, res, next) {
    try {
      const supplier = await SupplierModel.update(req.params.id, req.body);
      if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
      res.json({ success: true, data: supplier });
    } catch (err) {
      next(err);
    }
  },

  // DELETE /api/suppliers/:id
  async deactivate(req, res, next) {
    try {
      const supplier = await SupplierModel.deactivate(req.params.id);
      if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
      res.json({ success: true, data: supplier });
    } catch (err) {
      next(err);
    }
  },

};

module.exports = SupplierController;