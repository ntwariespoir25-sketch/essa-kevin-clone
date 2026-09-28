const express = require('express');

const Timetable = require('../models/Timetable');
const Student = require('../models/Student');
const Class = require('../models/Class');
const TeacherProfile = require('../models/TeacherProfile');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');

const router = express.Router();

const manage = requireRole('academic_admin', 'super_admin');

const DAYS = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };

// A teacher cannot be in two rooms at once, and a class cannot have two
// subjects in the same period. Both are checked before writing.
const findConflicts = async ({ classId, dayOfWeek, period, teacherId, excludeId }) => {
  const conflicts = [];

  const classClash = await Timetable.findOne({
    _id: excludeId ? { $ne: excludeId } : undefined,
    classId,
    dayOfWeek,
    period
  });
  if (classClash) {
    conflicts.push({ type: 'class_period', message: `${DAYS[dayOfWeek]} period ${period} already has "${classClash.subject || 'an entry'}"` });
  }

  if (teacherId) {
    const teacherClash = await Timetable.findOne({
      _id: excludeId ? { $ne: excludeId } : undefined,
      teacherId,
      dayOfWeek,
      period
    });
    if (teacherClash) {
      const otherClass = await Class.findById(teacherClash.classId).select('grade className');
      const label = otherClass ? `${otherClass.grade || ''} ${otherClass.className || ''}`.trim() : 'another class';
      const teacher = await TeacherProfile.findOne({ userId: teacherId }).select('fullName');
      conflicts.push({
        type: 'teacher_clash',
        message: `${teacher?.fullName || 'This teacher'} is already teaching ${label} on ${DAYS[dayOfWeek]} period ${period}`
      });
    }
  }

  return conflicts;
};

router.get('/timetable', authMiddleware, async (req, res) => {
  try {
    const { classId, teacherId, academicYear } = req.query;

    // A teacher sees their own schedule; admins may filter by class or teacher.
    let effectiveClassId = classId;
    if (req.userRole === 'teacher') effectiveClassId = undefined;
    if (req.userRole === 'student' && !classId) {
      const student = await Student.findOne({ userId: req.userId }).select('classId');
      if (!student?.classId) return res.json({ success: true, timetable: [] });
      effectiveClassId = String(student.classId);
    }

    const query = {};
    if (effectiveClassId) query.classId = effectiveClassId;
    if (req.userRole === 'teacher') query.teacherId = req.userId;
    else if (teacherId) query.teacherId = teacherId;

    let entries = await Timetable.find(query).populate('classId', 'grade className').sort({ dayOfWeek: 1, period: 1 });

    if (academicYear) {
      const classes = await Class.find({ academicYear }).select('_id');
      const allowed = new Set(classes.map(c => String(c._id)));
      entries = entries.filter(e => allowed.has(String(e.classId?._id || e.classId)));
    }

    const teacherIds = [...new Set(entries.map(e => e.teacherId).filter(Boolean).map(String))];
    const profiles = teacherIds.length
      ? await TeacherProfile.find({ userId: { $in: teacherIds } }).select('userId fullName')
      : [];
    const byUser = new Map(profiles.map(p => [String(p.userId), p]));

    const shaped = entries.map(e => {
      const obj = e.toObject();
      obj.dayName = DAYS[e.dayOfWeek] || `Day ${e.dayOfWeek}`;
      obj.className = e.classId
        ? `${e.classId.grade || ''} ${e.classId.className || ''}`.trim()
        : null;
      obj.teacherName = e.teacherId ? byUser.get(String(e.teacherId))?.fullName || null : null;
      return obj;
    });

    res.json({ success: true, timetable: shaped, days: DAYS });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/timetable', authMiddleware, manage, async (req, res) => {
  try {
    const { classId, dayOfWeek, period, subject, teacherId, startTime, endTime, room } = req.body;

    if (!classId || !dayOfWeek || !period) {
      return res.status(400).json({ success: false, message: 'classId, dayOfWeek and period are required' });
    }
    if (teacherId && !(await User.findById(teacherId))) {
      return res.status(400).json({ success: false, message: 'Unknown teacher' });
    }

    const conflicts = await findConflicts({
      classId,
      dayOfWeek: Number(dayOfWeek),
      period: Number(period),
      teacherId: teacherId || null
    });
    if (conflicts.length) {
      return res.status(409).json({ success: false, message: conflicts[0].message, conflicts });
    }

    const entry = await Timetable.create({
      classId,
      dayOfWeek: Number(dayOfWeek),
      period: Number(period),
      subject: subject || '',
      teacherId: teacherId || null,
      startTime: startTime || '',
      endTime: endTime || '',
      room: room || '',
      createdBy: req.userId
    });

    const [shaped] = await Timetable.findById(entry._id).populate('classId', 'grade className');
    const obj = shaped.toObject();
    obj.dayName = DAYS[shaped.dayOfWeek];
    obj.className = shaped.classId ? `${shaped.classId.grade || ''} ${shaped.classId.className || ''}`.trim() : null;

    res.status(201).json({ success: true, entry: obj });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/timetable/:id', authMiddleware, manage, async (req, res) => {
  try {
    const existing = await Timetable.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Period not found' });

    const next = {
      classId: req.body.classId ?? existing.classId,
      dayOfWeek: req.body.dayOfWeek !== undefined ? Number(req.body.dayOfWeek) : existing.dayOfWeek,
      period: req.body.period !== undefined ? Number(req.body.period) : existing.period,
      teacherId: req.body.teacherId !== undefined ? (req.body.teacherId || null) : existing.teacherId
    };

    const conflicts = await findConflicts({ ...next, excludeId: existing._id });
    if (conflicts.length) {
      return res.status(409).json({ success: false, message: conflicts[0].message, conflicts });
    }

    const update = { updatedAt: new Date() };
    ['subject', 'startTime', 'endTime', 'room'].forEach(k => {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    });
    Object.assign(update, next);

    const entry = await Timetable.findByIdAndUpdate(existing._id, update, { new: true })
      .populate('classId', 'grade className');

    const obj = entry.toObject();
    obj.dayName = DAYS[entry.dayOfWeek];
    obj.className = entry.classId ? `${entry.classId.grade || ''} ${entry.classId.className || ''}`.trim() : null;

    res.json({ success: true, entry: obj });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/timetable/:id', authMiddleware, manage, async (req, res) => {
  try {
    const entry = await Timetable.findByIdAndDelete(req.params.id);
    if (!entry) return res.status(404).json({ success: false, message: 'Period not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/timetable', authMiddleware, manage, async (req, res) => {
  try {
    if (!req.query.classId) {
      return res.status(400).json({ success: false, message: 'classId is required' });
    }
    const result = await Timetable.deleteMany({ classId: req.query.classId });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
