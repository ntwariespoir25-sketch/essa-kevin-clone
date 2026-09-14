const Grade = require('../models/Grade');
const Attendance = require('../models/Attendance');
const Discipline = require('../models/Discipline');
const Student = require('../models/Student');

const letterGrade = (value) => {
  if (value >= 80) return 'A';
  if (value >= 70) return 'B';
  if (value >= 60) return 'C';
  if (value >= 50) return 'D';
  return 'F';
};

const buildReportCard = async (student, options = {}) => {
  const { term, year } = options;
  const academicYear = year ? parseInt(year) : new Date().getFullYear();

  const filter = { studentId: student._id, year: academicYear };
  if (term) filter.term = term;

  const grades = await Grade.find(filter).lean();

  const bySubject = {};
  grades.forEach(g => {
    const key = g.subject || 'General';
    bySubject[key] = bySubject[key] || { total: 0, count: 0 };
    bySubject[key].total += g.score || 0;
    bySubject[key].count += 1;
  });

  const subjects = Object.entries(bySubject)
    .map(([name, v]) => {
      const average = Math.round(v.total / v.count);
      return { subject: name, average, grade: letterGrade(average), examsTaken: v.count };
    })
    .sort((a, b) => b.average - a.average);

  const totalScore = grades.reduce((a, g) => a + (g.score || 0), 0);
  const overallAverage = grades.length ? Math.round(totalScore / grades.length) : 0;

  let rank = null;
  let classSize = 0;
  if (student.classId && grades.length) {
    const classmates = await Student.find({ classId: student.classId }).select('_id');
    classSize = classmates.length;
    const yearMatch = { year: academicYear };
    if (term) yearMatch.term = term;
    const agg = await Grade.aggregate([
      { $match: { studentId: { $in: classmates.map(c => c._id) }, ...yearMatch } },
      { $group: { _id: '$studentId', average: { $avg: '$score' } } }
    ]);
    const sorted = agg.map(g => Math.round(g.average)).sort((a, b) => b - a);
    rank = sorted.indexOf(overallAverage) + 1;
  }

  const yearStart = new Date(`${academicYear}-01-01T00:00:00.000Z`);
  const yearEnd = new Date(`${academicYear + 1}-01-01T00:00:00.000Z`);
  const attendanceRecords = await Attendance.find({
    studentId: student._id,
    date: { $gte: yearStart, $lt: yearEnd }
  }).lean();

  const attendance = {
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    leave: 0,
    other: 0,
    total: attendanceRecords.length,
    rate: 0
  };
  attendanceRecords.forEach(a => {
    const st = (a.status || 'other').toLowerCase();
    if (attendance[st] !== undefined) attendance[st] += 1;
    else attendance.other += 1;
  });
  if (attendance.total > 0) {
    attendance.rate = Math.round((attendance.present / attendance.total) * 100);
  }

  const disciplineRecords = await Discipline.find({ studentId: student._id }).lean();
  const discipline = {
    total: disciplineRecords.length,
    pending: disciplineRecords.filter(d => d.status !== 'resolved').length,
    resolved: disciplineRecords.filter(d => d.status === 'resolved').length
  };

  return {
    student: {
      _id: student._id,
      fullName: student.fullName,
      studentId: student.studentId,
      email: student.email || '',
      class: student.classId ? `${student.classId.grade || ''} ${student.classId.className || ''}`.trim() : 'Not Assigned'
    },
    term: term || 'Year',
    year: academicYear,
    subjects,
    overallAverage,
    overallGrade: letterGrade(overallAverage),
    rank,
    classSize,
    attendance,
    discipline,
    gradesCount: grades.length,
    generatedAt: new Date().toISOString()
  };
};

module.exports = { buildReportCard, letterGrade };