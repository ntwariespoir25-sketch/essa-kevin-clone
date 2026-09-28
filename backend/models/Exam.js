const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['CAT', 'Midterm', 'Final', 'Quiz', 'Assignment', 'Practical', 'Other'], default: 'Other' },
  term: String,
  year: Number,
  classIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
  weight: { type: Number, default: 0 },
  maxScore: { type: Number, default: 100 },
  examDate: Date,
  instructions: String,
  isPublished: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

examSchema.index({ term: 1, year: 1, type: 1 });

module.exports = mongoose.model('Exam', examSchema);
