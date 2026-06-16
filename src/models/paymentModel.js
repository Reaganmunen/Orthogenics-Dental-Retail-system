const { query } = require('./db');

// ─── PaymentModel ─────────────────────────────────────────────────────────────

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

  async findAll({ method, from, to, limit = 500 } = {}) {
    let sql = `
      SELECT p.*,
             u.name          AS recorded_by_name,
             i.invoice_number,
             i.status        AS invoice_status,
             c.name          AS customer_name,
             c.phone         AS customer_phone
      FROM   payments p
      JOIN   users u     ON u.id = p.recorded_by
      JOIN   invoices i  ON i.id = p.invoice_id
      JOIN   orders o    ON o.id = i.order_id
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE  1=1
    `;
    const params = [];

    if (method) {
      params.push(method);
      sql += ` AND p.method = $${params.length}`;
    }

    if (from) {
      params.push(from);
      sql += ` AND (p.confirmed_at AT TIME ZONE 'Africa/Nairobi')::date >= $${params.length}`;
    }

    if (to) {
      params.push(to);
      sql += ` AND (p.confirmed_at AT TIME ZONE 'Africa/Nairobi')::date <= $${params.length}`;
    }

    params.push(parseInt(limit, 10));
    sql += ` ORDER BY p.confirmed_at DESC LIMIT $${params.length}`;

    const { rows } = await query(sql, params);
    return rows;
  },

  // Record a payment — DB trigger trg_payment_inserted auto-updates invoice
  // amount_paid, status, and paid_at.
  // ON CONFLICT guard prevents double-recording if both the C2B callback and
  // a manual submission race for the same reference.
  async record({ invoice_id, amount, method, reference, notes, recorded_by }) {
    const { rows } = await query(
      `INSERT INTO payments (invoice_id, amount, method, reference, notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (invoice_id, reference) WHERE reference IS NOT NULL DO NOTHING
       RETURNING *`,
      [invoice_id, amount, method, reference || null, notes || null, recorded_by]
    );
    return rows[0] || null;
  },

};

// ─── C2bPaymentModel ──────────────────────────────────────────────────────────
//
// Stores every inbound C2B (Buy Goods) transaction from Safaricom.
// Serves two purposes:
//   1. Idempotency — prevents double-processing if Daraja retries the callback.
//   2. Reconciliation — unmatched rows (invoice_id IS NULL) appear in the
//      admin "Unmatched Payments" view for manual linking.

const C2bPaymentModel = {

  // Insert a new C2B transaction row.
  // ON CONFLICT DO NOTHING on trans_id (unique) gives idempotency.
  async create({ trans_id, invoice_id, amount, phone, bill_ref, customer_name, raw_payload }) {
    const { rows } = await query(
      `INSERT INTO c2b_payments
         (trans_id, invoice_id, amount, phone, bill_ref, customer_name, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (trans_id) DO NOTHING
       RETURNING *`,
      [trans_id, invoice_id || null, amount, phone || null, bill_ref || null, customer_name || null, raw_payload || null]
    );
    return rows[0] || null;
  },

  async findById(id) {
    const { rows } = await query(
      `SELECT * FROM c2b_payments WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  // Used by the status-poll endpoint to check for the most recent payment
  // on a given invoice since the customer went to pay.
  async findLatestByInvoice(invoice_id) {
    const { rows } = await query(
      `SELECT * FROM c2b_payments
       WHERE invoice_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [invoice_id]
    );
    return rows[0] || null;
  },

  // Returns unmatched transactions (no invoice linked) for admin reconciliation.
  async findUnmatched() {
    const { rows } = await query(
      `SELECT * FROM c2b_payments
       WHERE invoice_id IS NULL
       ORDER BY created_at DESC
       LIMIT 200`
    );
    return rows;
  },

  // Manually link an unmatched transaction to an invoice.
  async linkToInvoice({ c2b_id, invoice_id }) {
    const { rows } = await query(
      `UPDATE c2b_payments
       SET invoice_id = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [invoice_id, c2b_id]
    );
    return rows[0] || null;
  },

};

module.exports = { PaymentModel, C2bPaymentModel };