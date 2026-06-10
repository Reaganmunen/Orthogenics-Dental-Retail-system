const express              = require('express');
const router               = express.Router();
const CategoryController   = require('../controllers/categoryController');
const { protect }          = require('../middleware/authMiddleware');
const { requireAdmin }     = require('../middleware/roleMiddleware');

router.use(protect);

// GET    /api/categories
router.get('/',     CategoryController.getAll);

// GET    /api/categories/:id
router.get('/:id',  CategoryController.getOne);

// POST   /api/categories       — admin only
router.post('/',    requireAdmin, CategoryController.create);

// PUT    /api/categories/:id   — admin only
router.put('/:id',  requireAdmin, CategoryController.update);

// DELETE /api/categories/:id  — admin only
router.delete('/:id', requireAdmin, CategoryController.delete);

module.exports = router;