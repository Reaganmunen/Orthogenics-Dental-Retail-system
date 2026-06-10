const express             = require('express');
const router              = express.Router();
const ProductController   = require('../controllers/productController');
const { protect }         = require('../middleware/authMiddleware');
const { requireAdmin }    = require('../middleware/roleMiddleware');
const { validate, rules } = require('../middleware/validateMiddleware');

router.use(protect);

// GET  /api/products/low-stock  — must be before /:id so it isn't swallowed
router.get('/low-stock', ProductController.getLowStock);

// GET  /api/products?category_id=&supplier_id=&search=
router.get('/',     ProductController.getAll);

// GET  /api/products/:id
router.get('/:id',  ProductController.getOne);

// POST /api/products            — admin only
router.post('/',    requireAdmin, validate(rules.createProduct), ProductController.create);

// PUT  /api/products/:id        — admin only
router.put('/:id',  requireAdmin, ProductController.update);

// DELETE /api/products/:id     — admin only (soft delete)
router.delete('/:id', requireAdmin, ProductController.deactivate);

module.exports = router;