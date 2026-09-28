const mongoose = require('mongoose');

const lessonPlanSchema = new mongoose.Schema({
  title: { type: String, required: true },
  topic: { type: String, required: true },
  objectives: String,
  materials: String,
  fileUrl: String,
  shareWithStudents: { type: Boolean, default: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  subject: String,
  week: String,
  term: String,
  year: Number,
  syllabusProgress: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'submitted', 'approved', 'rejected'], default: 'draft' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedByName: String,
  reviewedAt: Date,
  reviewNotes: String,
  createdAt: { type: Date, default: Date.now }
});

lessonPlanSchema.index({ classId: 1, createdAt: -1 });
lessonPlanSchema.index({ status: 1 });

module.exports = mongoose.model('LessonPlan', lessonPlanSchema);