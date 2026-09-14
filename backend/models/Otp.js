const crypto = require('crypto');
const mongoose = require('mongoose');

const { getJWTSecret } = require('../utils/jwt');

const otpSchema = new mongoose.Schema({
  identifier: { type: String, required: true },
  type: { type: String, default: 'login' },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ identifier: 1, type: 1 });

otpSchema.statics.hashCode = (code, identifier) =>
  crypto.createHash('sha256').update(`${code}:${identifier}:${getJWTSecret()}`).digest('hex');

otpSchema.statics.generate = async function (identifier, type = 'login', ttlSeconds = 300) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await this.deleteMany({ identifier, type });
  await this.create({
    identifier,
    type,
    codeHash: this.hashCode(code, identifier),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000)
  });
  return code;
};

otpSchema.statics.verify = async function (identifier, code, type = 'login') {
  const record = await this.findOne({ identifier, type, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!record) return false;
  if (record.attempts >= 5) {
    await record.deleteOne();
    return false;
  }
  if (this.hashCode(code, identifier) !== record.codeHash) {
    record.attempts += 1;
    await record.save();
    return false;
  }
  await record.deleteOne();
  return true;
};

module.exports = mongoose.model('Otp', otpSchema);