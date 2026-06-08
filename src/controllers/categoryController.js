const CategoryModel = require('../models/categoryModel');

const CategoryController = {

  // GET /api/categories
  async getAll(req, res, next) {
    try {
      const categories = await CategoryModel.findAll();
      res.json({ success: true, data: categories });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/categories/:id
  async getOne(req, res, next) {
    try {
      const category = await CategoryModel.findById(req.params.id);
      if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
      res.json({ success: true, data: category });
    } catch (err) {
      next(err);
    }
  },

  // POST /api/categories
  async create(req, res, next) {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ success: false, message: 'Category name is required' });

      const category = await CategoryModel.create({ name });
      res.status(201).json({ success: true, data: category });
    } catch (err) {
      // Catch unique constraint violation (duplicate name)
      if (err.code === '23505') {
        return res.status(409).json({ success: false, message: 'Category name already exists' });
      }
      next(err);
    }
  },

  // PUT /api/categories/:id
  async update(req, res, next) {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ success: false, message: 'Category name is required' });

      const category = await CategoryModel.update(req.params.id, { name });
      if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
      res.json({ success: true, data: category });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ success: false, message: 'Category name already exists' });
      }
      next(err);
    }
  },

  // DELETE /api/categories/:id
  async delete(req, res, next) {
    try {
      const category = await CategoryModel.delete(req.params.id);
      if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
      res.json({ success: true, data: category });
    } catch (err) {
      // Catch foreign key violation — category is in use by products
      if (err.code === '23503') {
        return res.status(409).json({ success: false, message: 'Cannot delete — category is used by existing products' });
      }
      next(err);
    }
  },

};

module.exports = CategoryController;