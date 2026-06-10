// Usage in routes:
//   router.delete('/:id', protect, requireRole('ADMIN'), controller.delete)
//   router.get('/',       protect, requireRole('ADMIN', 'STAFF'), controller.getAll)

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}`,
      });
    }

    next();
  };
};

// Shorthand — only ADMIN can proceed
const requireAdmin = requireRole('ADMIN');

module.exports = { requireRole, requireAdmin };