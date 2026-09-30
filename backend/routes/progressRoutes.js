const express = require('express');

const Class = require('../models/Class');
const Student = require('../models/Student');
const Grade = require('../models/Grade');
const Exam = require('../models/Exam');
const Attendance = require('../models/Attendance');
const Assignment = require('../models/Assignment');
const SubjectAllocation = require('../models/SubjectAllocation');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');
const { teacherOwnsClass } = require('../utils/access');
const { buildWeightIndex, averageFor, letterFor } = require('../utils/grading');

const router = express.Router();

const PROGRESS_ROLES = ['teacher', 'academic_admin', 'super_admin'];
const isProgressStaff = (role) => role === 'academic_admin' || role === 'super_admin';

// Everything below 50 is an F on the report card scale, so that is the line a
// pupil has to stay above. Below 75% attendance is the other half of the risk
// test, and matches the 75 mark used elsewhere in the school.
const PASS_MARK = 50;
const ATTENDANCE_FLOOR = 75;

// A pupil sitting under half the work set is treated as at risk. Half, not "any
// outstanding work": with weekly deadlines every pupil always has something
// outstanding, and a rule that fires on that flags the entire class.
const SUBMISSION_FLOOR = 0.5;

const roundPct = (score, max) => (max > 0 ? Math.round((score / max) * 100) : 0);

const mean = (values) => {
  const clean = values.filter((v) => Number.isFinite(v));
  return clean.length ? Math.round(clean.reduce((a, b) => a + b, 0) / clean.length) : null;
};

// Counts sessions actually marked present or absent. Records with any other
// status are neither: counting an unmarked day as an absence is how a pupil
// ends up recorded as truant for sessions that were never taken.
const attendanceRate = (records) => {
  const decided = records.filter((r) => r.status === 'present' || r.status === 'absent');
  if (!decided.length) return null;
  const present = decided.filter((r) => r.status === 'present').length;
  return Math.round((present / decided.length) * 100);
};

// The classes this account may read, each proven to belong to it. A teacher's
// homeroom classes plus any subject they are allocated to; staff see all of
// them. The set is assembled from the database, never from a class id supplied
// by the browser.
const progressClasses = async (req) => {
  if (isProgressStaff(req.userRole)) {
    return Class.find().select('_id grade className teacherId').sort({ grade: 1, className: 1 }).lean();
  }

  const allocated = await SubjectAllocation.find({ teacherId: req.userId }).distinct('classId');
  const homeroom = await Class.find({ teacherId: req.userId }).select('_id grade className teacherId').lean();

  const byId = new Map();
  for (const c of homeroom) byId.set(String(c._id), c);
  if (allocated.length) {
    // The allocations themselves are the proof of entitlement for a class with
    // no homeroom teacher, so those rows are fetched and checked rather than
    // trusted blind from the distinct list.
    const extra = await Class.find({ _id: { $in: allocated } }).select('_id grade className teacherId').lean();
    for (const c of extra) {
      if (!(await teacherOwnsClass(req.userId, c._id))) continue;
      if (!byId.has(String(c._id))) byId.set(String(c._id), c);
    }
  }

  return [...byId.values()];
};

// The assessments that belong to a class. A Grade row has no classId of its own:
// the class is recorded on the assessment, and the mark points at it through
// assessmentId. Filtering on Grade.classId would silently match nothing, which is
// how a whole class appears to have no marks at all.
const classExams = async (classId) =>
  Exam.find({ classIds: classId }).select('_id name type weight maxScore').lean();

// A pupil's marks for one class: the ones whose assessment targets this class,
// plus any legacy row with no assessment attached.
//
// The unattached rows are included deliberately. They cannot be attributed to a
// class, and dropping them would quietly remove a pupil's real marks from their
// own report; the cost is that a pupil who changed class keeps those rows in
// view, which is a better failure than a mark disappearing.
const gradesForClass = (pupilId, examIds) => Grade.find({
  studentId: pupilId,
  $or: [
    ...(examIds.length ? [{ assessmentId: { $in: examIds } }] : []),
    { assessmentId: { $exists: false } },
    { assessmentId: null }
  ]
}).lean();

