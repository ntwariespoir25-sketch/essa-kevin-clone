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
  priority: { type: String, default: 'normal' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
announcementSchema.index({ classIds: 1, createdAt: -1 });
module.exports = mongoose.model('Announcement', announcementSchema);