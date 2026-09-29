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
const { authorizeStudentAccess, teacherOwnsClass } = require('../utils/access');
const { buildWeightIndex, averageFor, letterFor } = require('../utils/grading');

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

    // Authorise against the student's relationship to this teacher rather than
    // just the caller's role. Without this any teacher account could post a
    // score for any student in the school, including students in other
    // teachers' classes, and silently corrupt their report cards.
    const student = await Student.findById(studentId).select('_id fullName classId');
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const { userRole } = req;
    const isAdmin = userRole === 'super_admin' || userRole === 'academic_admin';
    if (!isAdmin && !(await authorizeStudentAccess(req, student))) {
      return res.status(403).json({ message: 'You are not assigned to this student' });
    }

    // Reject non-numeric scores up front. Storing a string here would be coerced
    // back to a number by the model, but only after it has already been
    // persisted and can reach the weighted-average calculation.
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      return res.status(400).json({ message: 'score must be a number' });
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
    if (!classId || !Array.isArray(records) || !records.length) {
      return res.status(400).json({ message: 'classId and a non-empty records array are required' });
    }

    // Class-wide write, so authorise the class rather than each student.
    if (req.userRole !== 'super_admin' && req.userRole !== 'academic_admin') {
      if (!(await teacherOwnsClass(req.userId, classId))) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
      }
    }

    // Reject unknown students rather than writing orphaned attendance rows that
    // silently never show up in any register or attendance rate.
    const students = await Student.find({ _id: { $in: records.map(r => r.studentId) } }).select('_id classId');
    const known = new Set(students.map(s => String(s._id)));
    const unknown = records.filter(r => !known.has(String(r.studentId)));
    if (unknown.length) {
      return res.status(400).json({ message: `Unknown studentId(s): ${unknown.map(r => r.studentId).join(', ')}` });
    }

    // Normalise the day to midnight UTC so re-saving the same date updates the
    // existing rows instead of appending a second register for that day.
    const day = new Date(date);
    if (Number.isNaN(day.getTime())) return res.status(400).json({ message: 'Invalid date' });
    day.setUTCHours(0, 0, 0, 0);

    const bulk = records.map(r => ({
      updateOne: {
        filter: { studentId: r.studentId, classId, date: day },
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
    const isAdmin = req.userRole === 'super_admin' || req.userRole === 'academic_admin';
    if (!isAdmin && !(await teacherOwnsClass(req.userId, req.params.classId))) {
      return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    const query = { classId: req.params.classId };
    if (date) {
      const day = new Date(date);
      if (Number.isNaN(day.getTime())) return res.status(400).json({ message: 'Invalid date' });
      day.setUTCHours(0, 0, 0, 0);
      query.date = day;
    }
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

// ==================== EXAM MARK ENTRY ====================
// One screen of mark entry covers a whole class, so a teacher would otherwise
// have to POST /teacher/grades once per student. On a class of forty that is
// forty round trips, and any failure halfway through leaves the register
// half-populated with no way to tell which half.

// Returns the student list for an exam, together with whatever marks already
// exist, so the entry grid can be rendered in one request.
router.get('/teacher/exams/:examId/marks', authMiddleware, requireRole('teacher', 'academic_admin', 'super_admin'), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    const isAdmin = req.userRole === 'super_admin' || req.userRole === 'academic_admin';
    if (!isAdmin) {
      // The exam names its classes; the teacher must be responsible for at
      // least one of them, otherwise the grid would expose other classes.
      const owned = await Promise.all(
        exam.classIds.map(id => teacherOwnsClass(req.userId, id))
      );
      if (!owned.some(Boolean)) {
        return res.status(403).json({ message: 'You are not assigned to any class in this exam' });
      }
    }

    const classIds = exam.classIds;
    const students = await Student.find({ classId: { $in: classIds } })
      .select('fullName studentId classId')
      .sort({ fullName: 1 });

    const existing = await Grade.find({ assessmentId: exam._id });
    const marksByStudent = new Map();
    existing.forEach(g => {
      if (!marksByStudent.has(String(g.studentId))) marksByStudent.set(String(g.studentId), []);
      marksByStudent.get(String(g.studentId)).push(g);
    });

    res.json({
      exam,
      students,
      marks: existing,
      // Per-student subject breakdown, since one student can sit an exam in
      // more than one subject and each needs its own row in the grid.
      byStudent: Object.fromEntries(marksByStudent)
    });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ message: 'Invalid exam id' });
    res.status(500).json({ message: error.message });
  }
});

// Bulk-upserts a whole class of marks for one exam.
//
// Absent scores are treated as "not sat" and stored as null rather than 0, so a
// student who missed the paper is not silently given a zero and ranked last.
// A real 0 (they sat it and scored nothing) is preserved.
router.post('/teacher/exams/:examId/marks', authMiddleware, requireRole('teacher', 'academic_admin', 'super_admin'), async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    const { subject, term, year, marks } = req.body;
    if (!subject || !term || !year) {
      return res.status(400).json({ message: 'subject, term and year are required' });
    }
    if (!Array.isArray(marks)) {
      return res.status(400).json({ message: 'marks must be an array' });
    }

    const isAdmin = req.userRole === 'super_admin' || req.userRole === 'academic_admin';
    if (!isAdmin) {
      const owned = await Promise.all(exam.classIds.map(id => teacherOwnsClass(req.userId, id)));
      if (!owned.some(Boolean)) {
        return res.status(403).json({ message: 'You are not assigned to any class in this exam' });
      }
    }

    const students = await Student.find({ _id: { $in: marks.map(m => m.studentId) } })
      .select('_id classId');
    const byId = new Map(students.map(s => [String(s._id), s]));

    // Reject the whole batch if any id is unknown or belongs to a class outside
    // the exam. A partially applied register is worse than a rejected one,
    // because the teacher has no way to see which rows were written.
    for (const m of marks) {
      const student = byId.get(String(m.studentId));
      if (!student) {
        return res.status(400).json({ message: `Unknown studentId: ${m.studentId}` });
      }
      if (!exam.classIds.some(id => String(id) === String(student.classId))) {
        return res.status(400).json({ message: `Student ${m.studentId} is not in a class covered by this exam` });
      }
      if (m.score !== null && m.score !== undefined && m.score !== '') {
        const n = Number(m.score);
        if (!Number.isFinite(n)) {
          return res.status(400).json({ message: `Invalid score for student ${m.studentId}` });
        }
        if (n < 0 || n > (exam.maxScore || 100)) {
          return res.status(400).json({ message: `Score for student ${m.studentId} must be between 0 and ${exam.maxScore || 100}` });
        }
      }
    }

    const ops = marks.map(m => {
      const score = (m.score === null || m.score === undefined || m.score === '') ? null : Number(m.score);
      return {
        updateOne: {
          filter: { studentId: m.studentId, subject, term, year: Number(year), assessmentId: exam._id },
          update: {
            $set: {
              score,
              assessmentType: exam.type,
              teacherId: req.userId,
              updatedAt: new Date()
            },
            $setOnInsert: { createdAt: new Date() }
          },
          upsert: true
        }
      };
    });
    if (ops.length) await Grade.bulkWrite(ops);

    res.json({ success: true, saved: ops.length });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ message: 'Invalid exam id' });
    res.status(500).json({ message: error.message });
  }
});

