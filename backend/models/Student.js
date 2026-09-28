const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  studentId: String,
  fullName: String,
  email: String,
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  parentName: String,
  parentPhone: String,
  isActive: { type: Boolean, default: true },
  sdmsCode: { type: String, unique: true, sparse: true },
  sdmsCodeIssuedAt: Date,
  firstLoginAt: Date,
  enrollmentDate: { type: Date, default: Date.now }
});

studentSchema.index({ studentId: 1 });
studentSchema.index({ classId: 1 });
studentSchema.index({ sdmsCode: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Student', studentSchema);