const mongoose = require('mongoose');

const timetableSchema = new mongoose.Schema({
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  dayOfWeek: { type: Number, min: 1, max: 6, required: true },
  period: { type: Number, min: 1, max: 12, required: true },
  startTime: String,
  endTime: String,
  subject: String,
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  room: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

timetableSchema.index({ classId: 1, dayOfWeek: 1, period: 1 }, { unique: true });
timetableSchema.index({ teacherId: 1, dayOfWeek: 1, period: 1 });

module.exports = mongoose.model('Timetable', timetableSchema);