// One pupil in one class: marks via the shared weighted-average helper, plus
// attendance and work set. This is the shape both the roster and the pupil
// detail page use, so the two cannot drift apart.
const buildPupilProgress = async (pupil, classId, weightIndex, examIds = []) => {
  const [grades, attendance, assignments] = await Promise.all([
    gradesForClass(pupil._id, examIds),
    Attendance.find({ studentId: pupil._id, classId }).lean(),
    Assignment.find({ classId }).select('_id title subject dueDate totalPoints submissions').lean()
  ]);

  // The gradebook's own weighting, not a second implementation. A pupil who sees
  // 72% in the gradebook has to see 72% here or the marks are indefensible at a
  // parents' meeting.
  const averaged = averageFor(grades, weightIndex);
  const percentage = averaged.average;

  const decided = attendance.filter((r) => r.status === 'present' || r.status === 'absent');
  const attended = attendanceRate(attendance);

  // Submissions are embedded on the assignment, so "has this pupil handed it in"
  // is a membership test rather than a query of its own.
  const outstanding = assignments.filter(
    (a) => !(a.submissions || []).some((s) => String(s.studentId) === String(pupil._id))
  );

  return {
    pupil: {
      _id: pupil._id,
      fullName: pupil.fullName,
      studentId: pupil.studentId
    },
    marks: {
      percentage,
      letter: letterFor(percentage),
      passed: percentage === null ? null : percentage >= PASS_MARK,
      assessmentsGraded: averaged.count,
      // Graded rows that carried a weight, so a teacher can tell a term with one
      // weighted paper from a term with six.
      weighted: averaged.graded,
      subjects: [...new Set(grades.map((g) => g.subject).filter(Boolean))].sort()
    },
    attendance: {
      // null, not 0, when no session has been marked: a zero here would read as
      // "this pupil attended nothing" and flag a brand new class.
      percentage: attended,
      daysPresent: decided.filter((r) => r.status === 'present').length,
      daysAbsent: decided.filter((r) => r.status === 'absent').length,
      daysRecorded: decided.length
    },
    work: {
      assigned: assignments.length,
      submitted: assignments.length - outstanding.length,
      outstanding: outstanding.length,
      percentComplete: assignments.length
        ? Math.round(((assignments.length - outstanding.length) / assignments.length) * 100)
        : null
    },
    atRisk: (percentage !== null && percentage < PASS_MARK)
      || (attended !== null && attended < ATTENDANCE_FLOOR)
      || (assignments.length > 0
        && (assignments.length - outstanding.length) / assignments.length < SUBMISSION_FLOOR),
    riskReasons: [
      ...(percentage !== null && percentage < PASS_MARK ? ['Below the pass mark'] : []),
      ...(attended !== null && attended < ATTENDANCE_FLOOR ? ['Attendance under 75%'] : []),
      ...(assignments.length > 0
        && (assignments.length - outstanding.length) / assignments.length < SUBMISSION_FLOOR
        ? ['Most of the work set is outstanding'] : [])
    ]
  };
};

const summarise = (pupils) => {
  const marked = pupils.filter((p) => p.marks.percentage !== null);
  const attended = pupils.filter((p) => p.attendance.percentage !== null);
  return {
    pupilCount: pupils.length,
    averageMarks: mean(marked.map((p) => p.marks.percentage)),
    highestMarks: marked.length ? Math.max(...marked.map((p) => p.marks.percentage)) : null,
    lowestMarks: marked.length ? Math.min(...marked.map((p) => p.marks.percentage)) : null,
    passingCount: marked.filter((p) => p.marks.percentage >= PASS_MARK).length,
    failingCount: marked.filter((p) => p.marks.percentage < PASS_MARK).length,
    unmarkedCount: pupils.length - marked.length,
    averageAttendance: mean(attended.map((p) => p.attendance.percentage)),
    atRiskCount: pupils.filter((p) => p.atRisk).length,
    outstandingWorkCount: pupils.reduce((s, p) => s + p.work.outstanding, 0)
  };
};

const classLabel = (c) => `${c.grade} ${c.className}`.trim();

// Guards every class-scoped route. Returns the class or sends the refusal, so
// no handler can forget the check and read a class it does not own.
const loadOwnClass = async (req, res) => {
  const classes = await progressClasses(req);
  const found = classes.find((c) => String(c._id) === String(req.params.classId));
  if (!found) {
    res.status(403).json({ message: 'You are not responsible for that class' });
    return null;
  }
  return found;
};

// The weighting context for a class: every paper set for it, published or not,
// because a teacher reviewing a term's progress needs the same denominators the
// gradebook used.
const classMarkContext = async (classId) => {
  const exams = await classExams(classId);
  return {
    weightIndex: buildWeightIndex(exams),
    examIds: exams.map((e) => e._id),
    exams
  };
};

