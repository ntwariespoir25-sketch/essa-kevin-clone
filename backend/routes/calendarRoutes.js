const express = require('express');

const Event = require('../models/Event');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');

const router = express.Router();

const normalizeAudience = (raw) => {
  let audience = raw;
  if (typeof audience === 'string') {
    audience = audience === 'all' ? ['all'] : [audience];
  }
  if (!Array.isArray(audience) || audience.length === 0) return ['all'];
  return audience;
};

const canManage = requireRole('academic_admin', 'super_admin');

router.get('/events', authMiddleware, async (req, res) => {
  try {
    const { from, to, category } = req.query;
    const query = { isActive: true };
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }
    if (category && category !== 'all') query.category = category;

    const events = await Event.find(query).sort({ date: 1 });
    res.json({ success: true, events });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/events/:id', authMiddleware, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/events', authMiddleware, canManage, async (req, res) => {
  try {
    if (!req.body.title || !req.body.date) {
      return res.status(400).json({ success: false, message: 'title and date are required' });
    }
    const event = await Event.create({
      title: req.body.title,
      description: req.body.description || '',
      category: req.body.category || 'academic',
      date: new Date(req.body.date),
      endDate: req.body.endDate ? new Date(req.body.endDate) : null,
      time: req.body.time || '',
      location: req.body.location || '',
      audience: normalizeAudience(req.body.audience),
      permissionRequired: Boolean(req.body.permissionRequired),
      createdBy: req.userId
    });
    res.status(201).json({ success: true, event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/events/:id', authMiddleware, canManage, async (req, res) => {
  try {
    const update = { ...req.body, updatedAt: new Date() };
    if (req.body.date) update.date = new Date(req.body.date);
    if (req.body.endDate) update.endDate = new Date(req.body.endDate);
    if (req.body.audience !== undefined) update.audience = normalizeAudience(req.body.audience);

    const event = await Event.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/events/:id', authMiddleware, canManage, async (req, res) => {
  try {
    const event = await Event.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, event });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
