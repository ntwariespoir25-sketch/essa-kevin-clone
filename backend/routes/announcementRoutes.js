const express = require('express');

const Announcement = require('../models/Announcement');
const Student = require('../models/Student');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');
const { isStaffRole, visibleToAudience } = require('../utils/announcementAudience');

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
    // year they are in.
    let gradeLabel = '';
    if (!staff && req.userRole === 'student') {
      const pupil = await Student.findOne({ userId: req.userId }).populate('classId', 'grade');
      gradeLabel = (pupil && pupil.classId && pupil.classId.grade) || '';
    }

    const visible = staff
      ? announcements
      : announcements.filter((a) => visibleToAudience(a, { role: req.userRole, gradeLabel }));

    const formatted = visible.map(ann => ({
      ...ann.toObject(),
      audience: Array.isArray(ann.audience) ? ann.audience[0] : (ann.audience || 'all')
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

module.exports = router;