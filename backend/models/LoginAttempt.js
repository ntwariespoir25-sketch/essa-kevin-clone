const mongoose = require('mongoose');

// Append-only audit trail of authentication attempts, so that a head of
// security can answer "who tried to get into this account, from where, and did
// it succeed" without trawling logs.
//
// This records every outcome, including the ones that never reach a real
// account: unknown email addresses and inactive accounts are still written,
// because a spray across many addresses is exactly the pattern worth seeing.
const loginAttemptSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Retained even when userId is null, otherwise an enumeration attempt leaves
  // no trace at all.
  identifier: String,
  role: String,
  success: { type: Boolean, required: true },
  // machine-readable: ok | bad_password | no_such_user | inactive | locked
  outcome: String,
  method: { type: String, enum: ['password', 'sdms'], default: 'password' },
  ip: String,
  userAgent: String,
  createdAt: { type: Date, default: Date.now, index: true }
});

loginAttemptSchema.index({ userId: 1, createdAt: -1 });
loginAttemptSchema.index({ ip: 1, createdAt: -1 });
loginAttemptSchema.index({ outcome: 1, createdAt: -1 });

module.exports = mongoose.model('LoginAttempt', loginAttemptSchema);
