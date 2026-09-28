const express = require('express');

const EnrollmentChange = require('../models/EnrollmentChange');
const Class = require('../models/Class');
const Student = require('../models/Student');
const Grade = require('../models/Grade');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');

const router = express.Router();

const manage = requireRole('academic_admin', 'super_admin');

const classLabel = (c) => (c ? `${c.grade || ''} ${c.className || ''}`.trim() : 'Not Assigned');

const averageFor = async (studentId, term, year) => {
  if (!term || !year) return null;
  const grades = await Grade.find({ studentId, term, year: Number(year) });
  if (!grades.length) return null;
  return Math.round(grades.reduce((a, g) => a + (g.score || 0), 0) / grades.length);
};

const moveStudent = async (student, fromClass, toClass) => {
  if (fromClass) {
    await Class.findByIdAndUpdate(fromClass._id, { $pull: { students: student._id } });
  }
  if (toClass) {
    student.classId = toClass._id;
    if (toClass.teacherId) student.teacherId = toClass.teacherId;
    await student.save();
    await Class.findByIdAndUpdate(toClass._id, { $addToSet: { students: student._id } });
  } else {
    student.classId = null;
    await student.save();
  }
};

// One student's history: used by the student record view and the parent portal.
router.get('/enrollment-changes', authMiddleware, manage, async (req, res) => {
  try {
    const query = {};
    if (req.query.studentId) query.studentId = req.query.studentId;
    if (req.query.year) query.year = Number(req.query.year);
    if (req.query.outcome) query.outcome = req.query.outcome;

    const changes = await EnrollmentChange.find(query)
      .populate('fromClassId', 'grade className')
      .populate('toClassId', 'grade className')
      .sort({ createdAt: -1 });

    res.json({ success: true, changes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// A preview of what a promotion run would do, so the admin sees the effect
// before committing it.
router.post('/enrollment-changes/promote/preview', authMiddleware, manage, async (req, res) => {
  try {
    const { fromClassId, toClassId, term, year, minAverage, maxAverage } = req.body;
    if (!fromClassId || !toClassId) {
      return res.status(400).json({ success: false, message: 'fromClassId and toClassId are required' });
    }
    if (String(fromClassId) === String(toClassId)) {
      return res.status(400).json({ success: false, message: 'Source and target class must differ' });
    }

    const [fromClass, toClass] = await Promise.all([Class.findById(fromClassId), Class.findById(toClassId)]);
    if (!fromClass || !toClass) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    const targetCount = await Student.countDocuments({ classId: toClassId, isActive: true });
    const already = await Student.countDocuments({ classId: toClassId });

    const students = await Student.find({ classId: fromClassId, isActive: true }).select('fullName studentId').sort({ fullName: 1 });
    const rows = [];
    for (const s of students) {
      const average = await averageFor(s._id, term, year);
      const eligible = average === null || (
        (minAverage === undefined || minAverage === null || minAverage === '' || average >= Number(minAverage)) &&
        (maxAverage === undefined || maxAverage === null || maxAverage === '' || average <= Number(maxAverage))
      );
      rows.push({
        studentId: s._id,
        name: s.fullName,
        studentCode: s.studentId,
        average,
        outcome: eligible ? 'promoted' : 'retained'
      });
    }

    res.json({
      success: true,
      from: classLabel(fromClass),
      to: classLabel(toClass),
      targetSize: already,
      capacityDelta: targetCount - students.length,
      promote: rows.filter(r => r.outcome === 'promoted').length,
      retain: rows.filter(r => r.outcome === 'retained').length,
      rows
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/enrollment-changes/promote', authMiddleware, manage, async (req, res) => {
  try {
    const { fromClassId, toClassId, term, year, minAverage, maxAverage, reason } = req.body;
    if (!fromClassId || !toClassId) {
      return res.status(400).json({ success: false, message: 'fromClassId and toClassId are required' });
    }
    if (String(fromClassId) === String(toClassId)) {
      return res.status(400).json({ success: false, message: 'Source and target class must differ' });
    }

    const [fromClass, toClass] = await Promise.all([Class.findById(fromClassId), Class.findById(toClassId)]);
    if (!fromClass || !toClass) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    const students = await Student.find({ classId: fromClassId, isActive: true });
    const moved = [];
    const retained = [];

    for (const s of students) {
      const average = await averageFor(s._id, term, year);
      const eligible = average === null || (
        (minAverage === undefined || minAverage === null || minAverage === '' || average >= Number(minAverage)) &&
        (maxAverage === undefined || maxAverage === null || maxAverage === '' || average <= Number(maxAverage))
      );

      if (!eligible) {
        retained.push({ id: s._id, name: s.fullName, average });
        await EnrollmentChange.create({
          studentId: s._id,
          studentName: s.fullName,
          fromClassId: fromClass._id,
          fromClassName: classLabel(fromClass),
          toClassId: fromClass._id,
          toClassName: classLabel(fromClass),
          outcome: 'retained',
          term,
          year: year ? Number(year) : undefined,
          averageScore: average,
          reason: reason || 'Below promotion threshold',
          performedBy: req.userId,
          performedByName: req.userName
        });
        continue;
      }

      await moveStudent(s, fromClass, toClass);
      moved.push({ id: s._id, name: s.fullName, average });
      await EnrollmentChange.create({
        studentId: s._id,
        studentName: s.fullName,
        fromClassId: fromClass._id,
        fromClassName: classLabel(fromClass),
        toClassId: toClass._id,
        toClassName: classLabel(toClass),
        outcome: 'promoted',
        term,
        year: year ? Number(year) : undefined,
        averageScore: average,
        reason: reason || 'Promoted to next class',
        performedBy: req.userId,
        performedByName: req.userName
      });
    }

    res.json({
      success: true,
      promoted: moved.length,
      retained: retained.length,
      from: classLabel(fromClass),
      to: classLabel(toClass)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Transfer a single student in or out, keeping a record.
router.post('/enrollment-changes/transfer', authMiddleware, manage, async (req, res) => {
  try {
    const { studentId, toClassId, direction, reason } = req.body;
    if (!studentId) return res.status(400).json({ success: false, message: 'studentId is required' });

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const fromClass = student.classId ? await Class.findById(student.classId) : null;
    const toClass = toClassId ? await Class.findById(toClassId) : null;
    if (toClassId && !toClass) return res.status(404).json({ success: false, message: 'Target class not found' });

    const isOut = direction === 'out' || !toClass;

    if (isOut) {
      student.isActive = false;
      if (fromClass) await Class.findByIdAndUpdate(fromClass._id, { $pull: { students: student._id } });
      student.classId = null;
      await student.save();
    } else {
      await moveStudent(student, fromClass, toClass);
    }

    const change = await EnrollmentChange.create({
      studentId: student._id,
      studentName: student.fullName,
      fromClassId: fromClass?._id,
      fromClassName: classLabel(fromClass),
      toClassId: toClass?._id,
      toClassName: classLabel(toClass),
      outcome: isOut ? 'transferred_out' : 'transferred_in',
      reason: reason || '',
      performedBy: req.userId,
      performedByName: req.userName
    });

    res.json({ success: true, change });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Mark a whole class as graduated at the end of the year.
router.post('/enrollment-changes/graduate', authMiddleware, manage, async (req, res) => {
  try {
    const { classId, term, year, reason } = req.body;
    if (!classId) return res.status(400).json({ success: false, message: 'classId is required' });

    const classItem = await Class.findById(classId);
    if (!classItem) return res.status(404).json({ success: false, message: 'Class not found' });

    const students = await Student.find({ classId, isActive: true });
    for (const s of students) {
      s.isActive = false;
      s.classId = null;
      await s.save();
      await EnrollmentChange.create({
        studentId: s._id,
        studentName: s.fullName,
        fromClassId: classItem._id,
        fromClassName: classLabel(classItem),
        toClassId: classItem._id,
        toClassName: classLabel(classItem),
        outcome: 'graduated',
        term,
        year: year ? Number(year) : undefined,
        reason: reason || 'Completed final year',
        performedBy: req.userId,
        performedByName: req.userName
      });
    }
    await Class.findByIdAndUpdate(classItem._id, { $set: { students: [] } });

    res.json({ success: true, graduated: students.length, class: classLabel(classItem) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
