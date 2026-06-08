const pool = require('../config/db');

/**
 * Run a single query against the pool.
 * @param {string} text   — SQL string with $1, $2 … placeholders
 * @param {Array}  params — values array (optional)
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = (text, params) => pool.query(text, params);

module.exports = { query };