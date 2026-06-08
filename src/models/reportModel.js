const { query } = require('./db');

const ReportModel = {

  // Sales by product within a date range
  async salesByProduct({ from, to }) {
    const { rows } = await query(
      `SELECT p.id, p.name, p.sku,
              SUM(oi.quantity)              AS units_sold,
              SUM(oi.line_total)            AS revenue,
              SUM(oi.buying_price * oi.quantity) AS cost,
              SUM(oi.line_total) - SUM(oi.buying_price * oi.quantity) AS profit
       FROM   order_items oi
       JOIN   products p ON p.id = oi.product_id
       JOIN   orders   o ON o.id = oi.order_id
       WHERE  o.status NOT IN ('CANCELLED')
         AND  o.created_at::DATE BETWEEN $1 AND $2
       GROUP  BY p.id, p.name, p.sku
       ORDER  BY revenue DESC`,
      [from, to]
    );
    return rows;
  },

  // Daily revenue totals within a date range
  async revenueByDay({ from, to }) {
    const { rows } = await query(
      `SELECT o.created_at::DATE AS sale_date,
              COUNT(DISTINCT o.id)           AS order_count,
              SUM(oi.line_total)             AS revenue,
              SUM(oi.buying_price * oi.quantity) AS cost,
              SUM(oi.line_total) - SUM(oi.buying_price * oi.quantity) AS profit
       FROM   orders o
       JOIN   order_items oi ON oi.order_id = o.id
       WHERE  o.status NOT IN ('CANCELLED')
         AND  o.created_at::DATE BETWEEN $1 AND $2
       GROUP  BY sale_date
       ORDER  BY sale_date ASC`,
      [from, to]
    );
    return rows;
  },

  // Products with zero sales in the last N days (dead stock)
  async deadStock(days = 90) {
    const { rows } = await query(
      `SELECT p.id, p.name, p.sku, p.current_stock,
              p.unit_of_measure, p.buying_price,
              (p.current_stock * p.buying_price) AS stock_value,
              MAX(o.created_at) AS last_sold_at
       FROM   products p
       LEFT JOIN order_items oi ON oi.product_id = p.id
       LEFT JOIN orders o ON o.id = oi.order_id
         AND o.status NOT IN ('CANCELLED')
         AND o.created_at >= NOW() - $1::INT * INTERVAL '1 day'
       WHERE  p.is_active = TRUE
         AND  p.current_stock > 0
       GROUP  BY p.id
       HAVING MAX(o.created_at) IS NULL
       ORDER  BY stock_value DESC`,
      [days]
    );
    return rows;
  },

  // Outstanding invoice summary per customer
  async outstandingByCustomer() {
    const { rows } = await query(
      `SELECT c.id, c.name, c.phone,
              COUNT(i.id)          AS invoice_count,
              SUM(i.balance_due)   AS total_outstanding,
              MIN(i.due_date)      AS oldest_due_date
       FROM   invoices i
       JOIN   orders o ON o.id = i.order_id
       JOIN   customers c ON c.id = o.customer_id
       WHERE  i.status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
       GROUP  BY c.id, c.name, c.phone
       ORDER  BY total_outstanding DESC`
    );
    return rows;
  },

};

module.exports = ReportModel;