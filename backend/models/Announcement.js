const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: String,
  content: String,
  audience: { type: mongoose.Schema.Types.Mixed, default: ['all'] },
  // Classes this notice is restricted to. Empty means it follows `audience` only.
  // A teacher's class notice must reach that class's pupils and parents and
  // nobody else, and role targeting alone cannot express "S3 B and their parents"
  // without also exposing it to every S3 pupil in another form.
  classIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
  // Year groups ("S3", "Primary 4"). Kept as a list rather than folded into
  // `audience` because the role tokens and the year groups answer different
  // questions, and free text in `audience` could only ever be matched by
  // substring guesswork.
  grades: [{ type: String, trim: true }],
  // Named recipients. These are addressed directly and always receive the
  // notice, which is how "tell this one parent" works without having to
  // invent an audience that describes only them.
  userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  priority: { type: String, default: 'normal' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
announcementSchema.index({ classIds: 1, createdAt: -1 });
announcementSchema.index({ userIds: 1 });
announcementSchema.index({ grades: 1 });
module.exports = mongoose.model('Announcement', announcementSchema);