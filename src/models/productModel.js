const { query } = require('./db');

const ProductModel = {

  async findAll({ category_id, supplier_id, search } = {}) {
    let sql = `
      SELECT p.*,
             s.name AS supplier_name,
             c.name AS category_name
      FROM   products p
      JOIN   suppliers  s ON s.id = p.supplier_id
      JOIN   categories c ON c.id = p.category_id
      WHERE  p.is_active = TRUE
    `;
    const params = [];

    if (category_id) {
      params.push(category_id);
      sql += ` AND p.category_id = $${params.length}`;
    }
    if (supplier_id) {
      params.push(supplier_id);
      sql += ` AND p.supplier_id = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`;
    }

    sql += ` ORDER BY p.name ASC`;

    const { rows } = await query(sql, params);
    return rows;
  },

  async findById(id) {
    const { rows } = await query(
      `SELECT p.*,
              s.name AS supplier_name,
              c.name AS category_name
       FROM   products p
       JOIN   suppliers  s ON s.id = p.supplier_id
       JOIN   categories c ON c.id = p.category_id
       WHERE  p.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async create({ name, brand, sku, barcode, unit_of_measure, buying_price,
                 min_selling_price, reorder_point, tracks_expiry,
                 supplier_id, category_id }) {
    const { rows } = await query(
      `INSERT INTO products
         (name, brand, sku, barcode, unit_of_measure,
          buying_price, min_selling_price, reorder_point,
          tracks_expiry, supplier_id, category_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [name, brand, sku, barcode, unit_of_measure,
       buying_price, min_selling_price, reorder_point,
       tracks_expiry, supplier_id, category_id]
    );
    return rows[0];
  },

  async update(id, fields) {
    const { name, brand, sku, barcode, unit_of_measure,
            buying_price, min_selling_price, reorder_point,
            tracks_expiry, supplier_id, category_id } = fields;

    const { rows } = await query(
      `UPDATE products
       SET name              = COALESCE($1,  name),
           brand             = COALESCE($2,  brand),
           sku               = COALESCE($3,  sku),
           barcode           = COALESCE($4,  barcode),
           unit_of_measure   = COALESCE($5,  unit_of_measure),
           buying_price      = COALESCE($6,  buying_price),
           min_selling_price = COALESCE($7,  min_selling_price),
           reorder_point     = COALESCE($8,  reorder_point),
           tracks_expiry     = COALESCE($9,  tracks_expiry),
           supplier_id       = COALESCE($10, supplier_id),
           category_id       = COALESCE($11, category_id)
       WHERE id = $12
       RETURNING *`,
      [name, brand, sku, barcode, unit_of_measure,
       buying_price, min_selling_price, reorder_point,
       tracks_expiry, supplier_id, category_id, id]
    );
    return rows[0] || null;
  },

  async deactivate(id) {
    const { rows } = await query(
      `UPDATE products SET is_active = FALSE
       WHERE id = $1 RETURNING id, name, is_active`,
      [id]
    );
    return rows[0] || null;
  },

  // Called by stock model after receiving a batch or adjustment
  async adjustStock(id, quantity, client = null) {
    const runner = client || { query: (t, p) => query(t, p) };
    const { rows } = await runner.query(
      `UPDATE products
       SET current_stock = current_stock + $1
       WHERE id = $2
       RETURNING id, name, current_stock, reorder_point`,
      [quantity, id]
    );
    return rows[0] || null;
  },

  // Returns all products whose stock is at or below their reorder point
  async getLowStock() {
    const { rows } = await query(
      `SELECT p.id, p.name, p.sku, p.current_stock, p.reorder_point,
              p.unit_of_measure, s.name AS supplier_name
       FROM   products p
       JOIN   suppliers s ON s.id = p.supplier_id
       WHERE  p.is_active = TRUE
         AND  p.current_stock <= p.reorder_point
       ORDER  BY (p.current_stock - p.reorder_point) ASC`
    );
    return rows;
  },

};

module.exports = ProductModel;