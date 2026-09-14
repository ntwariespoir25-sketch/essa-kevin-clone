const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
  title: { type: String, required: true },
  term: String,
  year: Number,
  subject: String,
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  date: Date,
  startTime: String,
  duration: { type: Number, default: 120 },
  totalMarks: { type: Number, default: 100 },
  venue: String,
  invigilatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, default: 'scheduled' },
  resultsPublished: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

examSchema.index({ classId: 1, date: 1 });
examSchema.index({ term: 1, year: 1 });

module.exports = mongoose.model('Exam', examSchema);