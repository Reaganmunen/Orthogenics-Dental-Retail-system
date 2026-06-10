// Central error handler — must be the LAST middleware registered in app.js
// Express identifies it by the 4-argument signature (err, req, res, next)

const errorHandler = (err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} —`, err.message);

  // PostgreSQL error codes
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      message: 'A record with that value already exists',
      detail:  err.detail || null,
    });
  }

  if (err.code === '23503') {
    return res.status(409).json({
      success: false,
      message: 'Cannot complete — a related record is still in use',
      detail:  err.detail || null,
    });
  }

  if (err.code === '23514') {
    // Check constraint violation — e.g. selling_price < min_selling_price
    return res.status(400).json({
      success: false,
      message: 'A value failed a database constraint check',
      detail:  err.detail || null,
    });
  }

  if (err.code === '22P02') {
    // Invalid input syntax — e.g. passing a string where an integer is expected
    return res.status(400).json({
      success: false,
      message: 'Invalid value format in request',
    });
  }

  // JWT errors (shouldn't reach here, but just in case)
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  // Known app-level errors thrown with a status
  if (err.status) {
    return res.status(err.status).json({ success: false, message: err.message });
  }

  // Fallback — 500
  res.status(500).json({
    success:  false,
    message:  'Something went wrong on the server',
    ...(process.env.NODE_ENV === 'development' && { error: err.message, stack: err.stack }),
  });
};

module.exports = errorHandler;