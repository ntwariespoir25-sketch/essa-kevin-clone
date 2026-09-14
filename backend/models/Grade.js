const mongoose = require('mongoose');

const gradeSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  subject: String,
  score: Number,
  grade: String,
  term: String,
  year: Number,
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

gradeSchema.index({ studentId: 1 });
gradeSchema.index({ teacherId: 1 });
gradeSchema.index({ studentId: 1, subject: 1, term: 1, year: 1 });

module.exports = mongoose.model('Grade', gradeSchema);