const express        = require('express');
const router         = express.Router();
const AuthController = require('../controllers/authController');
const { protect }    = require('../middleware/authMiddleware');
const { validate, rules } = require('../middleware/validateMiddleware');

// POST /api/auth/login
router.post('/login', validate(rules.login), AuthController.login);

// GET /api/auth/me  — requires valid token
router.get('/me', protect, AuthController.me);

module.exports = router;