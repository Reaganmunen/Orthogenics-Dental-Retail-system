const { query } = require('./db');
const pool      = require('../config/db');

const OrderModel = {

  async findAll({ status, customer_id, is_quote, limit, product_id } = {}) {
    let sql = `
      SELECT o.*,
             c.name AS customer_name,
             u.name AS created_by_name,
             COALESCE(SUM(oi.line_total), 0) AS order_total
      FROM   orders o
      LEFT JOIN customers   c  ON c.id  = o.customer_id
      JOIN     users        u  ON u.id  = o.created_by
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND o.status = $${params.length}`;
    }
    if (customer_id) {
      params.push(customer_id);
      sql += ` AND o.customer_id = $${params.length}`;
    }
    if (is_quote !== undefined) {
      params.push(is_quote);
      sql += ` AND o.is_quote = $${params.length}`;
    }
    if (product_id) {
      params.push(product_id);
      sql += ` AND EXISTS (
        SELECT 1 FROM order_items oi2
        WHERE oi2.order_id = o.id AND oi2.product_id = $${params.length}
      )`;
    }

    sql += ` GROUP BY o.id, c.name, u.name`;
    sql += ` ORDER BY o.created_at DESC`;

    if (limit) {
      params.push(parseInt(limit));
      sql += ` LIMIT $${params.length}`;
    }

    const { rows } = await query(sql, params);
    return rows;
  },

  async findById(id) {
    const { rows } = await query(
      `SELECT o.*,
              c.name AS customer_name,
              c.type AS customer_type,
              c.phone AS customer_phone,
              u.name AS created_by_name
       FROM   orders o
       LEFT JOIN customers c ON c.id = o.customer_id
       JOIN  users u ON u.id = o.created_by
       WHERE  o.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  // Create order + its line items in one transaction
  async create({ customer_id, is_quote = false, notes, created_by, items }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Generate order number using DB function
      const { rows: numRows } = await client.query(`SELECT next_order_number() AS order_number`);
      const order_number = numRows[0].order_number;

      const { rows: orderRows } = await client.query(
        `INSERT INTO orders (order_number, customer_id, is_quote, notes, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [order_number, customer_id || null, is_quote, notes || null, created_by]
      );
      const order = orderRows[0];

      // Insert each line item
      for (const item of items) {
        // Fetch current price floors from products table
        const { rows: prodRows } = await client.query(
          `SELECT buying_price, min_selling_price FROM products WHERE id = $1`,
          [item.product_id]
        );
        if (!prodRows[0]) throw new Error(`Product ${item.product_id} not found`);

        const { buying_price, min_selling_price } = prodRows[0];

        if (item.selling_price < min_selling_price) {
          throw new Error(
            `Selling price for product ${item.product_id} cannot be below minimum (${min_selling_price})`
          );
        }

        await client.query(
          `INSERT INTO order_items
             (order_id, product_id, quantity, buying_price, min_selling_price, selling_price)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [order.id, item.product_id, item.quantity,
           buying_price, min_selling_price, item.selling_price]
        );
      }

      await client.query('COMMIT');
      return order;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // Confirming an order deducts stock (handled by DB trigger trg_order_confirmed)
  // and auto-generates an invoice
  async confirm(id, created_by) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update order status → DB trigger reduces stock automatically
      const { rows: orderRows } = await client.query(
        `UPDATE orders SET status = 'CONFIRMED'
         WHERE id = $1 AND status = 'PENDING'
         RETURNING *`,
        [id]
      );
      if (!orderRows[0]) throw new Error('Order not found or already confirmed');
      const order = orderRows[0];

      // Calculate totals from order items
      const { rows: totals } = await client.query(
        `SELECT COALESCE(SUM(line_total), 0) AS subtotal
         FROM order_items WHERE order_id = $1`,
        [id]
      );
      const subtotal = parseFloat(totals[0].subtotal);
      const tax_rate = 0;                          // set to 16 for VAT when ready
      const tax_amount = subtotal * (tax_rate / 100);
      const total_amount = subtotal + tax_amount;

      // Generate invoice number
      const { rows: invNum } = await client.query(`SELECT next_invoice_number() AS inv`);
      const invoice_number = invNum[0].inv;

      // Payment term from customer (or default 0 days = due immediately)
      const { rows: custRows } = await client.query(
        `SELECT payment_term_days FROM customers WHERE id = $1`,
        [order.customer_id]
      );
      const term_days = custRows[0]?.payment_term_days || 0;

      const { rows: invRows } = await client.query(
        `INSERT INTO invoices
           (invoice_number, subtotal, tax_rate, tax_amount,
            total_amount, due_date, order_id)
         VALUES ($1, $2, $3, $4, $5,
                 CURRENT_DATE + $6::INT * INTERVAL '1 day', $7)
         RETURNING *`,
        [invoice_number, subtotal, tax_rate, tax_amount,
         total_amount, term_days, id]
      );

      await client.query('COMMIT');
      return { order, invoice: invRows[0] };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async updateStatus(id, status) {
    const { rows } = await query(
      `UPDATE orders SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );
    return rows[0] || null;
  },

};

module.exports = OrderModel;