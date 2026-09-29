const express = require('express');

const Exam = require('../models/Exam');
const Class = require('../models/Class');
const Grade = require('../models/Grade');
const Student = require('../models/Student');
const SubjectAllocation = require('../models/SubjectAllocation');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');
const { authorizeStudentAccess, teacherOwnsClass } = require('../utils/access');

const router = express.Router();

const manage = requireRole('academic_admin', 'super_admin');

const letterGrade = (pct) => {
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 50) return 'D';
  return 'F';
};

router.get('/exams', authMiddleware, async (req, res) => {
  try {
    const query = {};
    if (req.query.term) query.term = req.query.term;
    if (req.query.year) query.year = Number(req.query.year);
    if (req.query.type) query.type = req.query.type;

    let exams = await Exam.find(query).populate('classIds', 'grade className').sort({ createdAt: -1 });

    if (req.userRole === 'teacher') {
      // Use the same ownership rule as mark entry and the gradebook, otherwise
      // a teacher who is the class teacher but holds no SubjectAllocation row
      // sees an empty exam list while their gradebook still shows the columns.
      // TeacherDashboard then offers nothing to enter marks against.
      const visible = [];
      for (const exam of exams) {
        const owned = await Promise.all(
          (exam.classIds || []).map(c => teacherOwnsClass(req.userId, c._id))
        );
        if (owned.some(Boolean)) visible.push(exam);
      }
      exams = visible;
    }

    res.json({ success: true, exams });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/exams/:id', authMiddleware, async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id).populate('classIds', 'grade className');
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    const grades = await Grade.find({ term: exam.term, year: exam.year }).populate('studentId', 'fullName classId');
    const classIds = new Set(exam.classIds.map(c => String(c._id)));
    const relevant = grades.filter(g => classIds.has(String(g.studentId?.classId?._id || g.studentId?.classId)));

    const bySubject = {};
    relevant.forEach(g => {
      bySubject[g.subject] = bySubject[g.subject] || { subject: g.subject, entries: 0, total: 0, highest: 0, lowest: 100 };
      const bucket = bySubject[g.subject];
      bucket.entries += 1;
      bucket.total += g.score || 0;
      bucket.highest = Math.max(bucket.highest, g.score || 0);
      bucket.lowest = Math.min(bucket.lowest, g.score || 0);
    });

    const subjectStats = Object.values(bySubject).map(s => ({
      ...s,
      average: s.entries ? Math.round(s.total / s.entries) : 0
    }));

    res.json({ success: true, exam, subjectStats, resultCount: relevant.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/exams', authMiddleware, manage, async (req, res) => {
  try {
    const { name, type, term, year, classIds, weight, maxScore, examDate, instructions } = req.body;
    if (!name || !term || !year) {
      return res.status(400).json({ success: false, message: 'name, term and year are required' });
    }

    const classes = classIds?.length ? await Class.find({ _id: { $in: classIds } }) : [];
    const exam = await Exam.create({
      name,
      type: type || 'Other',
      term,
      year: Number(year),
      classIds: classes.map(c => c._id),
      weight: Number(weight) || 0,
      maxScore: Number(maxScore) || 100,
      examDate: examDate ? new Date(examDate) : null,
      instructions: instructions || '',
      createdBy: req.userId
    });

    res.status(201).json({ success: true, exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/exams/:id', authMiddleware, manage, async (req, res) => {
  try {
    const update = { updatedAt: new Date() };
    ['name', 'type', 'term', 'instructions', 'isPublished'].forEach(k => {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    });
    if (req.body.year !== undefined) update.year = Number(req.body.year);
    if (req.body.weight !== undefined) update.weight = Number(req.body.weight) || 0;
    if (req.body.maxScore !== undefined) update.maxScore = Number(req.body.maxScore) || 100;
    if (req.body.examDate !== undefined) update.examDate = req.body.examDate ? new Date(req.body.examDate) : null;
    if (req.body.classIds !== undefined) {
      const classes = req.body.classIds.length ? await Class.find({ _id: { $in: req.body.classIds } }) : [];
      update.classIds = classes.map(c => c._id);
    }

    const exam = await Exam.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    res.json({ success: true, exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/exams/:id', authMiddleware, manage, async (req, res) => {
  try {
    const exam = await Exam.findByIdAndDelete(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Weighted term average for one student: every Grade in the term contributes
// proportionally to the weight of the exam type it came from. Falls back to a
// plain average when no exam defines a weight.
router.get('/exams/results/:studentId', authMiddleware, async (req, res) => {
  try {
    const { term, year } = req.query;
    if (!term || !year) return res.status(400).json({ success: false, message: 'term and year are required' });

    const student = await Student.findById(req.params.studentId).populate('classId', 'grade className');
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    if (!(await authorizeStudentAccess(req, student))) {
      return res.status(403).json({ success: false, message: 'You are not allowed to view this student\'s results' });
    }

    const [grades, exams] = await Promise.all([
      Grade.find({ studentId: student._id, term, year: Number(year) }).sort({ subject: 1 }),
      Exam.find({ term, year: Number(year) })
    ]);

    const weightByType = new Map();
    exams.forEach(e => weightByType.set(e.type, e.weight || 0));

    const hasWeights = [...weightByType.values()].some(w => w > 0);

    const byType = {};
    let weightedSum = 0;
    let weightTotal = 0;
    let plainSum = 0;

    grades.forEach(g => {
      const key = g.assessmentType || 'Other';
      byType[key] = byType[key] || { type: key, count: 0, total: 0, weight: weightByType.get(key) || 0 };
      byType[key].count += 1;
      byType[key].total += g.score || 0;
      plainSum += g.score || 0;

      const weight = weightByType.get(key);
      if (hasWeights && weight > 0) {
        weightedSum += (g.score || 0) * weight;
        weightTotal += weight;
      }
    });

    const average = hasWeights && weightTotal > 0
      ? Math.round(weightedSum / weightTotal)
      : grades.length ? Math.round(plainSum / grades.length) : 0;

    res.json({
      success: true,
      student: {
        _id: student._id,
        fullName: student.fullName,
        studentId: student.studentId,
        class: student.classId ? `${student.classId.grade} ${student.classId.className}` : 'Not Assigned'
      },
      term,
      year: Number(year),
      grades,
      breakdown: Object.values(byType).map(t => ({
        type: t.type,
        count: t.count,
        weight: t.weight,
        average: t.count ? Math.round(t.total / t.count) : 0
      })),
      average,
      letterGrade: letterGrade(average),
      weighted: hasWeights
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
