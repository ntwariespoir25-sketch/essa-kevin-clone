const express = require('express');

const SubjectAllocation = require('../models/SubjectAllocation');
const Class = require('../models/Class');
const TeacherProfile = require('../models/TeacherProfile');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');
const { isStaff, allowedClassIds } = require('../utils/access');

const router = express.Router();

const manage = requireRole('academic_admin', 'super_admin');

const withTeacher = async (allocations) => {
  const teacherIds = [...new Set(allocations.map(a => a.teacherId).filter(Boolean).map(String))];
  const profiles = await TeacherProfile.find({ userId: { $in: teacherIds } }).select('userId fullName subject');
  const byUser = new Map(profiles.map(p => [String(p.userId), p]));

  const classIds = [...new Set(allocations.map(a => a.classId).filter(Boolean).map(String))];
  const classes = await Class.find({ _id: { $in: classIds } }).select('className grade');
  const classById = new Map(classes.map(c => [String(c._id), c]));

  return allocations.map(a => {
    const obj = a.toObject();
    const t = a.teacherId ? byUser.get(String(a.teacherId)) : null;
    const c = a.classId ? classById.get(String(a.classId)) : null;
    obj.teacherName = t?.fullName || null;
    obj.teacherSubject = t?.subject || null;
    obj.className = c ? `${c.grade || ''} ${c.className || ''}`.trim() : null;
    return obj;
  });
};

router.get('/subject-allocations', authMiddleware, async (req, res) => {
  try {
    const query = {};
    if (req.query.classId) query.classId = req.query.classId;
    if (req.query.teacherId) query.teacherId = req.query.teacherId;
    if (req.query.academicYear) query.academicYear = req.query.academicYear;

    // Previously anyone signed in could list every allocation and see who
    // teaches what. Staff still see all; a teacher is limited to their own
    // allocations; a parent or pupil to the classes their household is in.
    if (req.userRole === 'teacher') {
      query.teacherId = req.userId;
    } else if (!isStaff(req.userRole)) {
      const ids = await allowedClassIds(req.userId, req.userRole);
      if (req.query.classId) {
        // Honour the requested class only if it is one they may see.
        const permitted = ids.some(id => String(id) === String(req.query.classId));
        query.classId = permitted ? req.query.classId : { $in: [] };
      } else {
        query.classId = { $in: ids };
      }
    }

    const allocations = await SubjectAllocation.find(query)
      .populate('classId', 'className grade')
      .sort({ academicYear: -1, createdAt: -1 });

    const classes = await Class.find().select('className grade');
    const classById = new Map(classes.map(c => [String(c._id), c]));
    const profiles = await TeacherProfile.find().select('userId fullName subject');
    const byUser = new Map(profiles.map(p => [String(p.userId), p]));

    const shaped = allocations.map(a => {
      const obj = a.toObject();
      const t = a.teacherId ? byUser.get(String(a.teacherId)) : null;
      const c = a.classId ? classById.get(String(a.classId)) : null;
      obj.teacherName = t?.fullName || null;
      obj.className = c ? `${c.grade || ''} ${c.className || ''}`.trim() : null;
      return obj;
    });

    res.json({ success: true, allocations: shaped });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/subject-allocations', authMiddleware, manage, async (req, res) => {
  try {
    const { classId, subject, teacherId, academicYear, periodsPerWeek } = req.body;
    if (!classId || !subject) {
      return res.status(400).json({ success: false, message: 'classId and subject are required' });
    }
    if (teacherId && !(await TeacherProfile.findOne({ userId: teacherId }))) {
      return res.status(400).json({ success: false, message: 'Unknown teacher' });
    }

    const allocation = await SubjectAllocation.findOneAndUpdate(
      { classId, subject: String(subject).trim() },
      {
        $set: {
          teacherId: teacherId || null,
          academicYear: academicYear || String(new Date().getFullYear()),
          periodsPerWeek: parseInt(periodsPerWeek) || 0,
          updatedAt: new Date()
        },
        $setOnInsert: { createdBy: req.userId, createdAt: new Date() }
      },
      { new: true, upsert: true }
    );

    const [shaped] = await withTeacher([allocation]);
    res.status(201).json({ success: true, allocation: shaped });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/subject-allocations/:id', authMiddleware, manage, async (req, res) => {
  try {
    const update = { updatedAt: new Date() };
    ['subject', 'academicYear'].forEach(k => {
      if (req.body[k] !== undefined) update[k] = req.body[k];
    });
    if (req.body.teacherId !== undefined) update.teacherId = req.body.teacherId || null;
    if (req.body.periodsPerWeek !== undefined) update.periodsPerWeek = parseInt(req.body.periodsPerWeek) || 0;
    if (req.body.classId !== undefined) update.classId = req.body.classId;

    const allocation = await SubjectAllocation.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!allocation) return res.status(404).json({ success: false, message: 'Allocation not found' });

    const [shaped] = await withTeacher([allocation]);
    res.json({ success: true, allocation: shaped });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/subject-allocations/:id', authMiddleware, manage, async (req, res) => {
  try {
    const allocation = await SubjectAllocation.findByIdAndDelete(req.params.id);
    if (!allocation) return res.status(404).json({ success: false, message: 'Allocation not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
