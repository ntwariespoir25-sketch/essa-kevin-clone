const rateLimit = require('express-rate-limit');

const base = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false
};

// Limits are per-IP, so a shared-NAT school network - or an office behind one
// router - can exhaust a limit that looks generous when tested from a single
// machine. Making them overridable lets a deployment raise the ceiling for a
// known shared egress address without a code change, and lets the integration
// tests drive the full flow without being cut off mid-run.
const num = (name, fallback) => {
  const raw = process.env[name];
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const authWindowMs = num('RATE_LIMIT_AUTH_WINDOW_MS', base.windowMs);

const apiLimiter = rateLimit({ ...base, max: num('RATE_LIMIT_API_MAX', 500) });

// Failed logins are additionally counted per account in utils/loginSecurity,
// which survives an attacker spreading requests across many addresses. This
// limiter is the coarse per-address net that stops a single host hammering.
const authLimiter = rateLimit({
  ...base,
  windowMs: authWindowMs,
  max: num('RATE_LIMIT_AUTH_MAX', 20),
  // Successful sign-ins must never count against the budget, or a whole
  // morning of legitimate use from one address would lock a teacher out.
  skipSuccessfulRequests: true
});

const publicFormLimiter = rateLimit({ ...base, max: num('RATE_LIMIT_FORM_MAX', 10) });

module.exports = { apiLimiter, authLimiter, publicFormLimiter };
