const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const User = require('../models/User');
const { SAFE_USER_SELECT, passwordProblems } = require('../utils/passwordPolicy');
const { rememberPassword } = require('../utils/loginSecurity');
const TeacherProfile = require('../models/TeacherProfile');
const Student = require('../models/Student');
const Class = require('../models/Class');
const AdmissionApplication = require('../models/AdmissionApplication');
const Discipline = require('../models/Discipline');
const Permission = require('../models/Permission');
const Income = require('../models/Income');
const Expense = require('../models/Expense');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');
const { sendWelcomeEmail } = require('../utils/emailService');
const { paginate, respondList } = require('../utils/paginate');

const router = express.Router();

router.get('/super-admin/admins', authMiddleware, requireRole('super_admin'), async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const total = await User.countDocuments({ role: { $in: ['academic_admin', 'discipline_admin', 'accounts_admin'] } });
  const admins = await User.find({ role: { $in: ['academic_admin', 'discipline_admin', 'accounts_admin'] } })
    .select(SAFE_USER_SELECT).skip(skip).limit(limit || undefined);
  respondList(res, admins, { page, limit, total });
});

router.post('/super-admin/create-admin', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    const { fullName, email, password, phone, role } = req.body;
    if (await User.findOne({ email })) return res.status(400).json({ message: 'Email already exists' });

    // A supplied password has to satisfy the same policy as any other. A
    // generated one cannot be checked by a human before it is sent, so it is
    // flagged mustChangePassword and the new account is forced to replace it at
    // first sign-in - previously the generated password could be kept forever.
    const generated = !password;
    const finalPassword = generated
      ? crypto.randomBytes(9).toString('base64url').slice(0, 12) + '7'
      : password;

    const problems = generated ? [] : passwordProblems(finalPassword, { email, fullName });
    if (problems.length) {
      return res.status(400).json({ message: problems[0], problems });
    }

    const hashedPassword = await bcrypt.hash(finalPassword, 10);
    const newAdmin = await User.create({
      fullName, email, password: hashedPassword, role, phone: phone || '',
      mustChangePassword: generated,
      passwordChangedAt: generated ? undefined : new Date(),
      createdBy: req.userId
    });
    await rememberPassword(newAdmin, hashedPassword);
    await newAdmin.save();

    sendWelcomeEmail({ _id: newAdmin._id, fullName, email, role }).catch(console.error);
    res.json({
      success: true,
      user: { _id: newAdmin._id, fullName, email, role },
      password: finalPassword,
      generated
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/super-admin/admins/:id', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    const { fullName, phone, isActive } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { fullName, phone, isActive }, { new: true }).select(SAFE_USER_SELECT);
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/super-admin/admins/:id', authMiddleware, requireRole('super_admin'), async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

router.get('/super-admin/stats', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    const [totalStudents, totalTeachers, totalClasses, pendingApplications, pendingDiscipline, pendingPermissions, totalIncome, totalExpenses] = await Promise.all([
      Student.countDocuments({ isActive: true }),
      TeacherProfile.countDocuments(),
      Class.countDocuments(),
      AdmissionApplication.countDocuments({ status: 'pending' }),
      Discipline.countDocuments({ status: 'pending' }),
      Permission.countDocuments({ status: 'pending' }),
      Income.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
      Expense.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }])
    ]);
    res.json({
      success: true,
      totalStudents, totalTeachers, totalClasses, pendingApplications,
      pendingDiscipline, pendingPermissions,
      totalIncome: totalIncome[0]?.total || 0,
      totalExpenses: totalExpenses[0]?.total || 0
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/super-admin/users', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    const users = await User.find().select(SAFE_USER_SELECT).sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/super-admin/users/:id/toggle-active', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.isActive = !user.isActive;
    await user.save();
    res.json({ success: true, isActive: user.isActive });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;