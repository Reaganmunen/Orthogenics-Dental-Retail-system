require('dotenv').config();

const express = require('express');
const path    = require('path');

const app = express();

// ─── Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Static files (HTML pages, JS, CSS) ──────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── API Routes (will be added as we build each module) ───────
// app.use('/api', require('./routes'));

// ─── Catch-all: serve login page for unknown routes ───────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'login.html'));
});

// ─── Global error handler ────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

module.exports = app;