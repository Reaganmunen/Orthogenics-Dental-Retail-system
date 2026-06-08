const { query } = require('./db');

const CategoryModel = {

  async findAll() {
    const { rows } = await query(
      `SELECT * FROM categories ORDER BY name ASC`
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await query(
      `SELECT * FROM categories WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async create({ name }) {
    const { rows } = await query(
      `INSERT INTO categories (name) VALUES ($1) RETURNING *`,
      [name]
    );
    return rows[0];
  },

  async update(id, { name }) {
    const { rows } = await query(
      `UPDATE categories SET name = $1
       WHERE id = $2 RETURNING *`,
      [name, id]
    );
    return rows[0] || null;
  },

  async delete(id) {
    // Only safe if no products are using this category
    const { rows } = await query(
      `DELETE FROM categories WHERE id = $1 RETURNING id, name`,
      [id]
    );
    return rows[0] || null;
  },

};

module.exports = CategoryModel;