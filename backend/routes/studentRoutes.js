const express = require('express');

const Grade = require('../models/Grade');
const Assignment = require('../models/Assignment');
const Student = require('../models/Student');
const FeeStructure = require('../models/FeeStructure');
const FeePayment = require('../models/FeePayment');
const Invoice = require('../models/Invoice');
const authMiddleware = require('../middleware/auth');
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

router.get('/student/grades/:studentId', authMiddleware, async (req, res) => {
  try {
    const grades = await Grade.find({ studentId: req.params.studentId }).sort({ createdAt: -1 });
    res.json(grades);
  } catch (error) {
    res.status(500).json({ message: error.message });
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