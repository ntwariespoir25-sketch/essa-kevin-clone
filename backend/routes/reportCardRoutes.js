const express = require('express');

const Grade = require('../models/Grade');
const Exam = require('../models/Exam');
const Student = require('../models/Student');
const Class = require('../models/Class');
const Attendance = require('../models/Attendance');
const SubjectAllocation = require('../models/SubjectAllocation');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');
const { authorizeStudentAccess } = require('../utils/access');

const router = express.Router();

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const letterGrade = (pct) => {
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 50) return 'D';
  return 'F';
};

const GRADE_POINTS = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };

const rankWord = (rank) => {
  if (rank === 1) return '1st';
  if (rank === 2) return '2nd';
  if (rank === 3) return '3rd';
  return `${rank}th`;
};

// Loads every grade for a term, derives a weighted average per student, then
// ranks within each class. Ranking is done in memory because it depends on the
// whole class cohort, which MongoDB cannot express without a self-join.
const buildTermResults = async ({ classId, term, year }) => {
  const classQuery = classId ? { _id: classId } : {};
  const classes = await Class.find(classQuery).select('className grade academicYear');
  const classIds = classes.map(c => c._id);

  const students = await Student.find({ classId: { $in: classIds } })
    .select('fullName studentId classId')
    .sort({ fullName: 1 });
  const studentIds = students.map(s => s._id);

  const [grades, exams, attendance, allocations] = await Promise.all([
    Grade.find({ studentId: { $in: studentIds }, term, year: Number(year) }),
    Exam.find({ term, year: Number(year) }),
    Attendance.find({ studentId: { $in: studentIds } }),
    SubjectAllocation.find({ classId: { $in: classIds } }).select('classId subject')
  ]);

  const weightByType = new Map(exams.map(e => [e.type, e.weight || 0]));
  const hasWeights = [...weightByType.values()].some(w => w > 0);

  const subjectsByClass = new Map();
  allocations.forEach(a => {
    const key = String(a.classId);
    if (!subjectsByClass.has(key)) subjectsByClass.set(key, new Set());
    subjectsByClass.get(key).add(a.subject);
  });

  const gradesByStudent = new Map();
  grades.forEach(g => {
    const key = String(g.studentId);
    if (!gradesByStudent.has(key)) gradesByStudent.set(key, []);
    gradesByStudent.get(key).push(g);
  });

  const attendanceByStudent = new Map();
  attendance.forEach(a => {
    const key = String(a.studentId);
    if (!attendanceByStudent.has(key)) attendanceByStudent.set(key, { total: 0, present: 0 });
    const bucket = attendanceByStudent.get(key);
    bucket.total += 1;
    if (a.status === 'present') bucket.present += 1;
  });

  const classById = new Map(classes.map(c => [String(c._id), c]));

  const perClass = new Map();
  const rows = students.map(s => {
    const classIdStr = String(s.classId);
    if (!perClass.has(classIdStr)) perClass.set(classIdStr, []);

    const list = gradesByStudent.get(String(s._id)) || [];
    const bySubject = {};
    list.forEach(g => {
      const key = g.subject || 'General';
      bySubject[key] = bySubject[key] || { subject: key, total: 0, count: 0, weightedSum: 0, weightTotal: 0 };
      bySubject[key].count += 1;
      bySubject[key].total += g.score || 0;
      if (hasWeights) {
        const w = weightByType.get(g.assessmentType || 'Other') || 0;
        bySubject[key].weightedSum += (g.score || 0) * w;
        bySubject[key].weightTotal += w;
      }
    });

    const subjects = Object.values(bySubject).map(sub => {
      const average = hasWeights && sub.weightTotal > 0
        ? Math.round(sub.weightedSum / sub.weightTotal)
        : Math.round(sub.total / sub.count);
      return { subject: sub.subject, average, grade: letterGrade(average) };
    }).sort((a, b) => a.subject.localeCompare(b.subject));

    const sum = subjects.reduce((a, b) => a + b.average, 0);
    const average = subjects.length ? Math.round(sum / subjects.length) : 0;
    const gpa = subjects.length
      ? Math.round((subjects.reduce((a, b) => a + (GRADE_POINTS[b.grade] ?? 0), 0) / subjects.length) * 100) / 100
      : 0;

    const att = attendanceByStudent.get(String(s._id)) || { total: 0, present: 0 };
    const attendanceRate = att.total ? Math.round((att.present / att.total) * 100) : 0;

    const row = {
      studentId: s._id,
      studentCode: s.studentId,
      name: s.fullName,
      classId: s.classId,
      className: classById.get(classIdStr)
        ? `${classById.get(classIdStr).grade || ''} ${classById.get(classIdStr).className || ''}`.trim()
        : 'Not Assigned',
      subjects,
      average,
      grade: letterGrade(average),
      gpa,
      totalMarks: sum,
      attendanceRate,
      rank: 0,
      position: ''
    };

    perClass.get(classIdStr).push(row);
    return row;
  });

  perClass.forEach(rowsInClass => {
    rowsInClass.sort((a, b) => b.average - a.average || b.totalMarks - a.totalMarks);
    const size = rowsInClass.length;
    let i = 0;
    while (i < size) {
      let j = i;
      while (j + 1 < size && rowsInClass[j + 1].average === rowsInClass[i].average) j += 1;
      const rank = i + 1;
      for (let k = i; k <= j; k += 1) rowsInClass[k].rank = rank;
      i = j + 1;
    }
    rowsInClass.forEach(r => {
      r.position = rankWord(r.rank);
    });
  });

  rows.sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
  return { rows, hasWeights, subjectsByClass, classes };
};

