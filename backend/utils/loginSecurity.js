const bcrypt = require('bcryptjs');

const User = require('../models/User');
const LoginAttempt = require('../models/LoginAttempt');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// Attempts older than this stop counting. Without it, five failures spread
// across a term would lock a legitimate account on a Tuesday afternoon.
const ATTEMPT_WINDOW_MINUTES = 30;
const ATTEMPT_WINDOW_MS = ATTEMPT_WINDOW_MINUTES * 60 * 1000;

const requestFingerprint = (req) => ({
  ip: (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.ip || null,
  userAgent: (req.headers['user-agent'] || '').slice(0, 300) || null
});

const minutesFromNow = (m) => new Date(Date.now() + m * 60 * 1000);

const isLocked = (user) =>
  !!(user && user.lockedUntil && user.lockedUntil.getTime() > Date.now());

const lockRemainingMinutes = (user) =>
  user && user.lockedUntil
    ? Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000))
    : 0;

// Fire-and-forget: an audit write must never be the reason a real user cannot
// sign in, so failures are swallowed rather than propagated.
const recordAttempt = (req, { user, identifier, role, method, success, outcome }) => {
  const { ip, userAgent } = requestFingerprint(req);
  return LoginAttempt.create({
    userId: user && user._id,
    identifier: identifier ? String(identifier).slice(0, 200) : undefined,
    role: (role || (user && user.role)) || undefined,
    success,
    outcome,
    method,
    ip,
    userAgent
  }).catch(() => {});
};

const registerFailure = async (user, reason) => {
  if (!user) return null;

  const stale = user.lastFailedLoginAt &&
    Date.now() - user.lastFailedLoginAt.getTime() > ATTEMPT_WINDOW_MS;

  user.failedLoginAttempts = stale ? 1 : (user.failedLoginAttempts || 0) + 1;
  user.lastFailedLoginAt = new Date();

  if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
    user.lockedUntil = minutesFromNow(LOCK_MINUTES);
    user.lockReason = reason;
    user.failedLoginAttempts = 0;
  }

  await user.save();
  return user;
};

const registerSuccess = async (user) => {
  user.failedLoginAttempts = 0;
  user.lastFailedLoginAt = undefined;
  user.lockedUntil = undefined;
  user.lockReason = undefined;
  user.lastLoginAt = new Date();
  await user.save();
  return user;
};

// Used by a staff-initiated unlock. Keeping this beside the lock logic means
// the two cannot drift apart on the field names they clear.
const clearLock = async (user) => {
  user.failedLoginAttempts = 0;
  user.lastFailedLoginAt = undefined;
  user.lockedUntil = undefined;
  user.lockReason = undefined;
  await user.save();
  return user;
};

// Cycle the new hash out of the reuse blacklist. Comparing against every stored
// hash costs one bcrypt round per entry, which is exactly why the list is
// capped.
const rememberPassword = async (user, newHash) => {
  const { HISTORY_DEPTH } = require('./passwordPolicy');
  const previous = (user.passwordHistory || []).filter(Boolean);
  const next = [newHash, ...previous].slice(0, HISTORY_DEPTH);
  user.passwordHistory = next;
  return next;
};

const passwordWasUsedBefore = async (user, candidate) => {
  const stored = user.passwordHistory || [];
  if (!stored.length) return false;
  const attempts = await Promise.all(
    stored.map((hash) => bcrypt.compare(candidate, hash).catch(() => false))
  );
  return attempts.some(Boolean);
};

module.exports = {
  MAX_FAILED_ATTEMPTS,
  LOCK_MINUTES,
  ATTEMPT_WINDOW_MINUTES,
  isLocked,
  lockRemainingMinutes,
  recordAttempt,
  registerFailure,
  registerSuccess,
  clearLock,
  rememberPassword,
  passwordWasUsedBefore,
  requestFingerprint
};
