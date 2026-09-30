const express = require('express');

const Announcement = require('../models/Announcement');
const Student = require('../models/Student');
const Class = require('../models/Class');
const SubjectAllocation = require('../models/SubjectAllocation');
const ParentProfile = require('../models/ParentProfile');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');
const { isStaffRole, visibleToAudience } = require('../utils/announcementAudience');
const { teacherOwnsClass } = require('../utils/access');

const router = express.Router();

// Requires a session. This used to be public, which meant a discipline notice
// addressed to parents was handed to any anonymous visitor. Only the four staff
// portals call it, and they need the full set for oversight; every other signed
// in account sees whole-school notices plus the ones addressed to its own role.
router.get('/announcements', authMiddleware, async (req, res) => {
  try {
    const announcements = await Announcement.find({ isActive: true }).sort({ createdAt: -1 });
    const staff = isStaffRole(req.userRole);

    // A pupil can also be reached through this endpoint, and an announcement
    // addressed to a year group ("S3") is meaningless without knowing which
    // year they are in. The class id matters for the same reason: a teacher's
    // notice to one form must not reach another form in the same year.
    let gradeLabel = '';
    const caller = { role: req.userRole, gradeLabel, classIds: [] };
    if (!staff && req.userRole === 'student') {
      const pupil = await Student.findOne({ userId: req.userId }).populate('classId', 'grade');
      caller.gradeLabel = (pupil && pupil.classId && pupil.classId.grade) || '';
      if (pupil && pupil.classId) caller.classIds = [pupil.classId._id];
    } else if (!staff && req.userRole === 'parent') {
      // Parents are linked through ParentProfile, not Student.userId, and may
      // have children in more than one form. Both matter: using the wrong link
      // finds nothing at all, and taking only the first child would hide the
      // other form's notices from a parent who is entitled to them.
      const profile = await ParentProfile.findOne({ userId: req.userId }).select('children');
      const children = (profile && profile.children) || [];
      if (children.length) {
        const classes = await Student.find({ _id: { $in: children } }).distinct('classId');
        caller.classIds = classes.filter(Boolean);
      }
    } else if (!staff && req.userRole === 'teacher') {
      // A teacher sees the notices for the forms they are responsible for, plus
      // the whole-school ones. Without this they would lose sight of their own
      // class notices as soon as class scoping was introduced.
      const [homeroom, allocations] = await Promise.all([
        Class.find({ teacherId: req.userId }).distinct('_id'),
        SubjectAllocation.find({ teacherId: req.userId }).distinct('classId')
      ]);
      caller.classIds = [...new Set([...homeroom, ...allocations].map(String))];
    }

    const visible = staff
      ? announcements
      : announcements.filter((a) => visibleToAudience(a, caller));

const formatted = visible.map(ann => ({
      ...ann.toObject(),
      audience: Array.isArray(ann.audience) ? ann.audience[0] : (ann.audience || 'all'),
      // The admin screens read `audience` as a single word, so it stays that
      // way here. Anything that needs the real list, such as the audit trail on
      // a class notice, reads this instead.
      audienceList: Array.isArray(ann.audience) ? ann.audience : (ann.audience ? [ann.audience] : ['all'])
    }));
    res.json(formatted);
  } catch (error) {
    console.error('GET /api/announcements error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/announcements', authMiddleware, async (req, res) => {
  try {
    const allowedRoles = ['super_admin', 'academic_admin', 'discipline_admin', 'accounts_admin'];
    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ message: 'Access denied. You do not have permission to post announcements.' });
    }

    let audience = req.body.audience;
    if (typeof audience === 'string') {
      audience = audience === 'all' ? ['all'] : [audience];
    }
    if (!audience || (Array.isArray(audience) && audience.length === 0)) {
      audience = ['all'];
    }

    const announcement = await Announcement.create({
      title: req.body.title,
      content: req.body.content,
      audience: audience,
      priority: req.body.priority || 'normal',
      createdBy: req.userId,
      isActive: true
    });

    res.json({
      success: true,
      announcement: {
        ...announcement.toObject(),
        audience: announcement.audience[0]
      }
    });
  } catch (error) {
    console.error('POST /api/announcements error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/super-admin/announcements', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 });
    const formatted = announcements.map(ann => ({
      ...ann.toObject(),
      audience: Array.isArray(ann.audience) ? ann.audience[0] : (ann.audience || 'all')
    }));
    res.json(formatted);
  } catch (error) {
    console.error('GET /api/super-admin/announcements error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/super-admin/announcements', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    let audience = req.body.audience;
    if (typeof audience === 'string') {
      audience = audience === 'all' ? ['all'] : [audience];
    }
    if (!audience || (Array.isArray(audience) && audience.length === 0)) {
      audience = ['all'];
    }

    const announcement = await Announcement.create({
      title: req.body.title,
      content: req.body.content,
      audience: audience,
      priority: req.body.priority || 'normal',
      createdBy: req.userId,
      isActive: true
    });

    res.json({
      success: true,
      announcement: {
        ...announcement.toObject(),
        audience: announcement.audience[0]
      }
    });
  } catch (error) {
    console.error('POST /api/super-admin/announcements error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/super-admin/announcements/:id', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({
      success: true,
      announcement: {
        ...announcement.toObject(),
        audience: Array.isArray(announcement.audience) ? announcement.audience[0] : (announcement.audience || 'all')
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/super-admin/announcements/:id', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// A teacher's class notice. Restricted to the forms the teacher is actually
// responsible for, because the obvious implementation - accept classIds from the
// body - would let any teacher post a notice to any form in the school, and the
// audience rules would then dutifully deliver it.
router.post('/teacher/announcements', authMiddleware, requireRole('teacher'), async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const content = String(req.body.content || '').trim();
    if (!title) return res.status(400).json({ message: 'A title is required' });
    if (!content) return res.status(400).json({ message: 'A message is required' });

    const requested = (Array.isArray(req.body.classIds) ? req.body.classIds : [req.body.classId])
      .filter(Boolean);
    if (!requested.length) {
      return res.status(400).json({ message: 'Choose at least one class for this notice' });
    }

    const permitted = [];
    for (const classId of requested) {
      if (await teacherOwnsClass(req.userId, classId)) permitted.push(classId);
    }
    if (!permitted.length) {
      return res.status(403).json({ message: 'You are not responsible for any of those classes' });
    }

    const announcement = await Announcement.create({
      title,
      content,
      // A class notice is always addressed to that class's pupils and their
      // parents. The teacher chooses who else to copy, within a fixed set, so a
      // crafted audience value cannot widen the notice to the whole school.
      audience: normalizeTeacherAudience(req.body.audience),
      classIds: permitted,
      priority: ['low', 'normal', 'high'].includes(req.body.priority) ? req.body.priority : 'normal',
      createdBy: req.userId,
      isActive: true
    });

    res.status(201).json({
      success: true,
      announcement: { ...announcement.toObject(), audience: announcement.audience[0], audienceList: announcement.audience },
      // Tell the caller plainly when part of the request was dropped, rather than
      // quietly posting to fewer classes than they asked for.
      skippedClasses: requested.length - permitted.length
    });
  } catch (error) {
    console.error('POST /api/teacher/announcements error:', error);
    res.status(500).json({ message: error.message });
  }
});

// The roles a teacher may add to a class notice. 'all' and 'everyone' are
// absent on purpose and are filtered even if supplied: a class-scoped notice
// turned into a whole-school one would defeat the point of scoping it.
const TEACHER_AUDIENCE = ['students', 'parents', 'teachers', 'staff'];
const normalizeTeacherAudience = (raw) => {
  const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const wanted = list
    .map((a) => String(a).trim().toLowerCase())
    .filter((a) => a && !['all', 'everyone'].includes(a) && TEACHER_AUDIENCE.includes(a));
  // A class notice always goes to that class's pupils and to their parents.
  // Those two are added rather than merely defaulted: a body that names only
  // 'students' used to quietly exclude every parent of that class, which is
  // not a choice the composer was offered and not one the notice implies.
  // Anything else on top is an extra copy the teacher asked for by name.
  return Array.from(new Set(['students', 'parents', ...wanted]));
};

module.exports = router;