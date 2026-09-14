const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  title: String,
  description: String,
  subject: String,
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dueDate: Date,
  totalPoints: Number,
  fileUrl: String,
  submissions: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    submittedAt: Date,
    content: String,
    fileUrl: String,
    score: Number,
    grade: String,
    feedback: String,
    gradedAt: Date,
    status: { type: String, default: 'pending' }
  }],
  createdAt: { type: Date, default: Date.now }
});

assignmentSchema.index({ classId: 1, createdAt: -1 });
assignmentSchema.index({ teacherId: 1 });

module.exports = mongoose.model('Assignment', assignmentSchema);