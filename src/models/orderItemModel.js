const { query } = require('./db');

const OrderItemModel = {

  async findByOrder(order_id) {
    const { rows } = await query(
      `SELECT oi.*,
              p.name AS product_name,
              p.sku,
              p.unit_of_measure
       FROM   order_items oi
       JOIN   products p ON p.id = oi.product_id
       WHERE  oi.order_id = $1
       ORDER  BY oi.id ASC`,
      [order_id]
    );
    return rows;
  },

};

module.exports = OrderItemModel;