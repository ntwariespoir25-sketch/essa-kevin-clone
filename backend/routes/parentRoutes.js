const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const Student = require('../models/Student');
const ParentProfile = require('../models/ParentProfile');
const Otp = require('../models/Otp');
const Grade = require('../models/Grade');
const Attendance = require('../models/Attendance');
const Assignment = require('../models/Assignment');
const FeeStructure = require('../models/FeeStructure');
const FeePayment = require('../models/FeePayment');
const Discipline = require('../models/Discipline');
const Announcement = require('../models/Announcement');
const authMiddleware = require('../middleware/auth');
const { publicFormLimiter } = require('../config/rateLimit');
const { getJWTSecret } = require('../utils/jwt');
const { buildReportCard } = require('../utils/reportCard');

const router = express.Router();

const normalizePhone = (raw) => String(raw || '').trim().replace(/[\s-]/g, '');

const maskPhone = (p) => {
  if (p.length <= 4) return '***';
  return '*'.repeat(Math.max(1, p.length - 4)) + p.slice(-4);
};

const getChildForParent = async (profile, childId) => {
  const ids = (profile?.children || []).map(String);
  if (!ids.includes(String(childId))) return null;
  return Student.findById(childId).populate('classId', 'grade className');
};

const computeFees = async (child) => {
  const feeStructures = await FeeStructure.find({ classId: child.classId });
  const payments = await FeePayment.find({ studentId: child._id });
  const byType = {};
  feeStructures.forEach(f => {
    byType[f.feeType] = byType[f.feeType] || { feeType: f.feeType, expected: 0, paid: 0, dueDate: f.dueDate };
    byType[f.feeType].expected += f.amount || 0;
  });
  payments.forEach(p => {
    byType[p.feeType] = byType[p.feeType] || { feeType: p.feeType, expected: 0, paid: 0 };
    byType[p.feeType].paid += p.amount || 0;
  });
  const breakdown = Object.values(byType).map(x => ({ ...x, balance: x.expected - x.paid }));
  const totalExpected = breakdown.reduce((a, b) => a + b.expected, 0);
  const totalPaid = breakdown.reduce((a, b) => a + b.paid, 0);
  return {
    totalExpected,
    totalPaid,
    balance: totalExpected - totalPaid,
    paidPercent: totalExpected ? Math.round((totalPaid / totalExpected) * 100) : 0,
    breakdown
  };
};

