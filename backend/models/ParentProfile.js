const mongoose = require('mongoose');

const parentProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  parentPhone: { type: String, unique: true, sparse: true },
  parentName: String,
  parentEmail: String,
  isLinked: { type: Boolean, default: false },
  linkedAt: Date,
  children: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  createdAt: { type: Date, default: Date.now }
});

parentProfileSchema.index({ userId: 1 });

module.exports = mongoose.model('ParentProfile', parentProfileSchema);