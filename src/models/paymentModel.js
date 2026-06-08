const { query } = require('./db');

const PaymentModel = {

  async findByInvoice(invoice_id) {
    const { rows } = await query(
      `SELECT p.*, u.name AS recorded_by_name
       FROM   payments p
       JOIN   users u ON u.id = p.recorded_by
       WHERE  p.invoice_id = $1
       ORDER  BY p.confirmed_at ASC`,
      [invoice_id]
    );
    return rows;
  },

  // Record a payment — DB trigger trg_payment_inserted auto-updates invoice
  // amount_paid, status, and paid_at
  async record({ invoice_id, amount, method, reference, notes, recorded_by }) {
    const { rows } = await query(
      `INSERT INTO payments
         (invoice_id, amount, method, reference, notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [invoice_id, amount, method, reference || null, notes || null, recorded_by]
    );
    return rows[0];
  },

};

module.exports = PaymentModel;