const { query } = require('./db');
const pool      = require('../config/db');

const StockAdjustmentModel = {

  async findByProduct(product_id) {
    const { rows } = await query(
      `SELECT sa.*, u.name AS recorded_by_name
       FROM   stock_adjustments sa
       LEFT JOIN users u ON u.id = sa.created_by
       WHERE  sa.product_id = $1
       ORDER  BY sa.created_at DESC`,
      [product_id]
    );
    return rows;
  },

  // Manually add or remove stock with a reason
  // quantity is positive (add) or negative (remove)
  async adjust({ product_id, quantity, reason, notes, created_by }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check stock won't go negative for removals
      if (quantity < 0) {
        const { rows } = await client.query(
          `SELECT current_stock FROM products WHERE id = $1`,
          [product_id]
        );
        if (!rows[0]) throw new Error('Product not found');
        if (rows[0].current_stock + quantity < 0) {
          throw new Error(
            `Cannot remove ${Math.abs(quantity)} units — only ${rows[0].current_stock} in stock`
          );
        }
      }

      const { rows } = await client.query(
        `INSERT INTO stock_adjustments
           (product_id, quantity, reason, notes, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [product_id, quantity, reason, notes || null, created_by]
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

};

module.exports = StockAdjustmentModel;