const mongoose = require('mongoose');

const gradeSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  subject: String,
  score: Number,
  grade: String,
  term: String,
  year: Number,
  assessmentType: { type: String, default: 'Other' },
  assessmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam' },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  // Marks get corrected after publishing, often enough that "when was this
  // changed" is asked in disputes. Without it a corrected score is
  // indistinguishable from the original entry.
  updatedAt: { type: Date, default: Date.now }
});

gradeSchema.index({ studentId: 1 });
gradeSchema.index({ teacherId: 1 });
gradeSchema.index({ studentId: 1, subject: 1, term: 1, year: 1 });
// The mark-entry upsert filters on the full assessment identity, so that
// combination has to be unique or bulkWrite can match several rows at once.
gradeSchema.index(
  { studentId: 1, subject: 1, term: 1, year: 1, assessmentId: 1 },
  { unique: true, partialFilterExpression: { assessmentId: { $type: 'objectId' } } }
);

module.exports = mongoose.model('Grade', gradeSchema);