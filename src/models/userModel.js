const { query } = require('./db');
const bcrypt    = require('bcryptjs');

const UserModel = {

  async findAll() {
    const { rows } = await query(
      `SELECT id, name, email, role, is_active, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await query(
      `SELECT id, name, email, role, is_active, created_at
       FROM users WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async findByEmail(email) {
    // includes password_hash — used only for login
    const { rows } = await query(
      `SELECT * FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );
    return rows[0] || null;
  },

  async create({ name, email, password, role = 'STAFF' }) {
    const password_hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, is_active, created_at`,
      [name, email.toLowerCase(), password_hash, role]
    );
    return rows[0];
  },

  async update(id, { name, email, role }) {
    const { rows } = await query(
      `UPDATE users
       SET name  = COALESCE($1, name),
           email = COALESCE($2, email),
           role  = COALESCE($3, role)
       WHERE id = $4
       RETURNING id, name, email, role, is_active, created_at`,
      [name, email?.toLowerCase(), role, id]
    );
    return rows[0] || null;
  },

  async changePassword(id, newPassword) {
    const password_hash = await bcrypt.hash(newPassword, 10);
    const { rows } = await query(
      `UPDATE users SET password_hash = $1
       WHERE id = $2
       RETURNING id`,
      [password_hash, id]
    );
    return rows[0] || null;
  },

  async toggleActive(id) {
    const { rows } = await query(
      `UPDATE users
       SET is_active = NOT is_active
       WHERE id = $1
       RETURNING id, name, is_active`,
      [id]
    );
    return rows[0] || null;
  },

  async verifyPassword(plainText, hash) {
    return bcrypt.compare(plainText, hash);
  },

};

module.exports = UserModel;