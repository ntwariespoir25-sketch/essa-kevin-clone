const express = require('express');
const User = require('../models/User');
const LoginAttempt = require('../models/LoginAttempt');
const authMiddleware = require('../middleware/auth');
const { clearLock, MAX_FAILED_ATTEMPTS, LOCK_MINUTES } = require('../utils/loginSecurity');

const router = express.Router();

// Security overview for the super admin: who has been locked out, and a
// paginated audit trail of sign-in attempts.
//
// Restricted to super_admin. Every other role is excluded deliberately - this
// trail exposes IP addresses and the timing of failed logins, which is exactly
// the information an attacker would want to calibrate a spray against, and it
// is also staff disciplinary material.
const requireSuperAdmin = (req, res, next) => {
  if (req.userRole !== 'super_admin') {
    return res.status(403).json({ message: 'Super admin access required' });
  }
  next();
};

// Paged recent attempts. Defaults to the last 24 hours, because "show me
// everything ever" is never the useful first question during an incident.
router.get('/security/login-attempts', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const hours = Math.min(Math.max(parseInt(req.query.hours, 10) || 24, 1), 24 * 90);

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const filter = { createdAt: { $gte: since } };

    if (req.query.outcome && req.query.outcome !== 'all') {
      filter.outcome = req.query.outcome;
    }
    if (req.query.userId) {
      filter.userId = req.query.userId;
    }

    const [attempts, total] = await Promise.all([
      LoginAttempt.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'fullName email role')
        .lean(),
      LoginAttempt.countDocuments(filter)
    ]);

    res.json({
      success: true,
      attempts: attempts.map((a) => ({
        id: a._id,
        at: a.createdAt,
        success: a.success,
        outcome: a.outcome,
        method: a.method,
        ip: a.ip,
        identifier: a.userId ? a.userId.email : a.identifier,
        user: a.userId ? { id: a.userId._id, name: a.userId.fullName, role: a.userId.role } : null,
        userAgent: a.userAgent
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      windowHours: hours
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Accounts that are currently locked, plus the counters that explain why.
router.get('/security/locked-accounts', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const now = new Date();
    const [locked, recentFailures] = await Promise.all([
      User.find({ lockedUntil: { $gt: now } })
        .select('fullName email role lockedUntil lockReason lastFailedLoginAt')
        .sort({ lockedUntil: 1 })
        .lean(),
      LoginAttempt.aggregate([
        { $match: { success: false, createdAt: { $gte: new Date(now - 24 * 3600 * 1000) } } },
        { $group: { _id: '$ip', failures: { $sum: 1 }, lastAt: { $max: '$createdAt' } } },
        { $sort: { failures: -1 } },
        { $limit: 10 }
      ])
    ]);

    res.json({
      success: true,
      policy: { maxAttempts: MAX_FAILED_ATTEMPTS, lockMinutes: LOCK_MINUTES },
      locked: locked.map((u) => ({
        id: u._id,
        name: u.fullName,
        email: u.email,
        role: u.role,
        lockedUntil: u.lockedUntil,
        reason: u.lockReason,
        lastFailedLoginAt: u.lastFailedLoginAt
      })),
      // Addresses with the most failures in 24h, including ones that never hit
      // a real account - that is what a credential spray looks like.
      topFailingIps: recentFailures.map((f) => ({ ip: f._id, failures: f.failures, lastAt: f.lastAt }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Manual unlock. Support needs this when a genuine user trips the lockout, and
// removing the lock by editing the database directly would leave the counters
// in a state the code does not expect.
router.post('/security/unlock/:userId', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    await clearLock(user);
    res.json({ success: true, message: `${user.fullName} has been unlocked` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