router.get('/report-cards', authMiddleware, requireRole('academic_admin', 'super_admin', 'discipline_admin'), async (req, res) => {
  try {
    const { classId, term, year } = req.query;
    if (!term || !year) return res.status(400).json({ message: 'term and year are required' });

    const { rows, hasWeights } = await buildTermResults({ classId, term, year });
    res.json({ success: true, term, year: Number(year), weighted: hasWeights, count: rows.length, reportCards: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/report-cards/:studentId', authMiddleware, async (req, res) => {
  try {
    const { term, year } = req.query;
    if (!term || !year) return res.status(400).json({ message: 'term and year are required' });

    const student = await Student.findById(req.params.studentId).populate('classId', 'grade className');
    if (!student) return res.status(404).json({ message: 'Student not found' });

    if (!(await authorizeStudentAccess(req, student))) {
      return res.status(403).json({ message: 'You are not allowed to view this student\'s report card' });
    }

    const { rows } = await buildTermResults({ classId: student.classId, term, year });
    const card = rows.find(r => String(r.studentId) === String(student._id));
    if (!card) return res.status(404).json({ message: 'No results for this term' });

    res.json({
      success: true,
      reportCard: {
        ...card,
        student: {
          _id: student._id,
          fullName: student.fullName,
          studentId: student.studentId,
          class: student.classId ? `${student.classId.grade} ${student.classId.className}` : 'Not Assigned',
          academicYear: student.classId?.academicYear || null
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Class distribution used by the performance comparison charts.
router.get('/report-cards/:studentId/print', authMiddleware, async (req, res) => {
  try {
    const { term, year } = req.query;
    if (!term || !year) return res.status(400).json({ message: 'term and year are required' });

    const student = await Student.findById(req.params.studentId).populate('classId', 'grade className');
    if (!student) return res.status(404).json({ message: 'Student not found' });

    if (!(await authorizeStudentAccess(req, student))) {
      return res.status(403).json({ type: 'text/html', message: 'You are not allowed to view this student\'s report card' });
    }

    const { rows } = await buildTermResults({ classId: student.classId, term, year });
    const card = rows.find(r => String(r.studentId) === String(student._id));
    if (!card) return res.status(404).json({ type: 'text/html', message: 'No results for this term' });

    const classSize = rows.length;
    const subjectNames = card.subjects.map(s => s.subject);
    const subjectMax = subjectNames.length;
    const subjectTotal = card.subjects.reduce((a, b) => a + b.average, 0);

    const row = (label, value) => `<tr><td style="padding:4px 8px;border:1px solid #333">${label}</td><td style="padding:4px 8px;border:1px solid #333;text-align:center;font-weight:700">${value}</td></tr>`;

    const name = escapeHtml(student.fullName);
    const className = student.classId ? escapeHtml(`${student.classId.grade} ${student.classId.className}`) : 'Not Assigned';

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Report Card — ${name}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #000; margin: 0; padding: 24px; }
  .sheet { max-width: 760px; margin: 0 auto; }
  h1 { text-align: center; font-size: 20px; margin: 0 0 2px; letter-spacing: 1px; }
  .sub { text-align: center; font-size: 12px; margin: 0 0 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { border: 1px solid #333; padding: 6px 8px; background: #eee; text-align: left; }
  td { border: 1px solid #333; padding: 4px 8px; }
  .grid td { width: 50%; }
  .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; }
  @media print { body { padding: 0; } .noprint { display: none; } }
</style></head>
<body>
<div class="sheet">
  <h1>ESSA NYARUGUNGA</h1>
  <p class="sub">Ecole Secondaire des Science et Administrative &middot; Indatwa Village, Kamashashi Cell, Nyarugunga Sector, Kicukiro District, Kigali, Rwanda</p>
  <p class="sub"><strong>REPORT CARD — ${escapeHtml(term)} ${escapeHtml(year)}</strong></p>
  <table class="grid" style="margin-bottom:12px">
    ${row('Student', name)}
    ${row('Student Number', escapeHtml(student.studentId || '—'))}
    ${row('Class', className)}
    ${row('Academic Year', escapeHtml(student.classId?.academicYear || year))}
  </table>
  <table>
    <thead><tr><th>Subject</th><th>Score (%)</th><th>Grade</th></tr></thead>
    <tbody>
      ${card.subjects.map(s => `<tr><td>${escapeHtml(s.subject)}</td><td style="text-align:center">${s.average}</td><td style="text-align:center;font-weight:700">${s.grade}</td></tr>`).join('')}
      ${subjectMax === 0 ? '<tr><td colspan="3" style="text-align:center">No results recorded for this term</td></tr>' : ''}
    </tbody>
    <tfoot>
      <tr><td><strong>Total</strong></td><td style="text-align:center"><strong>${subjectTotal}</strong></td><td></td></tr>
      <tr><td><strong>Average</strong></td><td style="text-align:center"><strong>${card.average}</strong></td><td style="text-align:center;font-weight:700">${card.grade}</td></tr>
      <tr><td><strong>GPA</strong></td><td style="text-align:center"><strong>${card.gpa}</strong></td><td></td></tr>
      <tr><td><strong>Position in Class</strong></td><td style="text-align:center" colspan="2"><strong>${card.position} of ${classSize}</strong></td></tr>
      <tr><td><strong>Attendance</strong></td><td style="text-align:center" colspan="2"><strong>${card.attendanceRate}%</strong></td></tr>
    </tfoot>
  </table>
  <div class="footer">
    <div>_______________________<br/>Class Teacher</div>
    <div>_______________________<br/>Principal</div>
    <div>_______________________<br/>Parent / Guardian</div>
  </div>
</div>
<p class="noprint" style="text-align:center;margin-top:24px">
  <button onclick="window.print()" style="padding:8px 18px;font-size:14px;cursor:pointer">Print this report card</button>
</p>
</body></html>`;

    res.type('html').send(html);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
