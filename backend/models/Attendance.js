const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  date: Date,
  status: String,
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

attendanceSchema.index({ classId: 1, date: 1 });
attendanceSchema.index({ studentId: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);