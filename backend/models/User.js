const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fullName: String,
  email: { type: String, unique: true },
  password: String,
  role: String,
  phone: String,
  profileImage: String,
  isActive: { type: Boolean, default: true },
  mustChangePassword: { type: Boolean, default: false },
  passwordChangedAt: Date,
  lastLoginAt: Date,

  // Brute-force defence for a single account. The IP-based authLimiter in
  // config/rateLimit.js cannot help when an attacker spreads attempts across
  // many addresses, and one account is all they actually need.
  failedLoginAttempts: { type: Number, default: 0 },
  lockedUntil: Date,
  lastFailedLoginAt: Date,
  lockReason: String,

  // Newest first, capped at HISTORY_DEPTH by utils/passwordPolicy.
  passwordHistory: { type: [String], default: [] },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);