const express             = require('express');
const router              = express.Router();
const SupplierController  = require('../controllers/supplierController');
const { protect }         = require('../middleware/authMiddleware');
const { requireAdmin }    = require('../middleware/roleMiddleware');

// All supplier routes require login
router.use(protect);

// GET    /api/suppliers
router.get('/',     SupplierController.getAll);

// GET    /api/suppliers/:id
router.get('/:id',  SupplierController.getOne);

// POST   /api/suppliers        — admin only
router.post('/',    requireAdmin, SupplierController.create);

// PUT    /api/suppliers/:id    — admin only
router.put('/:id',  requireAdmin, SupplierController.update);

// DELETE /api/suppliers/:id   — admin only (soft delete)
router.delete('/:id', requireAdmin, SupplierController.deactivate);

module.exports = router;