const mongoose = require('mongoose');

// One quiz document with its questions embedded rather than a second collection.
// A quiz is read and written whole every time it is taken or marked, and the
// question count is bounded by hand-authoring, so embedding avoids a populate on
// the hottest path and keeps "delete a quiz" from orphaning question rows.
const questionSchema = new mongoose.Schema({
  prompt: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['single', 'multiple', 'boolean', 'short'],
    default: 'single'
  },
  options: [{ type: String, trim: true }],
  // The answer key. Never sent to a pupil before they submit - see
  // studentQuizView in the quiz routes, which is the only reader that strips it.
  correctAnswers: [{ type: String }],
  points: { type: Number, default: 1, min: 0 },
  // Short answers cannot be marked by the server, so the attempt is created
  // unscored and a teacher has to release the marks.
  requiresManualMarking: { type: Boolean, default: false },
  order: { type: Number, default: 0 }
}, { _id: true });

const quizSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  subject: { type: String, trim: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  questions: [questionSchema],

  timeLimitMinutes: { type: Number, default: 0, min: 0 },
  opensAt: Date,
  closesAt: Date,
  allowRetakes: { type: Boolean, default: false },

  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  publishedAt: Date,

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// One quiz per teacher per title is a duplicate by accident, not by intent.
quizSchema.index({ teacherId: 1, classId: 1, title: 1 });
quizSchema.index({ classId: 1, status: 1 });
quizSchema.index({ teacherId: 1 });

// Publishing is the gate that makes a quiz visible to pupils, and it is only
// reachable by the owning teacher. The publishedAt stamp is kept separately
// because "when did this go live" is asked when a quiz is disputed.
quizSchema.pre('validate', function (next) {
  if (this.status === 'published' && !this.publishedAt) this.publishedAt = new Date();
  if (this.isModified('publishedAt') && !this.publishedAt) this.publishedAt = new Date();
  if (this.isModified('status') && this.status !== 'published') this.publishedAt = undefined;
  next();
});

module.exports = mongoose.model('Quiz', quizSchema);
