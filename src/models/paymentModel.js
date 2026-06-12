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

  // GET /api/payments — list all payments with filters
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
  // amount_paid, status, and paid_at
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

// ─── STK Push Requests ───────────────────────────────────────────────────────

const StkPushModel = {

  // Save a new STK push request (called right after Daraja responds)
  async create({ checkout_request_id, invoice_id, amount, phone }) {
    const { rows } = await query(
      `INSERT INTO stk_push_requests
         (checkout_request_id, invoice_id, amount, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [checkout_request_id, invoice_id, amount, phone]
    );
    return rows[0];
  },

  // Find by CheckoutRequestID — used by callback and status poll
  async findByCheckoutRequestId(checkout_request_id) {
    const { rows } = await query(
      `SELECT * FROM stk_push_requests WHERE checkout_request_id = $1`,
      [checkout_request_id]
    );
    return rows[0] || null;
  },

  // Mark as COMPLETED when callback arrives with ResultCode 0
  async markCompleted({ checkout_request_id, mpesa_ref }) {
    const { rows } = await query(
      `UPDATE stk_push_requests
       SET status     = 'COMPLETED',
           mpesa_ref  = $1,
           updated_at = NOW()
       WHERE checkout_request_id = $2
       RETURNING *`,
      [mpesa_ref, checkout_request_id]
    );
    return rows[0] || null;
  },

  // Mark as FAILED when callback arrives with non-zero ResultCode, or on timeout
  async markFailed({ checkout_request_id, message }) {
    const { rows } = await query(
      `UPDATE stk_push_requests
       SET status     = 'FAILED',
           message    = $1,
           updated_at = NOW()
       WHERE checkout_request_id = $2
       RETURNING *`,
      [message, checkout_request_id]
    );
    return rows[0] || null;
  },

};

module.exports = { PaymentModel, StkPushModel };