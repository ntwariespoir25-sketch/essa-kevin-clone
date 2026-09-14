const mongoose = require('mongoose');

const timetableSchema = new mongoose.Schema({
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', index: true },
  day: { type: String, required: true },
  period: { type: Number, required: true },
  startTime: String,
  endTime: String,
  subject: String,
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  room: String,
  createdAt: { type: Date, default: Date.now }
});

timetableSchema.index({ classId: 1, day: 1, period: 1 });

module.exports = mongoose.model('Timetable', timetableSchema);