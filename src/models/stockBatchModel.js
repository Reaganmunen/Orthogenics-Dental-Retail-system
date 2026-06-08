const { query } = require('./db');
const pool      = require('../config/db');
const ProductModel = require('./product.model');

const StockBatchModel = {

  async findByProduct(product_id) {
    const { rows } = await query(
      `SELECT * FROM stock_batches
       WHERE product_id = $1
       ORDER BY received_at DESC`,
      [product_id]
    );
    return rows;
  },

  // Receive a new delivery — inserts batch AND increases product stock
  // Wrapped in a transaction so both succeed or both fail
  async receive({ product_id, quantity, expiry_date, delivery_note }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO stock_batches
           (product_id, quantity, expiry_date, delivery_note)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [product_id, quantity, expiry_date || null, delivery_note || null]
      );

      await client.query(
        `UPDATE products
         SET current_stock = current_stock + $1
         WHERE id = $2`,
        [quantity, product_id]
      );

      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // Products whose expiry date falls within the next N days
  async expiringSoon(days = 30) {
    const { rows } = await query(
      `SELECT sb.*, p.name AS product_name, p.sku
       FROM   stock_batches sb
       JOIN   products p ON p.id = sb.product_id
       WHERE  sb.expiry_date IS NOT NULL
         AND  sb.expiry_date <= CURRENT_DATE + $1::INT * INTERVAL '1 day'
         AND  sb.expiry_date >= CURRENT_DATE
       ORDER  BY sb.expiry_date ASC`,
      [days]
    );
    return rows;
  },

};

module.exports = StockBatchModel;