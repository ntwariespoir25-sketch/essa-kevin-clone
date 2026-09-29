const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const User = require('../models/User');
const Student = require('../models/Student');
const { getJWTSecret } = require('../utils/jwt');
const { normalizeCode, ensureUser, sessionToken } = require('../utils/sdms');
const { authLimiter } = require('../config/rateLimit');
const authMiddleware = require('../middleware/auth');

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
        { id: user._id, role: user.role, name: user.fullName, pwd: user.mustChangePassword ? 1 : 0 },
        getJWTSecret(),
        { expiresIn: user.mustChangePassword ? '2h' : '7d' }
      );
      user.lastLoginAt = new Date();
      await user.save();
      res.json({ success: true, _id: user._id, fullName: user.fullName, email: user.email, role: user.role, profileImage: user.profileImage, mustChangePassword: !!user.mustChangePassword, token });
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

// Students sign in with the SDMS code printed on their access slip. On the
// very first login there is no password yet, so a short-lived token is issued
// that only unlocks the change-password endpoint.
router.post('/auth/student/login', authLimiter,
  body('sdmsCode').notEmpty().withMessage('SDMS code is required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });

    try {
      const sdmsCode = normalizeCode(req.body.sdmsCode);
      const student = await Student.findOne({ sdmsCode });
      if (!student) return res.status(401).json({ message: 'That SDMS code was not recognised' });
      if (!student.isActive) return res.status(403).json({ message: 'This student account is inactive. Please contact the school.' });

      const user = await ensureUser(student);
      if (!user.isActive) return res.status(403).json({ message: 'This account is deactivated. Please contact the school.' });

      const password = String(req.body.password || '');
      if (!password) {
        const token = sessionToken(user, true);
        return res.json({
          success: true,
          mustSetPassword: true,
          mustChangePassword: true,
          _id: user._id,
          fullName: user.fullName,
          role: user.role,
          token
        });
      }

      if (user.passwordChangedAt && !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ message: 'Incorrect SDMS code or password' });
      }

      const mustChangePassword = !!user.mustChangePassword;
      const token = sessionToken(user, mustChangePassword);
      user.lastLoginAt = new Date();
      await user.save();
      if (!student.firstLoginAt) {
        student.firstLoginAt = new Date();
        await student.save();
      }

      res.json({
        success: true,
        mustSetPassword: false,
        mustChangePassword,
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage,
        token
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

// Reached both from the first-login modal and from Profile Settings. When the
// session still carries the pending flag, no current password is required,
// because the student authenticated with the SDMS code instead.
// authMiddleware is required: without it req.userId is undefined, so the lookup
// below 404s and nobody can ever clear a forced password change. It is on the
// allow-list in auth.js precisely so the pending token still gets through.
router.post('/auth/change-password', authLimiter, authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters' });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ message: 'New password must be different from the current one' });
  }

  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!req.mustChangePassword) {
      if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password))) {
        return res.status(401).json({ message: 'Current password is incorrect' });
      }
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date();
    await user.save();

    const token = sessionToken(user, false);
    res.json({ success: true, message: 'Password updated', mustChangePassword: false, token });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;