const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  category: { type: String, default: 'academic' },
  date: { type: Date, required: true },
  endDate: Date,
  time: String,
  location: String,
  audience: { type: mongoose.Schema.Types.Mixed, default: ['all'] },
  permissionRequired: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

eventSchema.index({ date: 1 });
eventSchema.index({ isActive: 1, date: 1 });

module.exports = mongoose.model('Event', eventSchema);
