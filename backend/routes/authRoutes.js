const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const User = require('../models/User');
const { getJWTSecret } = require('../utils/jwt');
const { authLimiter } = require('../config/rateLimit');

const router = express.Router();

router.post('/auth/login', authLimiter,
  body('email').isEmail().withMessage('A valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });
      if (!user || !(await bcrypt.compare(password, user.password)))
        return res.status(401).json({ message: 'Invalid credentials' });
      if (!user.isActive)
        return res.status(403).json({ message: 'Account is deactivated' });

      const token = jwt.sign(
        { id: user._id, role: user.role, name: user.fullName },
        getJWTSecret(),
        { expiresIn: '7d' }
      );
      res.json({ success: true, _id: user._id, fullName: user.fullName, email: user.email, role: user.role, profileImage: user.profileImage, token });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

router.post('/auth/set-password',
  body('token').notEmpty().withMessage('Setup token is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    try {
      const decoded = jwt.verify(req.body.token, getJWTSecret());
      if (decoded.purpose !== 'setup') {
        return res.status(400).json({ message: 'Invalid setup token' });
      }
      const user = await User.findById(decoded.id);
      if (!user) return res.status(404).json({ message: 'User not found' });

      user.password = await bcrypt.hash(req.body.password, 10);
      await user.save();

      res.json({ success: true, message: 'Password set successfully. You can now login.' });
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(400).json({ message: 'Setup link has expired. Please contact the school administration.' });
      }
      return res.status(400).json({ message: 'Invalid or expired setup token' });
    }
  });

module.exports = router;