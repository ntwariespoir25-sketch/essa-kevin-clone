const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/auth');
const Notification = require('../models/Notification');
const NotificationPreference = require('../models/NotificationPreference');
const { notify, flushDeferred } = require('../utils/notifier');

const router = express.Router();

const fail = (res, status, message) => res.status(status).json({ success: false, message });

// ─── inbox ───────────────────────────────────────────────────────────────────

router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const filter = { userId: req.userId };
    if (req.query.unread === 'true') filter.read = false;
    if (req.query.type) filter.type = String(req.query.type);
    if (req.query.before && mongoose.isValidObjectId(req.query.before)) {
      const anchor = await Notification.findById(req.query.before).select('createdAt').lean();
      if (anchor) filter.createdAt = { $lt: anchor.createdAt };
    }

    const limit = [10, 20, 30, 50].includes(Number(req.query.limit)) ? Number(req.query.limit) : 20;
    const [items, unread, byType] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(limit + 1).lean(),
      Notification.countDocuments({ userId: req.userId, read: false }),
      Notification.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(req.userId), read: false } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ])
    ]);

    const hasMore = items.length > limit;
    res.json({
      success: true,
      notifications: hasMore ? items.slice(0, limit) : items,
      hasMore,
      unread,
      unreadByType: Object.fromEntries(byType.map(r => [r._id, r.count]))
    });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.get('/notifications/unread-count', authMiddleware, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ userId: req.userId, read: false });
    res.json({ success: true, count });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.post('/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, 'Invalid notification.');
    const result = await Notification.updateOne(
      { _id: req.params.id, userId: req.userId },
      { $set: { read: true, readAt: new Date() } }
    );
    if (!result.matchedCount) return fail(res, 404, 'Notification not found.');
    res.json({ success: true });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.post('/notifications/read-all', authMiddleware, async (req, res) => {
  try {
    const filter = { userId: req.userId, read: false };
    // Optional narrowing so a person can clear "announcements" without also
    // clearing their message badges.
    if (req.body?.type) filter.type = String(req.body.type);
    const result = await Notification.updateMany(filter, { $set: { read: true, readAt: new Date() } });
    res.json({ success: true, updated: result.modifiedCount });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.delete('/notifications/:id', authMiddleware, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, 'Invalid notification.');
    const result = await Notification.deleteOne({ _id: req.params.id, userId: req.userId });
    if (!result.deletedCount) return fail(res, 404, 'Notification not found.');
    res.json({ success: true });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.delete('/notifications', authMiddleware, async (req, res) => {
  try {
    const filter = { userId: req.userId };
    if (req.body?.unreadOnly) filter.read = false;
    const result = await Notification.deleteMany(filter);
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── preferences ─────────────────────────────────────────────────────────────

const CHANNEL_KEYS = ['inApp', 'email', 'push', 'sms'];

const sanitizePreferences = (body, current) => {
  const updates = {};

  if (body.channels && typeof body.channels === 'object') {
    updates.channels = {};
    for (const key of CHANNEL_KEYS) {
      if (typeof body.channels[key] === 'boolean') {
        updates.channels[key] = body.channels[key];
      } else {
        updates.channels[key] = current.channels[key];
      }
    }
    // Turning in-app off would hide the inbox itself; keep it on so the portal
    // still functions as the system of record.
    updates.channels.inApp = true;
  }

  if (body.types && typeof body.types === 'object') {
    updates.types = {};
    for (const key of Object.keys(current.types)) {
      updates.types[key] = typeof body.types[key] === 'boolean' ? body.types[key] : current.types[key];
    }
    // Disabling the system type entirely would silence lockouts and password
    // notices, so it is not user-mutable.
    updates.types.system = true;
  }

  if (body.quietHours && typeof body.quietHours === 'object') {
    const start = Number(body.quietHours.start);
    const end = Number(body.quietHours.end);
    if (!Number.isInteger(start) || start < 0 || start > 1439) return { error: 'Quiet hours start must be between 0 and 1439 minutes.' };
    if (!Number.isInteger(end) || end < 0 || end > 1439) return { error: 'Quiet hours end must be between 0 and 1439 minutes.' };
    updates.quietHours = {
      enabled: !!body.quietHours.enabled,
      start,
      end
    };
  }

  if (body.mutedConversations !== undefined) {
    const raw = Array.isArray(body.mutedConversations) ? body.mutedConversations : [];
    updates.mutedConversations = raw
      .filter(id => mongoose.isValidObjectId(id))
      .slice(0, 200);
  }

  if (typeof body.pushEnabled === 'boolean') updates.pushEnabled = body.pushEnabled;
  if (typeof body.smsEnabled === 'boolean') updates.smsEnabled = body.smsEnabled;

  return { updates };
};

router.get('/notifications/preferences', authMiddleware, async (req, res) => {
  try {
    const prefs = await NotificationPreference.getFor(req.userId);
    res.json({
      success: true,
      preferences: prefs,
      // Lets the UI explain why a switch does nothing yet instead of silently
      // failing when a user turns push on.
      providers: {
        email: !!process.env.EMAIL_USER,
        push: false,
        sms: false
      }
    });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.put('/notifications/preferences', authMiddleware, async (req, res) => {
  try {
    const current = await NotificationPreference.getFor(req.userId);
    const { updates, error } = sanitizePreferences(req.body || {}, current);
    if (error) return fail(res, 400, error);

    const prefs = await NotificationPreference.findOneAndUpdate(
      { userId: req.userId },
      { $set: { ...updates, updatedAt: new Date() } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, preferences: prefs });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── testing the pipeline ────────────────────────────────────────────────────

// Sends the caller a notification through their own settings so a broken
// address or a misconfigured provider is discoverable from the UI instead of
// from an end user's silence.
router.post('/notifications/test', authMiddleware, async (req, res) => {
  try {
    const result = await notify({
      userId: req.userId,
      type: 'system',
      title: 'Test notification',
      body: 'If you can read this, your notification pipeline is working.',
      link: '/notifications'
    });

    res.json({
      success: true,
      ...result,
      message: result.skipped
        ? 'Skipped: check your notification preferences.'
        : result.deferred
          ? 'Queued - quiet hours are active, external channels will send when they end.'
          : 'Delivered.'
    });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// Manual trigger for the deferred queue, useful in development where the
// interval loop may not have fired yet.
router.post('/notifications/flush', authMiddleware, async (req, res) => {
  try {
    const flushed = await flushDeferred();
    res.json({ success: true, flushed });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

module.exports = router;