// ==================== GRADEBOOK ====================
// The gradebook and the report card are the same numbers seen by two different
// people, so this reuses utils/grading.js rather than re-deriving an average
// here. A teacher who sees a different figure in the gradebook than appears on
// a report card has no way to reconcile the two.
router.get('/teacher/gradebook', authMiddleware, requireRole('teacher', 'academic_admin', 'super_admin'), async (req, res) => {
  try {
    const { classId, term, year, subject } = req.query;
    if (!term || !year) return res.status(400).json({ message: 'term and year are required' });

    let classes;
    if (classId) {
      const isAdmin = req.userRole === 'super_admin' || req.userRole === 'academic_admin';
      if (!isAdmin && !(await teacherOwnsClass(req.userId, classId))) {
        return res.status(403).json({ message: 'You are not assigned to this class' });
      }
      classes = await Class.findById(classId).select('className grade');
      if (!classes) return res.status(404).json({ message: 'Class not found' });
      classes = [classes];
    } else if (req.userRole === 'teacher') {
      classes = await Class.find({ teacherId: req.userId }).select('className grade');
    } else {
      classes = await Class.find().select('className grade');
    }

    const classIds = classes.map(c => c._id);
    if (!classIds.length) {
      return res.json({ classes: [], assessments: [], rows: [], subjectTotals: [] });
    }

    const students = await Student.find({ classId: { $in: classIds } })
      .select('fullName studentId classId')
      .sort({ fullName: 1 });
    const studentIds = students.map(s => s._id);

    const gradeQuery = { studentId: { $in: studentIds }, term, year: Number(year) };
    if (subject) gradeQuery.subject = subject;

    const [grades, exams] = await Promise.all([
      Grade.find(gradeQuery),
      // Only assessments belonging to these classes, so the column headers
      // cannot leak the existence of an exam sat by a different class.
      Exam.find({ classIds: { $in: classIds }, term, year: Number(year) })
        .select('name type weight maxScore term year')
    ]);

    const weightIndex = buildWeightIndex(exams);
    const { hasWeights } = weightIndex;

    // Cell lookup keyed student -> assessment -> grade row, so the grid renders
    // without the client having to reshape the flat grade list.
    const cellByStudent = new Map();
    grades.forEach(g => {
      if (!g.assessmentId) return;
      const sKey = String(g.studentId);
      if (!cellByStudent.has(sKey)) cellByStudent.set(sKey, new Map());
      cellByStudent.get(sKey).set(String(g.assessmentId), g);
    });

    const gradesByStudent = new Map();
    grades.forEach(g => {
      const key = String(g.studentId);
      if (!gradesByStudent.has(key)) gradesByStudent.set(key, []);
      gradesByStudent.get(key).push(g);
    });

    const classById = new Map(classes.map(c => [String(c._id), c]));
    const subjects = [...new Set(grades.map(g => g.subject).filter(Boolean))].sort();

    const rows = students.map(s => {
      const list = gradesByStudent.get(String(s._id)) || [];
      const { average, count, graded } = averageFor(list, weightIndex);

      const cells = {};
      (cellByStudent.get(String(s._id)) || new Map()).forEach((g, examKey) => {
        cells[examKey] = {
          score: g.score,
          subject: g.subject,
          maxScore: (weightIndex.byId.get(examKey) || {}).maxScore || 100
        };
      });

      // Per-subject averages, because the overall figure alone hides a student
      // who is strong overall but failing one subject.
      const bySubject = {};
      list.forEach(g => {
        const key = g.subject || 'General';
        if (!bySubject[key]) bySubject[key] = [];
        bySubject[key].push(g);
      });
      const subjectAverages = Object.entries(bySubject).map(([name, list2]) => {
        const r = averageFor(list2, weightIndex);
        return { subject: name, average: r.average, grade: letterFor(r.average) };
      }).sort((a, b) => a.subject.localeCompare(b.subject));

      const cls = classById.get(String(s.classId));
      return {
        studentId: s._id,
        studentCode: s.studentId,
        name: s.fullName,
        classId: s.classId,
        className: cls ? `${cls.grade || ''} ${cls.className || ''}`.trim() : 'Not Assigned',
        average,
        grade: letterFor(average),
        gradedCount: graded,
        entryCount: count,
        cells,
        subjects: subjectAverages
      };
    });

    rows.sort((a, b) => (b.average ?? -1) - (a.average ?? -1) || a.name.localeCompare(b.name));

    // Rank within class, matching the report card's tie handling so both show
    // the same position for a tied pair.
    const perClass = new Map();
    rows.forEach(r => {
      if (!perClass.has(String(r.classId))) perClass.set(String(r.classId), []);
      perClass.get(String(r.classId)).push(r);
    });
    perClass.forEach(list => {
      let i = 0;
      while (i < list.length) {
        let j = i;
        while (j + 1 < list.length && list[j + 1].average === list[i].average) j += 1;
        for (let k = i; k <= j; k += 1) list[k].rank = i + 1;
        i = j + 1;
      }
    });

    // Class mean per subject, for the summary row at the foot of the grid.
    const subjectTotals = subjects.map(name => {
      const values = rows
        .map(r => (r.subjects.find(x => x.subject === name) || {}).average)
        .filter(v => typeof v === 'number');
      return {
        subject: name,
        mean: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null,
        entries: values.length
      };
    });

    res.json({
      term,
      year: Number(year),
      weighted: hasWeights,
      classes: classes.map(c => ({ _id: c._id, label: `${c.grade || ''} ${c.className || ''}`.trim() })),
      subjects,
      assessments: exams.map(e => ({
        _id: e._id, name: e.name, type: e.type,
        weight: e.weight || 0, maxScore: e.maxScore || 100
      })),
      rows,
      subjectTotals
    });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ message: 'Invalid class id' });
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;