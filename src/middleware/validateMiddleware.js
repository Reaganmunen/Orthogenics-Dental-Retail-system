// Lightweight validation helpers — no external library needed
// Usage: router.post('/', validate(rules.createProduct), controller.create)

const validate = (rules) => {
  return (req, res, next) => {
    const errors = [];

    for (const [field, checks] of Object.entries(rules)) {
      const value = req.body[field];

      // required
      if (checks.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue; // skip further checks on this field if missing
      }

      // Skip remaining checks if field is optional and not provided
      if (value === undefined || value === null || value === '') continue;

      // type check
      if (checks.type === 'number' && isNaN(parseFloat(value))) {
        errors.push(`${field} must be a number`);
      }
      if (checks.type === 'integer' && !Number.isInteger(Number(value))) {
        errors.push(`${field} must be an integer`);
      }
      if (checks.type === 'boolean' && typeof value !== 'boolean') {
        errors.push(`${field} must be true or false`);
      }

      // min value
      if (checks.min !== undefined && parseFloat(value) < checks.min) {
        errors.push(`${field} must be at least ${checks.min}`);
      }

      // max length
      if (checks.maxLength && String(value).length > checks.maxLength) {
        errors.push(`${field} must not exceed ${checks.maxLength} characters`);
      }

      // allowed enum values
      if (checks.enum && !checks.enum.includes(value)) {
        errors.push(`${field} must be one of: ${checks.enum.join(', ')}`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    next();
  };
};

// ─── Reusable rule sets ──────────────────────────────────────────

const rules = {

  login: {
    email:    { required: true, maxLength: 150 },
    password: { required: true },
  },

  createProduct: {
    name:              { required: true, maxLength: 250 },
    buying_price:      { required: true, type: 'number', min: 0 },
    min_selling_price: { required: true, type: 'number', min: 0 },
    reorder_point:     { type: 'integer', min: 0 },
    supplier_id:       { required: true, type: 'integer' },
    category_id:       { required: true, type: 'integer' },
  },

  createCustomer: {
    name: { required: true, maxLength: 200 },
    type: { enum: ['CLINIC', 'STUDENT', 'WALK_IN'] },
    payment_term_days: { type: 'integer', min: 0 },
    credit_limit:      { type: 'number',  min: 0 },
  },

  createOrder: {
    // items array is validated manually in the controller
  },

  recordPayment: {
    invoice_id: { required: true, type: 'integer' },
    amount:     { required: true, type: 'number', min: 0.01 },
    method:     { required: true, enum: ['MPESA', 'CASH', 'BANK_TRANSFER'] },
  },

  receiveBatch: {
    product_id: { required: true, type: 'integer' },
    quantity:   { required: true, type: 'integer', min: 1 },
  },

  stockAdjust: {
    product_id: { required: true, type: 'integer' },
    quantity:   { required: true, type: 'integer' },
    reason:     {
      required: true,
      enum: ['DAMAGED', 'EXPIRED', 'LOST', 'SAMPLE_GIVEN', 'COUNT_CORRECTION', 'OTHER'],
    },
  },

};

module.exports = { validate, rules };