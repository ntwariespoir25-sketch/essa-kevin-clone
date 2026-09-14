const rateLimit = require('express-rate-limit');

const base = {
  windowMs: 15 * 60 * 1000,
  standardHeaders: true,
  legacyHeaders: false
};

const apiLimiter = rateLimit({ ...base, max: 500 });

const authLimiter = rateLimit({ ...base, max: 20 });

const publicFormLimiter = rateLimit({ ...base, max: 10 });

module.exports = { apiLimiter, authLimiter, publicFormLimiter };