router.get('/teacher/progress/classes', authMiddleware, requireRole(...PROGRESS_ROLES), async (req, res) => {
  try {
    const classes = await progressClasses(req);
    if (!classes.length) return res.json({ classes: [] });

    const ids = classes.map((c) => c._id);

    const [pupilCounts, examAgg] = await Promise.all([
      Student.aggregate([
        { $match: { classId: { $in: ids }, isActive: { $ne: false } } },
        { $group: { _id: '$classId', count: { $sum: 1 } } }
      ]),
      // Class averages are summed here as raw score over raw max and only
      // converted to a percentage once, at the end. Averaging per-pupil
      // percentages and then averaging those would round twice and drift.
      Exam.aggregate([
        { $match: { classIds: { $in: ids } } },
        {
          $lookup: {
            from: 'grades',
            let: { examId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$assessmentId', '$$examId'] } } },
              { $match: { score: { $ne: null } } },
              { $group: { _id: null, score: { $sum: '$score' }, rows: { $sum: 1 } } }
            ],
            as: 'marks'
          }
        },
        {
          $project: {
            maxScore: 1,
            marks: { $ifNull: [{ $arrayElemAt: ['$marks', 0] }, { score: 0, rows: 0 }] }
          }
        }
      ])
    ]);

    const pupilsByClass = new Map(pupilCounts.map((p) => [String(p._id), p.count]));
    // Exam-level marks roll up to each class through the exams that class sits.
    const scoreByClass = new Map();
    for (const exam of examAgg) {
      const marks = exam.marks || {};
      if (!marks.rows) continue;
      const max = Number(exam.maxScore) || 100;
      for (const classId of exam.classIds || []) {
        const key = String(classId);
        const roll = scoreByClass.get(key) || { score: 0, max: 0 };
        roll.score += marks.score;
        roll.max += max * marks.rows;
        scoreByClass.set(key, roll);
      }
    }

    res.json({
      classes: classes.map((c) => {
        const roll = scoreByClass.get(String(c._id));
        const percentage = roll && roll.max > 0 ? roundPct(roll.score, roll.max) : null;
        return {
          _id: c._id,
          grade: c.grade,
          className: c.className,
          label: classLabel(c),
          pupilCount: pupilsByClass.get(String(c._id)) || 0,
          averageMarks: percentage,
          letter: letterFor(percentage)
        };
      })
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/teacher/progress/classes/:classId', authMiddleware, requireRole(...PROGRESS_ROLES), async (req, res) => {
  try {
    const classInfo = await loadOwnClass(req, res);
    if (!classInfo) return;

    const [pupils, markContext] = await Promise.all([
      Student.find({ classId: classInfo._id, isActive: { $ne: false } })
        .select('_id fullName studentId')
        .sort({ fullName: 1 })
        .lean(),
      classMarkContext(classInfo._id)
    ]);

    const progress = [];
    for (const pupil of pupils) {
      const built = await buildPupilProgress(pupil, classInfo._id, markContext.weightIndex, markContext.examIds);
      if (built) progress.push(built);
    }

    // Pupils who need help first. The sort is stable on marks within each risk
    // group, so the roster does not reshuffle between identical requests.
    progress.sort((a, b) => {
      if (a.atRisk !== b.atRisk) return a.atRisk ? -1 : 1;
      const am = a.marks.percentage;
      const bm = b.marks.percentage;
      if (am === null && bm === null) return 0;
      if (am === null) return 1;
      if (bm === null) return -1;
      return am - bm;
    });

    res.json({
      class: {
        _id: classInfo._id,
        grade: classInfo.grade,
        className: classInfo.className,
        label: classLabel(classInfo)
      },
      summary: summarise(progress),
      pupils: progress
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/teacher/progress/classes/:classId/pupils/:pupilId', authMiddleware, requireRole(...PROGRESS_ROLES), async (req, res) => {
  try {
    const classInfo = await loadOwnClass(req, res);
    if (!classInfo) return;

    // The pupil has to actually be in this class. Without that check a teacher
    // holding one class could pull a full transcript for any pupil in the school
    // just by editing the id.
    const pupil = await Student.findOne({
      _id: req.params.pupilId,
      classId: classInfo._id
    }).select('_id fullName studentId').lean();
    if (!pupil) {
      return res.status(404).json({ message: 'That pupil is not in this class' });
    }

    const markContext = await classMarkContext(classInfo._id);
    const progress = await buildPupilProgress(pupil, classInfo._id, markContext.weightIndex, markContext.examIds);

    // The individual mark sheets, so a disputed mark can be settled against the
    // actual entry rather than a percentage.
    const grades = await gradesForClass(pupil._id, markContext.examIds);
    grades.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const nameByAssessment = new Map(
      markContext.exams.map((e) => [String(e._id), e])
    );

    res.json({
      class: { _id: classInfo._id, label: classLabel(classInfo) },
      progress,
      marks: grades.map((g) => {
        const exam = nameByAssessment.get(String(g.assessmentId));
        const maxScore = exam ? Number(exam.maxScore) || 100 : null;
        const score = g.score === null || g.score === undefined ? null : Number(g.score);
        return {
          _id: g._id,
          subject: g.subject,
          assessment: exam ? exam.name : (g.assessmentType || 'Assessment'),
          score,
          // null when the paper is unknown, rather than a guessed 100: a
          // fabricated denominator is worse than an honest gap.
          maxScore,
          percentage: score === null || !maxScore ? null : Math.round((score / maxScore) * 100),
          letter: score === null ? '-' : letterFor(maxScore ? Math.round((score / maxScore) * 100) : null),
          term: g.term,
          year: g.year,
          recordedAt: g.createdAt,
          updatedAt: g.updatedAt
        };
      })
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
