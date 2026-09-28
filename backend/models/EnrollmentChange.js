const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  studentName: String,
  fromClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  fromClassName: String,
  toClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  toClassName: String,
  outcome: { type: String, enum: ['promoted', 'retained', 'demoted', 'transferred_in', 'transferred_out', 'graduated', 'withdrawn'], required: true },
  term: String,
  year: Number,
  averageScore: Number,
  reason: String,
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  performedByName: String,
  createdAt: { type: Date, default: Date.now }
});

enrollmentSchema.index({ studentId: 1, createdAt: -1 });
enrollmentSchema.index({ year: 1, outcome: 1 });

module.exports = mongoose.model('EnrollmentChange', enrollmentSchema);
