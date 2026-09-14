const express = require('express');

const Timetable = require('../models/Timetable');
const Exam = require('../models/Exam');
const Student = require('../models/Student');
const TeacherProfile = require('../models/TeacherProfile');
const Class = require('../models/Class');
const User = require('../models/User');
const { buildReportCard } = require('../utils/reportCard');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');

const router = express.Router();

const populateTimetable = async (list) => {
  if (!list.length) return [];
  const teacherIds = [...new Set(list.map(t => String(t.teacherId)).filter(id => id && id !== 'null' && id !== 'undefined'))];
  const classIds = [...new Set(list.map(t => String(t.classId)).filter(id => id && id !== 'null' && id !== 'undefined'))];

  const [teacherProfiles, classes] = await Promise.all([
    teacherIds.length ? TeacherProfile.find({ userId: { $in: teacherIds } }).select('fullName subject userId').lean() : [],
    classIds.length ? Class.find({ _id: { $in: classIds } }).select('grade className _id').lean() : []
  ]);

  const teacherMap = new Map(teacherProfiles.map(p => [String(p.userId), p]));
  const classMap = new Map(classes.map(c => [String(c._id), c]));

  return list.map(t => {
    const cls = t.classId ? classMap.get(String(t.classId)) : null;
    const teacher = t.teacherId ? teacherMap.get(String(t.teacherId)) : null;
    return {
      ...t,
      className: cls ? `${cls.grade} ${cls.className}`.trim() : '',
      teacherName: teacher ? teacher.fullName : '',
      teacherSubject: teacher ? teacher.subject : ''
    };
  });
};

const decorateExams = async (exams) => {
  if (!exams.length) return [];
  const classIds = [...new Set(exams.map(e => String(e.classId)).filter(Boolean))];
  const invigilatorIds = [...new Set(exams.map(e => String(e.invigilatorId)).filter(Boolean))];

  const [classes, invigilators] = await Promise.all([
    classIds.length ? Class.find({ _id: { $in: classIds } }).select('grade className _id').lean() : [],
    invigilatorIds.length ? User.find({ _id: { $in: invigilatorIds } }).select('fullName _id').lean() : []
  ]);

  const classMap = new Map(classes.map(c => [String(c._id), c]));
  const invMap = new Map(invigilators.map(u => [String(u._id), u]));

  return exams.map(e => ({
    ...e,
    className: e.classId ? `${classMap.get(String(e.classId))?.grade || ''} ${classMap.get(String(e.classId))?.className || ''}`.trim() : '',
    invigilatorName: e.invigilatorId ? invMap.get(String(e.invigilatorId))?.fullName || '' : ''
  }));
};

// ==================== TIMETABLE (ADMIN) ====================
router.get('/academic-admin/timetable', authMiddleware, requireRole('academic_admin', 'super_admin'), async (req, res) => {
  try {
    const query = {};
    if (req.query.classId) query.classId = req.query.classId;
    const entries = await Timetable.find(query).sort({ day: 1, period: 1 }).lean();
    res.json(await populateTimetable(entries));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/academic-admin/timetable', authMiddleware, requireRole('academic_admin', 'super_admin'), async (req, res) => {
  try {
    const { classId, day, period, startTime, endTime, subject, teacherId, room } = req.body;
    if (!classId || !day || period === undefined || period === null) {
      return res.status(400).json({ message: 'classId, day, and period are required' });
    }
    const entry = await Timetable.create({
      classId,
      day,
      period: parseInt(period),
      startTime: startTime || '',
      endTime: endTime || '',
      subject: subject || '',
      teacherId: teacherId || null,
      room: room || ''
    });
    res.json({ success: true, entry });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/academic-admin/timetable/:id', authMiddleware, requireRole('academic_admin', 'super_admin'), async (req, res) => {
  try {
    const entry = await Timetable.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!entry) return res.status(404).json({ message: 'Timetable entry not found' });
    res.json({ success: true, entry });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/academic-admin/timetable/:id', authMiddleware, requireRole('academic_admin', 'super_admin'), async (req, res) => {
  try {
    await Timetable.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== TIMETABLE (STUDENT) ====================
router.get('/student/timetable', authMiddleware, async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.userId });
    if (!student || !student.classId) return res.json([]);
    const entries = await Timetable.find({ classId: student.classId }).sort({ day: 1, period: 1 }).lean();
    res.json(await populateTimetable(entries));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== TIMETABLE (TEACHER) ====================
router.get('/teacher/timetable', authMiddleware, requireRole('teacher'), async (req, res) => {
  try {
    const entries = await Timetable.find({ teacherId: req.userId }).sort({ day: 1, period: 1 }).lean();
    res.json(await populateTimetable(entries));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== EXAMS (ADMIN) ====================
router.get('/academic-admin/exams', authMiddleware, requireRole('academic_admin', 'super_admin'), async (req, res) => {
  try {
    const query = {};
    if (req.query.classId) query.classId = req.query.classId;
    if (req.query.term) query.term = req.query.term;
    if (req.query.year) query.year = parseInt(req.query.year);
    const exams = await Exam.find(query).sort({ date: 1 }).lean();
    res.json(await decorateExams(exams));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/academic-admin/exams', authMiddleware, requireRole('academic_admin', 'super_admin'), async (req, res) => {
  try {
    const { title, term, year, subject, classId, date, startTime, duration, totalMarks, venue, invigilatorId } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required' });
    const exam = await Exam.create({
      title,
      term: term || '',
      year: year ? parseInt(year) : new Date().getFullYear(),
      subject: subject || '',
      classId: classId || null,
      date: date ? new Date(date) : null,
      startTime: startTime || '',
      duration: parseInt(duration) || 120,
      totalMarks: parseInt(totalMarks) || 100,
      venue: venue || '',
      invigilatorId: invigilatorId || null,
      status: req.body.status || 'scheduled'
    });
    res.json({ success: true, exam });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/academic-admin/exams/:id', authMiddleware, requireRole('academic_admin', 'super_admin'), async (req, res) => {
  try {
    const exam = await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    res.json({ success: true, exam });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/academic-admin/exams/:id', authMiddleware, requireRole('academic_admin', 'super_admin'), async (req, res) => {
  try {
    await Exam.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== EXAMS (STUDENT) ====================
router.get('/student/exams', authMiddleware, async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.userId });
    if (!student || !student.classId) return res.json([]);
    const exams = await Exam.find({ classId: student.classId }).sort({ date: 1 }).lean();
    res.json(exams);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== REPORT CARDS (ADMIN) ====================
router.get('/academic-admin/report-card/:studentId', authMiddleware, async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId).populate('classId', 'grade className teacherId');
    if (!student) return res.status(404).json({ message: 'Student not found' });
    if (req.userRole === 'teacher') {
      const teacherProfile = await TeacherProfile.findOne({ userId: req.userId });
      if (!student.classId || String(student.classId.teacherId) !== String(req.userId)) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }
    res.json(await buildReportCard(student, req.query));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== REPORT CARDS (STUDENT) ====================
router.get('/student/report-card', authMiddleware, async (req, res) => {
  try {
    const student = await Student.findOne({ userId: req.userId }).populate('classId', 'grade className teacherId');
    if (!student) return res.status(404).json({ message: 'No student profile linked' });
    res.json(await buildReportCard(student, req.query));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;