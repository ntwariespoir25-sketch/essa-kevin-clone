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
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);