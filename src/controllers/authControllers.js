const jwt       = require('jsonwebtoken');
const UserModel = require('../models/userModel');

const AuthController = {

  // POST /api/auth/login
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
      }

      const user = await UserModel.findByEmail(email);
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      if (!user.is_active) {
        return res.status(403).json({ success: false, message: 'Account is deactivated' });
      }

      const valid = await UserModel.verifyPassword(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      return res.json({
        success: true,
        token,
        user: {
          id:    user.id,
          name:  user.name,
          email: user.email,
          role:  user.role,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/auth/me
  async me(req, res, next) {
    try {
      const user = await UserModel.findById(req.user.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      return res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },

};

module.exports = AuthController;