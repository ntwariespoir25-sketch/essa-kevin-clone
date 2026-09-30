const mongoose = require('mongoose');

// A pupil's submission for one quiz.
//
// Answers are copied onto the attempt rather than left pointing at the quiz, so
// that editing a published question afterwards cannot retroactively change a mark
// that has already been awarded. That is the whole reason this is a document
// rather than a lookup: the evidence a parent disputes has to be immutable.
const answerSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId },
  // What the pupil typed or picked, kept for review and for appeal.
  text: { type: String, default: '' },
  selectedOptions: [{ type: String }],
  isCorrect: { type: Boolean },
  pointsAwarded: { type: Number, default: 0 },
  maxPoints: { type: Number, default: 0 },
  // false for short answers and for anything a teacher still has to mark.
  autoMarked: { type: Boolean, default: false },
  teacherComment: { type: String }
}, { _id: false });

const attemptSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },

  answers: [answerSchema],

  score: { type: Number, default: 0 },
  maxScore: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  // True while any short answer is still unmarked, which is what the teacher
  // screen keys off. Percentages are meaningless until it clears.
  pendingManualMarking: { type: Boolean, default: false },
  fullyMarked: { type: Boolean, default: false },

  attemptNumber: { type: Number, default: 1 },
  // 'in_progress' is created by the server the moment a pupil opens the quiz and
  // is what makes the time limit meaningful: startedAt below is the server's
  // clock, so a pupil cannot claim they started later than they did. The attempt
  // only becomes 'submitted' when the answers come back.
  status: { type: String, enum: ['in_progress', 'submitted'], default: 'submitted' },
  startedAt: { type: Date, default: Date.now },
  submittedAt: Date,
  durationSeconds: Number
});

attemptSchema.index({ quizId: 1, studentId: 1 });
// Without this a pupil can double-submit and overwrite their own marks by racing
// two requests. Retakes are allowed explicitly via the quiz, one attempt each.
attemptSchema.index(
  { quizId: 1, studentId: 1, attemptNumber: 1 },
  { unique: true }
);
attemptSchema.index({ studentId: 1 });
attemptSchema.index({ classId: 1 });

module.exports = mongoose.model('QuizAttempt', attemptSchema);
