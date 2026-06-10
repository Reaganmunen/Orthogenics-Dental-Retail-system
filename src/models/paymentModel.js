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