const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const Student = require('../models/Student');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');
const { issueCode } = require('../utils/sdms');

const router = express.Router();

const manage = requireRole('academic_admin', 'super_admin');

// Issues or reissues a code. Reissuing also resets the linked account's
// password, so a lost slip cannot be used by whoever finds it.
router.post('/sdms-codes/:studentId', authMiddleware, manage, async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const sdmsCode = await issueCode(student);

    let resetPassword = false;
    if (req.body.resetPassword && student.userId) {
      const user = await User.findById(student.userId);
      if (user) {
        user.password = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
        user.mustChangePassword = true;
        user.passwordChangedAt = null;
        await user.save();
        resetPassword = true;
      }
    }

    res.json({ success: true, sdmsCode, issuedAt: student.sdmsCodeIssuedAt, passwordReset: resetPassword });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/sdms-codes', authMiddleware, manage, async (req, res) => {
  try {
    const query = {};
    if (req.query.classId) query.classId = req.query.classId;
    if (req.query.unissued === 'true') query.sdmsCode = { $exists: false };

    const students = await Student.find(query)
      .populate('classId', 'grade className')
      .select('fullName studentId sdmsCode sdmsCodeIssuedAt firstLoginAt isActive classId')
      .sort({ fullName: 1 });

    res.json({ success: true, count: students.length, students });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/sdms-codes/:studentId', authMiddleware, manage, async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(
      req.params.studentId,
      { $unset: { sdmsCode: 1, sdmsCodeIssuedAt: 1 } },
      { new: true }
    );
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    res.json({ success: true, message: 'SDMS code revoked' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
