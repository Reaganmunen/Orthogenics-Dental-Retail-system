const { query } = require('./db');

const InvoiceModel = {

  async findAll({ status, search } = {}) {
    let sql = `
      SELECT i.*,
             c.name  AS customer_name,
             c.phone AS customer_phone,
             o.order_number
      FROM   invoices i
      JOIN   orders o ON o.id = i.order_id
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND i.status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (i.invoice_number ILIKE $${params.length} OR c.name ILIKE $${params.length})`;
    }

    sql += ` ORDER BY i.issued_at DESC`;
    const { rows } = await query(sql, params);
    return rows;
  },

  async findById(id) {
    const { rows } = await query(
      `SELECT i.*,
              c.name    AS customer_name,
              c.address AS customer_address,
              c.phone   AS customer_phone,
              c.email   AS customer_email,
              o.order_number
       FROM   invoices i
       JOIN   orders o ON o.id = i.order_id
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE  i.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async findByOrder(order_id) {
    const { rows } = await query(
      `SELECT * FROM invoices WHERE order_id = $1`,
      [order_id]
    );
    return rows[0] || null;
  },

  // Mark all unpaid invoices past their due date as OVERDUE
  async markOverdue() {
    const { rows } = await query(
      `UPDATE invoices
       SET status = 'OVERDUE'
       WHERE status IN ('UNPAID', 'PARTIAL')
         AND due_date < CURRENT_DATE
       RETURNING id, invoice_number, due_date`
    );
    return rows;
  },

  async listOverdue() {
    const { rows } = await query(
      `SELECT i.*,
              c.name  AS customer_name,
              c.phone AS customer_phone
       FROM   invoices i
       JOIN   orders o ON o.id = i.order_id
       LEFT JOIN customers c ON c.id = o.customer_id
       WHERE  i.status IN ('OVERDUE', 'UNPAID', 'PARTIAL')
         AND  i.due_date < CURRENT_DATE
       ORDER  BY i.due_date ASC`
    );
    return rows;
  },

};

module.exports = InvoiceModel;