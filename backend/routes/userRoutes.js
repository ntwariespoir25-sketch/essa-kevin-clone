const express = require('express');
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { authLimiter } = require('../config/rateLimit');
const { passwordProblems, SAFE_USER_SELECT } = require('../utils/passwordPolicy');
const { rememberPassword, passwordWasUsedBefore } = require('../utils/loginSecurity');
const { uploadProfile } = require('../config/upload');

const router = express.Router();

router.post('/user/upload-profile', authMiddleware, uploadProfile.single('profileImage'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/profile/${req.file.filename}`;
    await User.findByIdAndUpdate(req.userId, { profileImage: imageUrl });
    res.json({ success: true, imageUrl });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/user/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(SAFE_USER_SELECT);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/user/profile', authMiddleware, async (req, res) => {
  try {
    const { fullName, phone } = req.body;
    const user = await User.findByIdAndUpdate(req.userId, { fullName, phone }, { new: true }).select(SAFE_USER_SELECT);
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// The Student portal changes its password here rather than through
// /auth/change-password, so it used to accept a one-character password and
// never set passwordChangedAt. Both are corrected by routing it through the
// same policy as every other password write; leaving it out would have made
// this endpoint the weak link in the whole policy.
router.put('/user/change-password', authLimiter, authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const problems = passwordProblems(newPassword, { email: user.email, fullName: user.fullName });
    if (problems.length) return res.status(400).json({ message: problems[0], problems });
    if (newPassword === currentPassword) {
      return res.status(400).json({ message: 'New password must be different from the current one' });
    }
    if (await passwordWasUsedBefore(user, newPassword)) {
      return res.status(400).json({ message: 'Choose a password you have not used before' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    user.password = hash;
    user.passwordChangedAt = new Date();
    user.mustChangePassword = false;
    await rememberPassword(user, hash);
    await user.save();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;