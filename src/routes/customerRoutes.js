const express             = require('express');
const router              = express.Router();
const CustomerController  = require('../controllers/customerController');
const { protect }         = require('../middleware/authMiddleware');
const { requireAdmin }    = require('../middleware/roleMiddleware');
const { validate, rules } = require('../middleware/validateMiddleware');

router.use(protect);

// GET    /api/customers?type=CLINIC&search=
router.get('/',               CustomerController.getAll);

// GET    /api/customers/:id
router.get('/:id',            CustomerController.getOne);

// GET    /api/customers/:id/history
router.get('/:id/history',    CustomerController.getHistory);

// POST   /api/customers
router.post('/',  validate(rules.createCustomer), CustomerController.create);

// PUT    /api/customers/:id
router.put('/:id',            CustomerController.update);

// DELETE /api/customers/:id   — admin only (soft delete)
router.delete('/:id', requireAdmin, CustomerController.deactivate);

module.exports = router;