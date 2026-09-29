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
const { passwordProblems } = require('../utils/passwordPolicy');
const {
  isLocked, lockRemainingMinutes, recordAttempt,
  registerFailure, registerSuccess, rememberPassword, passwordWasUsedBefore
} = require('../utils/loginSecurity');

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

      // Unknown address and wrong password answer identically, so the response
      // cannot be used to discover which accounts exist.
      if (!user) {
        await recordAttempt(req, { identifier: email, success: false, outcome: 'no_such_user' });
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      if (isLocked(user)) {
        await recordAttempt(req, { user, identifier: email, success: false, outcome: 'locked' });
        return res.status(423).json({
          message: `Account temporarily locked after repeated failed sign-in attempts. Try again in ${lockRemainingMinutes(user)} minute(s).`
        });
      }

      if (!(await bcrypt.compare(password, user.password))) {
        const updated = await registerFailure(user, 'bad_password');
        await recordAttempt(req, { user, identifier: email, success: false, outcome: 'bad_password' });
        if (updated && updated.lockedUntil) {
          return res.status(423).json({
            message: `Account temporarily locked after repeated failed sign-in attempts. Try again in ${lockRemainingMinutes(updated)} minute(s).`
          });
        }
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      if (!user.isActive) {
        await recordAttempt(req, { user, identifier: email, success: false, outcome: 'inactive' });
        return res.status(403).json({ message: 'Account is deactivated' });
      }

      const token = jwt.sign(
        { id: user._id, role: user.role, name: user.fullName, pwd: user.mustChangePassword ? 1 : 0 },
        getJWTSecret(),
        { expiresIn: user.mustChangePassword ? '2h' : '7d' }
      );
      await registerSuccess(user);
      res.json({ success: true, _id: user._id, fullName: user.fullName, email: user.email, role: user.role, profileImage: user.profileImage, mustChangePassword: !!user.mustChangePassword, token });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

router.post('/auth/set-password',
  body('token').notEmpty().withMessage('Setup token is required'),
  body('password').notEmpty().withMessage('Password is required'),
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

      const problems = passwordProblems(req.body.password, {
        email: user.email, fullName: user.fullName
      });
      if (problems.length) {
        return res.status(400).json({ message: problems[0], problems });
      }
      if (await passwordWasUsedBefore(user, req.body.password)) {
        return res.status(400).json({
          message: 'Choose a password you have not used before',
          problems: ['Choose a password you have not used before']
        });
      }

      const hash = await bcrypt.hash(req.body.password, 10);
      user.password = hash;
      user.mustChangePassword = false;
      user.passwordChangedAt = new Date();
      await rememberPassword(user, hash);
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

      // An account that has never had a password set is only ever given the
      // short-lived "set your password" session, no matter what password was
      // supplied alongside the code. The SDMS code is the credential here; there
      // is no password yet to check, so accepting the supplied one would mean an
      // arbitrary password quietly became valid.
      if (!user.passwordChangedAt || !user.password) {
        if (password) {
          await recordAttempt(req, { user, identifier: sdmsCode, method: 'sdms', success: false, outcome: 'no_password_set' });
        }
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

      if (isLocked(user)) {
        await recordAttempt(req, { user, identifier: sdmsCode, method: 'sdms', success: false, outcome: 'locked' });
        return res.status(423).json({
          message: `Account temporarily locked after repeated failed sign-in attempts. Try again in ${lockRemainingMinutes(user)} minute(s).`
        });
      }

      // A password-protected account requires the password. Omitting it is a
      // failed attempt, not a shortcut to the pending session.
      if (!password || !(await bcrypt.compare(password, user.password))) {
        const updated = await registerFailure(user, 'bad_password');
        await recordAttempt(req, { user, identifier: sdmsCode, method: 'sdms', success: false, outcome: 'bad_password' });
        if (updated && updated.lockedUntil) {
          return res.status(423).json({
            message: `Account temporarily locked after repeated failed sign-in attempts. Try again in ${lockRemainingMinutes(updated)} minute(s).`
          });
        }
        return res.status(401).json({ message: 'Incorrect SDMS code or password' });
      }

      const mustChangePassword = !!user.mustChangePassword;
      const token = sessionToken(user, mustChangePassword);
      await registerSuccess(user);
      if (!student.firstLoginAt) {
        student.firstLoginAt = new Date();
        await student.save();
      }

      await recordAttempt(req, { user, identifier: sdmsCode, method: 'sdms', success: true, outcome: 'ok' });

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

  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const problems = passwordProblems(newPassword, {
      email: user.email, fullName: user.fullName
    });
    if (problems.length) {
      return res.status(400).json({ message: problems[0], problems });
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({
        message: 'New password must be different from the current one',
        problems: ['New password must be different from the current one']
      });
    }
    if (await passwordWasUsedBefore(user, newPassword)) {
      return res.status(400).json({
        message: 'Choose a password you have not used before',
        problems: ['Choose a password you have not used before']
      });
    }

    if (!req.mustChangePassword) {
      if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password))) {
        return res.status(401).json({ message: 'Current password is incorrect' });
      }
    }

    const hash = await bcrypt.hash(newPassword, 10);
    user.password = hash;
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date();
    await rememberPassword(user, hash);
    await user.save();

    const token = sessionToken(user, false);
    res.json({ success: true, message: 'Password updated', mustChangePassword: false, token });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;