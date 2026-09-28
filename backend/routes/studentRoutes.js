const express = require('express');

const Grade = require('../models/Grade');
const Assignment = require('../models/Assignment');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Discipline = require('../models/Discipline');
const Announcement = require('../models/Announcement');
const FeeStructure = require('../models/FeeStructure');
const FeePayment = require('../models/FeePayment');
const Invoice = require('../models/Invoice');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');
const { uploadSubmission } = require('../config/upload');

const router = express.Router();

const computeStudentFees = async (student, year) => {
  const feeStructures = await FeeStructure.find({ classId: student.classId });
  const invoices = await Invoice.find({ studentId: student._id, year }).sort({ createdAt: -1 });
  const payments = await FeePayment.find({ studentId: student._id }).sort({ paymentDate: -1 });

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
    breakdown,
    invoices: invoices.map(i => i.toObject()),
    payments: payments.map(p => ({ _id: p._id, feeType: p.feeType, amount: p.amount, paymentMethod: p.paymentMethod, receiptNo: p.receiptNo, paymentDate: p.paymentDate, invoiceId: p.invoiceId }))
  };
};

// ==================== AGGREGATE / SELF-SERVICE ====================
const getOwnStudent = async (userId) => {
  const student = await Student.findOne({ userId }).populate('classId', 'grade className');
  if (!student) {
    const err = new Error('No student profile linked to your account');
    err.status = 403;
    throw err;
  }
  return student;
};

const visibleAnnouncements = async (student) => {
  const gradeLabel = student?.classId?.grade || '';
  const announcements = await Announcement.find({ isActive: true }).sort({ createdAt: -1 });
  return announcements.filter(a => {
    const aud = Array.isArray(a.audience) ? a.audience : [a.audience];
    if (aud.some(x => x === 'all' || x === 'students' || x === 'student')) return true;
    if (!gradeLabel) return false;
    return aud.some(x => String(x).toLowerCase().includes(String(gradeLabel).toLowerCase()));
  });
};

router.get('/student/dashboard', authMiddleware, async (req, res) => {
  try {
    const student = await getOwnStudent(req.userId);
    const year = Number(req.query.year) || new Date().getFullYear();

    const [grades, attendance, assignments, disciplineCount, announcements, fees] = await Promise.all([
      Grade.find({ studentId: student._id }),
      Attendance.find({ studentId: student._id }),
      Assignment.find({ classId: student.classId }),
      Discipline.countDocuments({ studentId: student._id }),
      visibleAnnouncements(student),
      computeStudentFees(student, year)
    ]);

    const averageScore = grades.length
      ? Math.round(grades.reduce((a, g) => a + (g.score || 0), 0) / grades.length)
      : 0;
    const present = attendance.filter(a => a.status === 'present').length;
    const attendanceRate = attendance.length ? Math.round((present / attendance.length) * 100) : 0;
    const now = Date.now();
    const mySubmissions = new Set(
      (await Assignment.find({ classId: student.classId }).select('submissions')).flatMap(a =>
        (a.submissions || []).filter(s => String(s.studentId) === String(student._id)).map(() => a._id.toString())
      )
    );
    const pendingAssignments = assignments.filter(a => {
      if (mySubmissions.has(a._id.toString())) return false;
      return !(a.dueDate && new Date(a.dueDate).getTime() < now);
    }).length;

    res.json({
      student: {
        _id: student._id,
        fullName: student.fullName,
        studentId: student.studentId,
        class: student.classId ? `${student.classId.grade} ${student.classId.className}` : 'Not Assigned'
      },
      averageScore,
      subjectsTracked: new Set(grades.map(g => g.subject).filter(Boolean)).size,
      attendanceRate,
      attendanceRecords: attendance.length,
      totalAssignments: assignments.length,
      pendingAssignments,
      disciplineCount,
      feeStatus: fees,
      announcements: announcements.slice(0, 5)
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

router.get('/student/grades', authMiddleware, async (req, res) => {
  try {
    const student = await getOwnStudent(req.userId);
    const grades = await Grade.find({ studentId: student._id }).sort({ createdAt: -1 });
    res.json(grades);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

router.get('/student/attendance', authMiddleware, async (req, res) => {
  try {
    const student = await getOwnStudent(req.userId);
    const query = { studentId: student._id };
    if (req.query.startDate || req.query.endDate) {
      query.date = {};
      if (req.query.startDate) query.date.$gte = new Date(req.query.startDate);
      if (req.query.endDate) query.date.$lte = new Date(req.query.endDate);
    }
    const attendance = await Attendance.find(query).sort({ date: -1 });
    res.json(attendance);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

router.get('/student/announcements', authMiddleware, async (req, res) => {
  try {
    const student = await getOwnStudent(req.userId);
    res.json(await visibleAnnouncements(student));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

router.get('/student/grades/:studentId', authMiddleware, async (req, res) => {
  try {
    const student = await getOwnStudent(req.userId);
    const targetId = req.params.studentId;

    if (String(targetId) !== String(student._id)) {
      if (req.userRole === 'student') {
        return res.status(403).json({ message: 'You can only view your own grades' });
      }
      if (!['academic_admin', 'super_admin', 'teacher', 'parent'].includes(req.userRole)) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const grades = await Grade.find({ studentId: targetId }).sort({ createdAt: -1 });
    res.json(grades);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

router.get('/student/assignments', authMiddleware, async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.userId });
    if (!student || !student.classId) return res.json([]);
    const assignments = await Assignment.find({ classId: student.classId }).sort({ createdAt: -1 });
    const list = assignments.map(a => {
      const obj = a.toObject();
      const sub = (a.submissions || []).find(s => String(s.studentId) === String(student._id));
      obj.status = sub ? sub.status : (a.dueDate && new Date(a.dueDate) < new Date() ? 'overdue' : 'pending');
      obj.score = sub?.score;
      obj.grade = sub?.grade;
      obj.feedback = sub?.feedback;
      obj.mySubmission = sub?.fileUrl || '';
      return obj;
    });
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/student/assignments/:id/submit', authMiddleware, uploadSubmission.single('file'), async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.userId });
    if (!student) return res.status(403).json({ message: 'No student profile linked to your account' });

    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    if (assignment.classId && String(assignment.classId) !== String(student.classId)) {
      return res.status(403).json({ message: 'This assignment is not for your class' });
    }

    const fileUrl = req.file ? `${req.protocol}://${req.get('host')}/uploads/submissions/${req.file.filename}` : null;
    const isLate = assignment.dueDate && new Date(assignment.dueDate) < new Date();
    const status = isLate ? 'late' : 'submitted';

    const idx = assignment.submissions.findIndex(s => String(s.studentId) === String(student._id));
    const submission = {
      studentId: student._id,
      submittedAt: new Date(),
      content: req.body.content || '',
      fileUrl,
      status
    };

    if (idx >= 0) {
      assignment.submissions[idx] = { ...assignment.submissions[idx].toObject(), ...submission, score: undefined, grade: undefined, feedback: undefined };
    } else {
      assignment.submissions.push(submission);
    }
    await assignment.save();

    res.json({ success: true, message: 'Assignment submitted successfully', status });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/student/fees', authMiddleware, async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.userId });
    if (!student) return res.status(403).json({ message: 'No student profile linked to your account' });
    const year = Number(req.query.year) || new Date().getFullYear();
    res.json(await computeStudentFees(student, year));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;