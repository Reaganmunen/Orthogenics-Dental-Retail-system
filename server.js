require('dotenv').config();

const app  = require('./src/app');
const pool = require('./src/config/db');

const PORT = process.env.APP_PORT || 3000;

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Database connection verified');

    app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`📦 Environment : ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️  Database    : ${process.env.DB_NAME} on port ${process.env.DB_PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to connect to database:', err.message);
    console.error('   Check your .env DB_* values and that pgAdmin 4 is running on port 5433');
    process.exit(1);
  }
}

// ✅ Only run local server when NOT on Vercel
if (process.env.NODE_ENV !== 'production') {
  start();
}

// ✅ Export app for Vercel serverless runtime
module.exports = app;