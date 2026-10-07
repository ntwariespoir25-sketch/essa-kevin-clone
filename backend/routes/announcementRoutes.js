const express = require('express');

const Announcement = require('../models/Announcement');
const Class = require('../models/Class');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');
const { isStaffRole, visibleToAudience } = require('../utils/announcementAudience');
const { buildCallerContexts, resolveAnnouncementRecipients } = require('../utils/announcementRecipients');
const { teacherOwnsClass } = require('../utils/access');
const { notifyMany } = require('../utils/notifier');

const router = express.Router();

// Reads the targeting fields off a request body and checks them against the
// database. Anything unrecognised or dangling is reported rather than dropped,
// because an announcement that silently reaches fewer people than it says it
// does is worse than one that fails to post.
const sanitizeTargeting = async (body) => {
  const classIds = (Array.isArray(body.classIds) ? body.classIds : [body.classId]).filter(Boolean);
  const grades = (Array.isArray(body.grades) ? body.grades : [body.grades]).filter(Boolean);
  const userIds = (Array.isArray(body.userIds) ? body.userIds : [body.userIds]).filter(Boolean);

  if (classIds.length > 50) return { error: 'A notice can be scoped to at most 50 classes.' };
  if (grades.length > 30) return { error: 'A notice can be scoped to at most 30 year groups.' };
  if (userIds.length > 500) return { error: 'A notice can name at most 500 people.' };

  const cleanClasses = [];
  for (const id of classIds) {
    if (!/^[0-9a-fA-F]{24}$/.test(String(id))) return { error: 'One of the classes is not a valid id.' };
    if (!await Class.exists({ _id: id })) return { error: 'One of the classes no longer exists.' };
    cleanClasses.push(id);
  }

  const cleanGrades = [...new Set(
    grades
      .map(g => String(g).trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .map(g => g.substring(0, 60))
  )];

  const cleanUsers = [];
  if (userIds.length) {
    for (const id of userIds) {
      if (!/^[0-9a-fA-F]{24}$/.test(String(id))) return { error: 'One of the recipients is not a valid id.' };
    }
    const found = await User.find({ _id: { $in: userIds }, isActive: true }).distinct('_id');
    if (found.length !== userIds.length) {
      return { error: `${userIds.length - found.length} of the named recipients could not be found.` };
    }
    cleanUsers.push(...found.map(String));
  }

  return { classIds: cleanClasses, grades: cleanGrades, userIds: cleanUsers };
};

// Fan-out. Fire-and-forget from the caller's point of view: the announcement
// is already stored, and a slow mailbox must not hold up the post. Recipient
// resolution is the same predicate that decides portal visibility, minus staff
// oversight, so nobody is notified about something they cannot see and nobody
// who was addressed misses it.
const broadcastAnnouncement = (announcement) => {
  resolveAnnouncementRecipients(announcement)
    .then(async (recipients) => {
      if (!recipients.length) return;
      const author = await User.findById(announcement.createdBy).select('fullName').lean();
      await notifyMany(recipients, {
        type: 'announcement',
        title: announcement.title,
        body: String(announcement.content || '').replace(/\s+/g, ' ').substring(0, 200),
        link: '/announcements',
        announcementId: announcement._id,
        actorId: announcement.createdBy,
        actorName: (author && author.fullName) || 'Administration'
      });
    })
    .catch(err => console.error('Announcement notification failed:', err.message));
};


// Requires a session. This used to be public, which meant a discipline notice
// addressed to parents was handed to any anonymous visitor. Only the four staff
// portals call it, and they need the full set for oversight; every other signed
// in account sees whole-school notices plus the ones addressed to its own role.
router.get('/announcements', authMiddleware, async (req, res) => {
  try {
    const announcements = await Announcement.find({ isActive: true }).sort({ createdAt: -1 });
    const staff = isStaffRole(req.userRole);

    // Built from the shared context builder rather than a per-role branch: the
    // same structure feeds notification fan-out, so a pupil, a parent with
    // children in two forms, and a teacher who only takes a subject in one
    // class are described identically in the portal and in the inbox. The old
    // branch had no idea a notice could be addressed to a named person or
    // scoped to a year group.
    const { contexts } = await buildCallerContexts();
    const caller = contexts.get(String(req.userId)) || { userId: String(req.userId), role: req.userRole };

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

const normalizeAudienceList = (raw) => {
  let audience = raw;
  if (typeof audience === 'string') audience = audience === 'all' ? ['all'] : [audience];
  if (!audience || (Array.isArray(audience) && audience.length === 0)) audience = ['all'];
  return audience;
};

// Shared by the two staff posting routes, which had drifted apart: one was the
// general endpoint every staff portal calls and the other was the super
// admin's, and only the first one would have known about class or year scoping.
const createStaffAnnouncement = async (req, res) => {
  const audience = normalizeAudienceList(req.body.audience);
  const targeting = await sanitizeTargeting(req.body);
  if (targeting.error) return res.status(400).json({ message: targeting.error });

  const announcement = await Announcement.create({
    title: req.body.title,
    content: req.body.content,
    audience,
    classIds: targeting.classIds,
    grades: targeting.grades,
    userIds: targeting.userIds,
    priority: req.body.priority || 'normal',
    createdBy: req.userId,
    isActive: true
  });

  broadcastAnnouncement(announcement);

  res.json({
    success: true,
    announcement: {
      ...announcement.toObject(),
      audience: announcement.audience[0]
    }
  });
};

router.post('/announcements', authMiddleware, async (req, res) => {
  try {
    const allowedRoles = ['super_admin', 'academic_admin', 'discipline_admin', 'accounts_admin'];
    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ message: 'Access denied. You do not have permission to post announcements.' });
    }
    await createStaffAnnouncement(req, res);
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
    await createStaffAnnouncement(req, res);
  } catch (error) {
    console.error('POST /api/super-admin/announcements error:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/super-admin/announcements/:id', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    const existing = await Announcement.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Announcement not found' });

    // Built as a whitelist: passing req.body straight through let a single
    // edit turn a class notice into a whole-school one by overwriting the
    // scoping fields, or stamp a createdBy that is not the author.
    const updates = {};
    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.content !== undefined) updates.content = req.body.content;
    if (req.body.priority !== undefined) updates.priority = req.body.priority;
    if (req.body.isActive !== undefined) updates.isActive = !!req.body.isActive;
    if (req.body.audience !== undefined) updates.audience = normalizeAudienceList(req.body.audience);

    if (req.body.classIds !== undefined || req.body.grades !== undefined || req.body.userIds !== undefined) {
      const targeting = await sanitizeTargeting({
        classIds: req.body.classIds || [],
        grades: req.body.grades || [],
        userIds: req.body.userIds || []
      });
      if (targeting.error) return res.status(400).json({ message: targeting.error });
      updates.classIds = targeting.classIds;
      updates.grades = targeting.grades;
      updates.userIds = targeting.userIds;
    }

    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

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

    broadcastAnnouncement(announcement);

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