// ==================== OTP AUTH ====================
router.post('/parent/request-otp', publicFormLimiter, async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    if (!/^\+?\d{7,15}$/.test(phone)) {
      return res.status(400).json({ success: false, message: 'A valid phone number is required' });
    }
    const matched = await Student.find({ parentPhone: phone }).select('fullName studentId');
    if (matched.length === 0) {
      return res.status(404).json({ success: false, message: 'No child is registered under this phone number. Please contact the school to link your number.' });
    }
    const code = await Otp.generate(phone, 'login');
    console.log(`📱 [DEV] OTP for ${phone}: ${code} (valid 5 minutes)`);
    const payload = { success: true, message: `OTP sent to ${maskPhone(phone)}`, maskedPhone: maskPhone(phone), children: matched.length };
    if (process.env.NODE_ENV !== 'production') payload.devOtp = code;
    res.json(payload);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/parent/verify-otp', publicFormLimiter, async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const otp = String(req.body.otp || '').trim();
    if (!/^\+?\d{7,15}$/.test(phone) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: 'Phone and a 6-digit code are required' });
    }
    const valid = await Otp.verify(phone, otp, 'login');
    if (!valid) return res.status(401).json({ success: false, message: 'Invalid or expired code' });

    const students = await Student.find({ parentPhone: phone });
    if (students.length === 0) {
      return res.status(404).json({ success: false, message: 'No matching student found for this phone number' });
    }

    const childIds = students.map(s => s._id);
    let profile = await ParentProfile.findOne({ parentPhone: phone });
    if (!profile) {
      profile = await ParentProfile.create({ parentPhone: phone, parentName: students[0].parentName || 'Parent' });
    }
    let parentUser = profile.userId ? await User.findById(profile.userId) : null;
    if (!parentUser) {
      const randomPw = crypto.randomBytes(6).toString('hex').slice(0, 10);
      parentUser = await User.create({
        fullName: profile.parentName || 'Parent',
        email: `parent-${phone.replace(/\D/g, '').slice(-8)}@essa.rw`,
        password: await bcrypt.hash(randomPw, 10),
        role: 'parent',
        phone
      });
      profile.userId = parentUser._id;
    }
    profile.children = childIds;
    profile.isLinked = true;
    profile.linkedAt = new Date();
    await profile.save();

    const token = jwt.sign({ id: parentUser._id, role: 'parent', name: parentUser.fullName }, getJWTSecret(), { expiresIn: '7d' });
    res.json({
      success: true,
      token,
      _id: parentUser._id,
      fullName: parentUser.fullName,
      email: parentUser.email,
      role: 'parent',
      children: students.map(s => ({ _id: s._id, fullName: s.fullName, studentId: s.studentId, classId: s.classId }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== CHILDREN ====================
router.get('/parent/children', authMiddleware, async (req, res) => {
  try {
    const profile = await ParentProfile.findOne({ userId: req.userId })
      .populate({ path: 'children', populate: { path: 'classId', select: 'grade className' } });
    res.json(profile?.children || []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/parent/children/:childId/grades', authMiddleware, async (req, res) => {
  try {
    const profile = await ParentProfile.findOne({ userId: req.userId });
    const child = await getChildForParent(profile, req.params.childId);
    if (!child) return res.status(403).json({ message: 'This child is not linked to your account' });
    const grades = await Grade.find({ studentId: child._id }).sort({ createdAt: -1 });
    res.json(grades);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/parent/children/:childId/attendance', authMiddleware, async (req, res) => {
  try {
    const profile = await ParentProfile.findOne({ userId: req.userId });
    const child = await getChildForParent(profile, req.params.childId);
    if (!child) return res.status(403).json({ message: 'This child is not linked to your account' });
    const attendance = await Attendance.find({ studentId: child._id }).sort({ date: -1 });
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/parent/children/:childId/assignments', authMiddleware, async (req, res) => {
  try {
    const profile = await ParentProfile.findOne({ userId: req.userId });
    const child = await getChildForParent(profile, req.params.childId);
    if (!child) return res.status(403).json({ message: 'This child is not linked to your account' });
    const assignments = await Assignment.find({ classId: child.classId }).sort({ createdAt: -1 });
    const list = assignments.map(a => {
      const obj = a.toObject();
      const sub = (a.submissions || []).find(s => String(s.studentId) === String(child._id));
      obj.status = sub ? sub.status : (a.dueDate && new Date(a.dueDate) < new Date() ? 'overdue' : 'pending');
      obj.score = sub?.score;
      obj.grade = sub?.grade;
      obj.feedback = sub?.feedback;
      return obj;
    });
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/parent/children/:childId/fees', authMiddleware, async (req, res) => {
  try {
    const profile = await ParentProfile.findOne({ userId: req.userId });
    const child = await getChildForParent(profile, req.params.childId);
    if (!child) return res.status(403).json({ message: 'This child is not linked to your account' });
    res.json(await computeFees(child));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/parent/children/:childId/discipline', authMiddleware, async (req, res) => {
  try {
    const profile = await ParentProfile.findOne({ userId: req.userId });
    const child = await getChildForParent(profile, req.params.childId);
    if (!child) return res.status(403).json({ message: 'This child is not linked to your account' });
    const records = await Discipline.find({ studentId: child._id }).sort({ createdAt: -1 });
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/parent/children/:childId/announcements', authMiddleware, async (req, res) => {
  try {
    const profile = await ParentProfile.findOne({ userId: req.userId });
    const child = await getChildForParent(profile, req.params.childId);
    if (!child) return res.status(403).json({ message: 'This child is not linked to your account' });
    const gradeLabel = child.classId?.grade || '';
    const announcements = await Announcement.find({ isActive: true }).sort({ createdAt: -1 });
    const visible = announcements.filter(a => {
      const aud = Array.isArray(a.audience) ? a.audience : [a.audience];
      if (aud.includes('all')) return true;
      if (!gradeLabel) return false;
      return aud.some(x => String(x).toLowerCase().includes(String(gradeLabel).toLowerCase()));
    });
    res.json(visible);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/parent/children/:childId/events', authMiddleware, async (req, res) => {
  res.json([]);
});

router.get('/parent/children/:childId/documents', authMiddleware, async (req, res) => {
  res.json([]);
});

router.get('/parent/children/:childId/report-card', authMiddleware, async (req, res) => {
  try {
    const profile = await ParentProfile.findOne({ userId: req.userId });
    const child = await getChildForParent(profile, req.params.childId);
    if (!child) return res.status(403).json({ message: 'This child is not linked to your account' });
    res.json(await buildReportCard(child, req.query));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/parent/children/:childId/dashboard', authMiddleware, async (req, res) => {
  try {
    const profile = await ParentProfile.findOne({ userId: req.userId });
    const child = await getChildForParent(profile, req.params.childId);
    if (!child) return res.status(403).json({ message: 'This child is not linked to your account' });

    const grades = await Grade.find({ studentId: child._id });
    const averageScore = grades.length
      ? Math.round(grades.reduce((a, g) => a + (g.score || 0), 0) / grades.length)
      : 0;

    const attendance = await Attendance.find({ studentId: child._id });
    const present = attendance.filter(a => a.status === 'present').length;
    const attendanceRate = attendance.length ? Math.round((present / attendance.length) * 100) : 0;

    const disciplineCount = await Discipline.countDocuments({ studentId: child._id });
    const fees = await computeFees(child);

    res.json({
      student: {
        _id: child._id,
        fullName: child.fullName,
        studentId: child.studentId,
        class: child.classId ? `${child.classId.grade} ${child.classId.className}` : 'Not Assigned'
      },
      averageScore,
      subjectsTracked: grades.length,
      attendanceRate,
      disciplineCount,
      feeStatus: fees
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;