const mongoose = require('mongoose');

const subjectAllocationSchema = new mongoose.Schema({
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  subject: { type: String, required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  academicYear: String,
  periodsPerWeek: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

subjectAllocationSchema.index({ classId: 1, subject: 1 }, { unique: true });
subjectAllocationSchema.index({ teacherId: 1 });

module.exports = mongoose.model('SubjectAllocation', subjectAllocationSchema);
