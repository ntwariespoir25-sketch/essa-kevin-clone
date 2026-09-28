const express = require('express');
const mongoose = require('mongoose');

const TeacherProfile = require('../models/TeacherProfile');
const Class = require('../models/Class');
const Student = require('../models/Student');
const Assignment = require('../models/Assignment');
const Grade = require('../models/Grade');
const Attendance = require('../models/Attendance');
const LessonPlan = require('../models/LessonPlan');
const Exam = require('../models/Exam');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');
const { uploadAssignment, uploadLesson } = require('../config/upload');

const router = express.Router();

// ==================== DASHBOARD ====================
router.get('/teacher/dashboard', authMiddleware, requireRole('teacher'), async (req, res) => {
  try {
    const teacherProfile = await TeacherProfile.findOne({ userId: req.userId });
    const classes = await Class.find({ teacherId: req.userId });
    const classIds = classes.map(c => c._id);
    const [totalStudents, pendingAssignments, recentGrades] = await Promise.all([
      Student.countDocuments({ classId: { $in: classIds } }),
      Assignment.countDocuments({ teacherId: req.userId, dueDate: { $gte: new Date() } }),
      Grade.find({ teacherId: req.userId }).sort({ createdAt: -1 }).limit(5)
    ]);
    res.json({ success: true, teacherProfile, classes, totalStudents, pendingAssignments, recentGrades });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== GRADES ====================
router.get('/teacher/grades', authMiddleware, async (req, res) => {
  try {
    const grades = await Grade.find({ teacherId: req.userId }).populate('studentId', 'fullName studentId');
    res.json(grades);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/teacher/grades', authMiddleware, requireRole('teacher', 'academic_admin', 'super_admin'), async (req, res) => {
  try {
    const { studentId, subject, score, term, year, assessmentId } = req.body;
    if (!studentId || !subject || score === undefined || !term || !year) {
      return res.status(400).json({ message: 'studentId, subject, score, term and year are required' });
    }

    // Derive the assessment type from the exam rather than trusting the client,
    // because report cards weight each score by the weight of its exam type. A
    // mismatched or missing type silently drops the score out of the weighting.
    let assessmentType = 'Other';
    if (assessmentId) {
      const exam = await Exam.findById(assessmentId).select('type');
      if (!exam) return res.status(404).json({ message: 'Exam not found' });
      assessmentType = exam.type;
    } else if (req.body.assessmentType) {
      assessmentType = req.body.assessmentType;
    }

    const grade = await Grade.create({
      studentId, subject, score, term, year: Number(year),
      assessmentType, assessmentId: assessmentId || undefined,
      teacherId: req.userId
    });
    res.json({ success: true, grade });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== ATTENDANCE ====================
router.post('/teacher/attendance', authMiddleware, requireRole('teacher', 'academic_admin', 'super_admin'), async (req, res) => {
  try {
    const { classId, date, records } = req.body;
    const bulk = records.map(r => ({
      updateOne: {
        filter: { studentId: r.studentId, classId, date: new Date(date) },
        update: { $set: { status: r.status, teacherId: req.userId } },
        upsert: true
      }
    }));
    await Attendance.bulkWrite(bulk);
    res.json({ success: true, message: 'Attendance saved' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/teacher/attendance/:classId', authMiddleware, async (req, res) => {
  try {
    const { date } = req.query;
    const query = { classId: req.params.classId };
    if (date) query.date = new Date(date);
    const attendance = await Attendance.find(query).populate('studentId', 'fullName studentId');
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/teacher/attendance', authMiddleware, requireRole('teacher'), async (req, res) => {
  try {
    const attendance = await Attendance.find({ teacherId: req.userId }).sort({ date: -1 });
    res.json(attendance);
  } catch (error) {
    res.json([]);
  }
});

// ==================== ASSIGNMENTS ====================
router.get('/teacher/assignments', authMiddleware, requireRole('teacher', 'academic_admin', 'super_admin'), async (req, res) => {
  try {
    let query = {};
    if (req.userRole === 'teacher') {
      query.teacherId = req.userId;
    }
    const assignments = await Assignment.find(query).sort({ createdAt: -1 });
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/teacher/assignments', authMiddleware, requireRole('teacher', 'academic_admin', 'super_admin'), uploadAssignment.single('file'), async (req, res) => {
  try {
    const fileUrl = req.file ? `${req.protocol}://${req.get('host')}/uploads/assignments/${req.file.filename}` : null;

    const assignment = await Assignment.create({
      title: req.body.title,
      description: req.body.description || '',
      subject: req.body.subject || '',
      classId: req.body.classId,
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
      totalPoints: parseInt(req.body.totalPoints) || 100,
      fileUrl,
      teacherId: req.userId
    });

    res.json({ success: true, assignment });
  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/teacher/assignments/:id/grade', authMiddleware, requireRole('teacher', 'academic_admin', 'super_admin'), async (req, res) => {
  try {
    const { studentId, score, feedback } = req.body;
    const points = parseFloat(score);
    if (!studentId || isNaN(points)) {
      return res.status(400).json({ message: 'studentId and a numeric score are required' });
    }
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    const sub = assignment.submissions.find(s => String(s.studentId) === String(studentId));
    if (!sub) return res.status(404).json({ message: 'This student has not submitted the assignment yet' });

    sub.score = points;
    sub.grade = points >= 80 ? 'A' : points >= 70 ? 'B' : points >= 60 ? 'C' : points >= 50 ? 'D' : 'F';
    sub.feedback = feedback || '';
    sub.status = 'graded';
    sub.gradedAt = new Date();
    await assignment.save();

    res.json({ success: true, assignment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== LESSON PLANS ====================
router.get('/teacher/lesson-plans', authMiddleware, requireRole('teacher', 'academic_admin', 'super_admin'), async (req, res) => {
  try {
    let query = {};
    if (req.userRole === 'teacher') {
      query.teacherId = req.userId;
    }
    const lessonPlans = await LessonPlan.find(query).sort({ createdAt: -1 });
    res.json(lessonPlans);
  } catch (error) {
    res.json([]);
  }
});

router.post('/teacher/lesson-plans', authMiddleware, requireRole('teacher', 'academic_admin', 'super_admin'), uploadLesson.single('file'), async (req, res) => {
  try {
    const fileUrl = req.file ? `${req.protocol}://${req.get('host')}/uploads/lessons/${req.file.filename}` : null;

    const lessonPlan = await LessonPlan.create({
      title: req.body.title,
      topic: req.body.topic,
      objectives: req.body.objectives || '',
      materials: req.body.materials || '',
      fileUrl,
      shareWithStudents: req.body.shareWithStudents === 'true',
      teacherId: req.userId,
      classId: req.body.classId || null,
      subject: req.body.subject || '',
      week: req.body.week || '',
      term: req.body.term || '',
      year: req.body.year ? Number(req.body.year) : undefined,
      syllabusProgress: parseInt(req.body.syllabusProgress) || 0,
      status: req.body.status === 'submitted' ? 'submitted' : 'draft'
    });

    res.json({ success: true, lessonPlan });
  } catch (error) {
    console.error('Create lesson plan error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Teacher moves a plan from draft to submitted for academic admin review.
router.put('/teacher/lesson-plans/:id/submit', authMiddleware, requireRole('teacher', 'academic_admin', 'super_admin'), async (req, res) => {
  try {
    const plan = await LessonPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: 'Lesson plan not found' });
    if (req.userRole === 'teacher' && String(plan.teacherId) !== String(req.userId)) {
      return res.status(403).json({ message: 'You can only submit your own lesson plans' });
    }
    if (plan.status === 'approved') {
      return res.status(400).json({ message: 'This plan is already approved' });
    }

    ['title', 'topic', 'objectives', 'materials', 'classId', 'subject', 'week', 'term'].forEach(k => {
      if (req.body[k] !== undefined) plan[k] = req.body[k];
    });
    if (req.body.year !== undefined) plan.year = Number(req.body.year) || undefined;
    if (req.body.syllabusProgress !== undefined) plan.syllabusProgress = parseInt(req.body.syllabusProgress) || 0;
    plan.status = 'submitted';
    await plan.save();

    res.json({ success: true, lessonPlan: plan });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;