const { query } = require('./db');

const SupplierModel = {

  async findAll() {
    const { rows } = await query(
      `SELECT * FROM suppliers
       WHERE is_active = TRUE
       ORDER BY name ASC`
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await query(
      `SELECT * FROM suppliers WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async create({ name, contact_name, phone, email, address, notes }) {
    const { rows } = await query(
      `INSERT INTO suppliers (name, contact_name, phone, email, address, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, contact_name, phone, email, address, notes]
    );
    return rows[0];
  },

  async update(id, { name, contact_name, phone, email, address, notes }) {
    const { rows } = await query(
      `UPDATE suppliers
       SET name         = COALESCE($1, name),
           contact_name = COALESCE($2, contact_name),
           phone        = COALESCE($3, phone),
           email        = COALESCE($4, email),
           address      = COALESCE($5, address),
           notes        = COALESCE($6, notes)
       WHERE id = $7
       RETURNING *`,
      [name, contact_name, phone, email, address, notes, id]
    );
    return rows[0] || null;
  },

  async deactivate(id) {
    const { rows } = await query(
      `UPDATE suppliers SET is_active = FALSE
       WHERE id = $1 RETURNING id, name, is_active`,
      [id]
    );
    return rows[0] || null;
  },

};

module.exports = SupplierModel;