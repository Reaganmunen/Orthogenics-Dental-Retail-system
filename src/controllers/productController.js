const ProductModel = require('../models/productModel');

const ProductController = {

  // GET /api/products?category_id=&supplier_id=&search=
  async getAll(req, res, next) {
    try {
      const { category_id, supplier_id, search } = req.query;
      const products = await ProductModel.findAll({ category_id, supplier_id, search });
      res.json({ success: true, data: products });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/products/low-stock
  async getLowStock(req, res, next) {
    try {
      const products = await ProductModel.getLowStock();
      res.json({ success: true, data: products });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/products/:id
  async getOne(req, res, next) {
    try {
      const product = await ProductModel.findById(req.params.id);
      if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
      res.json({ success: true, data: product });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/products
  async create(req, res, next) {
    try {
      const {
        name, brand, sku, barcode, unit_of_measure,
        buying_price, min_selling_price, reorder_point,
        tracks_expiry, supplier_id, category_id,
      } = req.body;

      // Required field validation
      if (!name || buying_price == null || min_selling_price == null || !supplier_id || !category_id) {
        return res.status(400).json({
          success: false,
          message: 'name, buying_price, min_selling_price, supplier_id and category_id are required',
        });
      }

      if (parseFloat(min_selling_price) < parseFloat(buying_price)) {
        return res.status(400).json({
          success: false,
          message: 'Minimum selling price cannot be less than buying price',
        });
      }

      const product = await ProductModel.create({
        name, brand, sku, barcode, unit_of_measure,
        buying_price, min_selling_price, reorder_point,
        tracks_expiry, supplier_id, category_id,
      });

      res.status(201).json({ success: true, data: product });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ success: false, message: 'SKU or barcode already exists' });
      }
      next(err);
    }
  },

  // PUT /api/products/:id
  async update(req, res, next) {
    try {
      const { buying_price, min_selling_price } = req.body;

      // If both prices are provided, validate the floor
      if (buying_price != null && min_selling_price != null) {
        if (parseFloat(min_selling_price) < parseFloat(buying_price)) {
          return res.status(400).json({
            success: false,
            message: 'Minimum selling price cannot be less than buying price',
          });
        }
      }

      const product = await ProductModel.update(req.params.id, req.body);
      if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
      res.json({ success: true, data: product });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ success: false, message: 'SKU or barcode already exists' });
      }
      next(err);
    }
  },

  // DELETE /api/products/:id  (soft delete)
  async deactivate(req, res, next) {
    try {
      const product = await ProductModel.deactivate(req.params.id);
      if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
      res.json({ success: true, data: product });
    } catch (err) {
      next(err);
    }
  },

};

module.exports = ProductController;