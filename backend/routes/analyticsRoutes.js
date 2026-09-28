const express = require('express');

const Attendance = require('../models/Attendance');
const Grade = require('../models/Grade');
const Class = require('../models/Class');
const Student = require('../models/Student');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');

const router = express.Router();

const manage = requireRole('academic_admin', 'super_admin');

const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

const classLabel = (c) => (c ? `${c.grade || ''} ${c.className || ''}`.trim() : 'Not Assigned');

// School-wide attendance for a date range, with a per-day and per-class split.
router.get('/attendance-overview', authMiddleware, manage, async (req, res) => {
  try {
    const { from, to, classId } = req.query;
    const start = from ? new Date(from) : new Date(Date.now() - 29 * 864e5);
    const end = to ? new Date(to) : new Date();

    const classes = await Class.find(classId ? { _id: classId } : {}).select('className grade');
    const classIds = classes.map(c => c._id);
    const classById = new Map(classes.map(c => [String(c._id), c]));

    const records = await Attendance.find({
      classId: { $in: classIds },
      date: { $gte: start, $lte: end }
    }).populate('studentId', 'fullName studentId');

    const byDay = {};
    const byClass = {};
    const chronic = new Map();

    records.forEach(r => {
      const d = dayKey(r.date);
      const isPresent = r.status === 'present';

      byDay[d] = byDay[d] || { date: d, present: 0, absent: 0, late: 0, excused: 0, total: 0 };
      byDay[d].total += 1;
      if (r.status === 'present') byDay[d].present += 1;
      else if (r.status === 'late') { byDay[d].late += 1; byDay[d].present += 1; }
      else if (r.status === 'excused') byDay[d].excused += 1;
      else byDay[d].absent += 1;

      const cid = String(r.classId);
      byClass[cid] = byClass[cid] || { classId: cid, className: classLabel(classById.get(cid)), present: 0, absent: 0, total: 0 };
      byClass[cid].total += 1;
      if (isPresent || r.status === 'late') byClass[cid].present += 1;
      else byClass[cid].absent += 1;

      const sid = String(r.studentId?._id || r.studentId);
      chronic.set(sid, (chronic.get(sid) || 0) + (isPresent || r.status === 'late' ? 0 : 1));
    });

    const daily = Object.values(byDay)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, rate: d.total ? Math.round((d.present / d.total) * 100) : 0 }));

    const classRows = Object.values(byClass).map(c => ({
      ...c,
      rate: c.total ? Math.round((c.present / c.total) * 100) : 0
    })).sort((a, b) => a.rate - b.rate);

    const totals = daily.reduce((acc, d) => {
      acc.present += d.present; acc.absent += d.absent; acc.total += d.total;
      return acc;
    }, { present: 0, absent: 0, total: 0 });

    const topAbsentees = [...chronic.entries()]
      .filter(([, absences]) => absences > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    const absentees = topAbsentees.length
      ? await Student.find({ _id: { $in: topAbsentees.map(([id]) => id) } })
          .populate('classId', 'grade className')
      : [];
    const absentById = new Map(absentees.map(s => [String(s._id), s]));

    res.json({
      success: true,
      range: { from: start, to: end },
      summary: {
        ...totals,
        rate: totals.total ? Math.round((totals.present / totals.total) * 100) : 0,
        schoolDays: daily.length
      },
      daily,
      byClass: classRows,
      chronicAbsentees: topAbsentees.map(([id, count]) => {
        const s = absentById.get(id);
        return {
          _id: id,
          name: s?.fullName || 'Unknown',
          studentCode: s?.studentId || '—',
          className: s?.classId ? classLabel(s.classId) : '—',
          absences: count
        };
      })
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Term-over-term and year-over-year average comparison per class.
router.get('/performance-comparison', authMiddleware, manage, async (req, res) => {
  try {
    const { classId } = req.query;
    const classes = await Class.find(classId ? { _id: classId } : {}).select('className grade');
    const classIds = classes.map(c => c._id);
    const classById = new Map(classes.map(c => [String(c._id), c]));

    const grades = await Grade.find({ }).populate('studentId', 'classId');

    const relevant = grades.filter(g => {
      const cid = g.studentId?.classId?._id || g.studentId?.classId;
      return cid && classIds.includes(String(cid));
    });

    const buckets = new Map();
    relevant.forEach(g => {
      const cid = String(g.studentId.classId?._id || g.studentId.classId);
      const key = `${cid}|${g.term || 'Unassigned'}|${g.year || '—'}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          classId: cid,
          className: classLabel(classById.get(cid)),
          term: g.term || 'Unassigned',
          year: g.year || '—',
          total: 0,
          count: 0
        });
      }
      const b = buckets.get(key);
      b.total += g.score || 0;
      b.count += 1;
    });

    const byClassTerm = new Map();
    for (const b of buckets.values()) {
      const average = b.count ? Math.round(b.total / b.count) : 0;
      if (!byClassTerm.has(b.classId)) byClassTerm.set(b.classId, []);
      byClassTerm.get(b.classId).push({ term: b.term, year: b.year, average, entries: b.count });
    }

    const comparison = [...byClassTerm.entries()].map(([cid, series]) => {
      const ordered = series.sort((a, b) => String(a.year).localeCompare(String(b.year)) || String(a.term).localeCompare(String(b.term)));
      const first = ordered[0]?.average ?? 0;
      const last = ordered[ordered.length - 1]?.average ?? 0;
      return {
        classId: cid,
        className: classLabel(classById.get(cid)),
        series: ordered,
        change: last - first,
        direction: last > first ? 'up' : last < first ? 'down' : 'flat'
      };
    }).sort((a, b) => (b.series[b.series.length - 1]?.average || 0) - (a.series[a.series.length - 1]?.average || 0));

    res.json({ success: true, comparison });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Students at risk: low attendance and low grades together.
router.get('/at-risk-students', authMiddleware, manage, async (req, res) => {
  try {
    const { term, year, attendanceThreshold = 80, scoreThreshold = 50 } = req.query;

    const students = await Student.find({ isActive: true }).populate('classId', 'grade className');
    if (!students.length) return res.json({ success: true, students: [] });

    const ids = students.map(s => s._id);
    const [attendance, grades] = await Promise.all([
      Attendance.find({ studentId: { $in: ids } }),
      term && year ? Grade.find({ studentId: { $in: ids }, term, year: Number(year) }) : Promise.resolve([])
    ]);

    const attByStudent = new Map();
    attendance.forEach(a => {
      const key = String(a.studentId);
      if (!attByStudent.has(key)) attByStudent.set(key, { total: 0, present: 0 });
      const b = attByStudent.get(key);
      b.total += 1;
      if (a.status === 'present' || a.status === 'late') b.present += 1;
    });

    const gradesByStudent = new Map();
    grades.forEach(g => {
      const key = String(g.studentId);
      if (!gradesByStudent.has(key)) gradesByStudent.set(key, []);
      gradesByStudent.get(key).push(g);
    });

    const rows = [];
    students.forEach(s => {
      const att = attByStudent.get(String(s._id)) || { total: 0, present: 0 };
      const attendanceRate = att.total ? Math.round((att.present / att.total) * 100) : null;
      const list = gradesByStudent.get(String(s._id)) || [];
      const average = list.length ? Math.round(list.reduce((a, g) => a + (g.score || 0), 0) / list.length) : null;

      const reasons = [];
      if (attendanceRate !== null && attendanceRate < Number(attendanceThreshold)) reasons.push(`Attendance ${attendanceRate}%`);
      if (average !== null && average < Number(scoreThreshold)) reasons.push(`Average ${average}%`);
      if (!reasons.length) return;

      rows.push({
        _id: s._id,
        name: s.fullName,
        studentCode: s.studentId,
        className: s.classId ? classLabel(s.classId) : 'Not Assigned',
        attendanceRate,
        average,
        reasons,
        severity: reasons.length === 2 ? 'high' : 'medium'
      });
    });

    rows.sort((a, b) => (b.reasons.length - a.reasons.length) || ((a.attendanceRate ?? 101) - (b.attendanceRate ?? 101)));

    res.json({ success: true, count: rows.length, students: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
