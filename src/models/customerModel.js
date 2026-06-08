const { query } = require('./db');

const CustomerModel = {

  async findAll({ type, search } = {}) {
    let sql = `
      SELECT * FROM customers
      WHERE is_active = TRUE
    `;
    const params = [];

    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (name ILIKE $${params.length} OR phone ILIKE $${params.length} OR email ILIKE $${params.length})`;
    }

    sql += ` ORDER BY name ASC`;
    const { rows } = await query(sql, params);
    return rows;
  },

  async findById(id) {
    const { rows } = await query(
      `SELECT * FROM customers WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async create({ name, type, contact_person, phone, email,
                 address, credit_limit, payment_term_days, notes }) {
    const { rows } = await query(
      `INSERT INTO customers
         (name, type, contact_person, phone, email,
          address, credit_limit, payment_term_days, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [name, type || 'CLINIC', contact_person, phone, email,
       address, credit_limit || null, payment_term_days || 0, notes]
    );
    return rows[0];
  },

  async update(id, { name, type, contact_person, phone, email,
                     address, credit_limit, payment_term_days, notes }) {
    const { rows } = await query(
      `UPDATE customers
       SET name             = COALESCE($1,  name),
           type             = COALESCE($2,  type),
           contact_person   = COALESCE($3,  contact_person),
           phone            = COALESCE($4,  phone),
           email            = COALESCE($5,  email),
           address          = COALESCE($6,  address),
           credit_limit     = COALESCE($7,  credit_limit),
           payment_term_days= COALESCE($8,  payment_term_days),
           notes            = COALESCE($9,  notes)
       WHERE id = $10
       RETURNING *`,
      [name, type, contact_person, phone, email,
       address, credit_limit, payment_term_days, notes, id]
    );
    return rows[0] || null;
  },

  async deactivate(id) {
    const { rows } = await query(
      `UPDATE customers SET is_active = FALSE
       WHERE id = $1 RETURNING id, name, is_active`,
      [id]
    );
    return rows[0] || null;
  },

  // Full order + invoice history for a customer
  async getPurchaseHistory(id) {
    const { rows } = await query(
      `SELECT o.id, o.order_number, o.status, o.created_at,
              i.invoice_number, i.total_amount, i.status AS invoice_status,
              i.balance_due
       FROM   orders o
       LEFT JOIN invoices i ON i.order_id = o.id
       WHERE  o.customer_id = $1
       ORDER  BY o.created_at DESC`,
      [id]
    );
    return rows;
  },

};

module.exports = CustomerModel;