require('dotenv').config();

const express      = require('express');
const path         = require('path');
const mainRoutes   = require('./routes/mainRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ─── Core middleware ──────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Static files (HTML pages, JS, CSS) ──────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));
// ─── Disable caching for all API responses ───────────────────
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });


// ─── All API routes live under /api ──────────────────────────
app.use('/api', mainRoutes);

// ─── Catch-all: serve login page for any non-API route ───────
app.get('*splat', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'Route not found' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'login.html'));
});

// ─── Global error handler (must be last) ─────────────────────
app.use(errorHandler);

module.exports = app;