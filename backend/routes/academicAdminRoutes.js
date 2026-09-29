const mongoose = require('mongoose');
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const User = require('../models/User');
const { passwordProblems } = require('../utils/passwordPolicy');
const { rememberPassword } = require('../utils/loginSecurity');
const TeacherProfile = require('../models/TeacherProfile');
const Student = require('../models/Student');
const Class = require('../models/Class');
const Grade = require('../models/Grade');
const Attendance = require('../models/Attendance');
const Discipline = require('../models/Discipline');
const FeePayment = require('../models/FeePayment');
const Invoice = require('../models/Invoice');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');
const { sendWelcomeEmail } = require('../utils/emailService');
const { paginate, respondList } = require('../utils/paginate');
const { issueCode } = require('../utils/sdms');
const { studentScopeFilter, classScopeFilter, STAFF_ROLES } = require('../utils/access');

const router = express.Router();

// ==================== TEACHERS ====================
// The staff directory. Previously any signed-in account, including a parent or
// pupil, could read every teacher's name, email, phone and subject.
router.get('/academic-admin/teachers-list', authMiddleware, requireRole(...STAFF_ROLES), async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const total = await TeacherProfile.countDocuments();
  const teachers = await TeacherProfile.find().sort({ fullName: 1 }).skip(skip).limit(limit || undefined);
  respondList(res, teachers, { page, limit, total });
});

router.post('/academic-admin/create-teacher-credentials', authMiddleware, requireRole('academic_admin', 'super_admin'), async (req, res) => {
  try {
    const { fullName, email, password, subject, phone } = req.body;
    if (await User.findOne({ email })) return res.status(400).json({ message: 'Email already exists' });

    // Same treatment as create-admin: a chosen password is held to the shared
    // policy, and a generated one is flagged for replacement at first sign-in.
    const generated = !password;
    const finalPassword = generated
      ? crypto.randomBytes(9).toString('base64url').slice(0, 12) + '7'
      : password;

    const problems = generated ? [] : passwordProblems(finalPassword, { email, fullName });
    if (problems.length) {
      return res.status(400).json({ message: problems[0], problems });
    }

    const hashedPassword = await bcrypt.hash(finalPassword, 10);
    const teacherUser = await User.create({
      fullName, email, password: hashedPassword, role: 'teacher', phone: phone || '',
      mustChangePassword: generated,
      passwordChangedAt: generated ? undefined : new Date(),
      createdBy: req.userId
    });
    await rememberPassword(teacherUser, hashedPassword);
    await teacherUser.save();
    const teacherProfile = await TeacherProfile.create({ userId: teacherUser._id, fullName, email, subject: subject || 'General', phone: phone || '' });
    sendWelcomeEmail({ _id: teacherUser._id, fullName, email, role: 'teacher' }).catch(console.error);
    res.json({ success: true, teacher: teacherProfile, password: finalPassword, generated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/academic-admin/teachers/:id', authMiddleware, requireRole('academic_admin', 'super_admin'), async (req, res) => {
  try {
    const { fullName, email, subject, phone } = req.body;
    const teacher = await TeacherProfile.findByIdAndUpdate(req.params.id, { fullName, email, subject, phone }, { new: true });
    if (teacher?.userId) await User.findByIdAndUpdate(teacher.userId, { fullName, email, phone });
    res.json({ success: true, teacher });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/academic-admin/teachers/:id', authMiddleware, requireRole('academic_admin', 'super_admin'), async (req, res) => {
  try {
    const teacher = await TeacherProfile.findById(req.params.id);
    if (teacher?.userId) await User.findByIdAndDelete(teacher.userId);
    await TeacherProfile.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== CLASSES ====================
router.get('/academic-admin/classes', authMiddleware, async (req, res) => {
  try {
    // Scoped like the student roll: staff get every class, a teacher only the
    // classes they own or are allocated to, a parent or pupil only the classes
    // their household is enrolled in.
    const scope = await classScopeFilter(req.userId, req.userRole);
    const classes = await Class.find(scope).lean();
    for (const cls of classes) {
      if (cls.teacherId) {
        const teacher = await TeacherProfile.findOne({ userId: cls.teacherId });
        if (teacher) cls.teacherInfo = { _id: cls.teacherId, fullName: teacher.fullName };
      }
    }
    res.json(classes);
  } catch {
    res.json([]);
  }
});

// A class whose teacherId points at a missing or non-teacher user is orphaned:
// it appears in no teacher's dashboard and teacherOwnsClass denies it, so the
// class silently stops being teachable and drops out of scoped listings. Both
// class routes below accept teacherId, so the check is shared.
const resolveTeacher = async (teacherId) => {
  if (teacherId === undefined || teacherId === null || teacherId === '') return { ok: true, teacherId: null };
  if (!mongoose.Types.ObjectId.isValid(teacherId)) {
    return { ok: false, message: 'The selected teacher is not a valid id' };
  }
  const teacher = await User.findById(teacherId).select('role');
  if (!teacher) return { ok: false, message: 'The selected teacher does not exist' };
  if (teacher.role !== 'teacher') {
    return { ok: false, message: 'A class teacher must be a user with the teacher role' };
  }
  return { ok: true, teacherId: teacher._id };
};

router.post('/academic-admin/classes', authMiddleware, requireRole('academic_admin', 'super_admin'), async (req, res) => {
  try {
    const { className, grade, academicYear, teacherId } = req.body;
    const teacher = await resolveTeacher(teacherId);
    if (!teacher.ok) return res.status(400).json({ message: teacher.message });
    const newClass = await Class.create({ className, grade, academicYear, teacherId: teacher.teacherId, students: [] });
    res.json({ success: true, class: newClass });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/academic-admin/classes/:classId/assign-teacher', authMiddleware, requireRole('academic_admin', 'super_admin'), async (req, res) => {
  try {
    const teacher = await resolveTeacher(req.body.teacherId);
    if (!teacher.ok) return res.status(400).json({ message: teacher.message });
    const classItem = await Class.findByIdAndUpdate(req.params.classId, { teacherId: teacher.teacherId }, { new: true });
    if (!classItem) return res.status(404).json({ message: 'Class not found' });
    res.json({ success: true, class: classItem });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/academic-admin/classes/:id', authMiddleware, requireRole('academic_admin', 'super_admin'), async (req, res) => {
  await Class.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ==================== STUDENTS ====================
router.get('/academic-admin/students', authMiddleware, async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req.query);
    // Scoped to the caller's entitlement: staff portals get the whole roll,
    // a teacher only their classes, a parent only their children, a pupil only
    // themselves. Previously any logged-in account could list every student.
    const scope = await studentScopeFilter(req.userId, req.userRole);
    const total = await Student.countDocuments(scope);
    const students = await Student.find(scope).populate('classId', 'grade className').sort({ fullName: 1 }).skip(skip).limit(limit || undefined);
    respondList(res, students, { page, limit, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Enrolment is an academic admin responsibility. Teachers were previously
// allowed here, which let any teacher create a student account (and an SDMS
// code) for a class they taught, bypassing the enrolment and records process.
router.post('/academic-admin/students', authMiddleware, requireRole('academic_admin', 'super_admin'), async (req, res) => {
  try {
    const count = await Student.countDocuments();
    const studentId = `STU${new Date().getFullYear()}${String(count + 1).padStart(4, '0')}`;

    // An unknown classId would otherwise store a dangling reference on the
    // student while the $addToSet below silently matched nothing, leaving a
    // student who belongs to nothing and never appears in a register.
    if (req.body.classId) {
      const classItem = await Class.findById(req.body.classId).select('_id');
      if (!classItem) {
        return res.status(400).json({ message: 'The selected class does not exist' });
      }
    }

    const student = await Student.create({ ...req.body, studentId });
    if (req.body.classId) {
      await Class.findByIdAndUpdate(req.body.classId, { $addToSet: { students: student._id } });
    }

    // Students authenticate with an SDMS code, not a shared default password,
    // so the account is created with an unguessable placeholder that only the
    // code can get past. mustChangePassword forces the modal on first login.
    const studentUser = await User.create({
      fullName: req.body.fullName,
      email: req.body.email || `${req.body.fullName.replace(/\s/g, '').toLowerCase()}@student.essa.rw`,
      password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
      role: 'student',
      phone: req.body.parentPhone,
      mustChangePassword: true,
      createdBy: req.userId
    });

    student.userId = studentUser._id;
    const sdmsCode = await issueCode(student);

    res.json({ success: true, student, sdmsCode });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/academic-admin/students/:id', authMiddleware, requireRole('academic_admin', 'super_admin'), async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found' });

    if (student.classId) {
      await Class.findByIdAndUpdate(student.classId, { $pull: { students: student._id } });
    }
    if (student.userId) await User.findByIdAndDelete(student.userId);

    await Grade.deleteMany({ studentId: student._id });
    await Attendance.deleteMany({ studentId: student._id });
    await Discipline.deleteMany({ studentId: student._id });
    await FeePayment.deleteMany({ studentId: student._id });
    await Invoice.deleteMany({ studentId: student._id });

    await Student.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== PERFORMANCE ====================
router.get('/academic-admin/students-performance', authMiddleware, async (req, res) => {
  try {
    const scope = await studentScopeFilter(req.userId, req.userRole);
    const students = await Student.find(scope).populate('classId', 'grade className');
    // Only aggregate over the students actually returned, otherwise a teacher
    // scoped to one class would still have every grade in the school loaded
    // into the lookup map even though the rows are never rendered.
    const ids = students.map(s => s._id);
    const gradeAgg = ids.length
      ? await Grade.aggregate([
        { $match: { studentId: { $in: ids } } },
        { $group: { _id: '$studentId', average: { $avg: '$score' }, count: { $sum: 1 } } }
      ])
      : [];
    const scoreMap = new Map(gradeAgg.map(g => [String(g._id), g]));
    const performanceData = students.map(s => {
      const agg = scoreMap.get(String(s._id));
      const average = agg ? Math.round(agg.average) : 0;
      return {
        studentId: s.studentId || `STU${s._id.toString().slice(-6)}`,
        name: s.fullName,
        class: s.classId ? `${s.classId.grade} ${s.classId.className}` : 'Not Assigned',
        averageScore: average,
        subjectsTracked: agg ? agg.count : 0,
        grade: average >= 80 ? 'A' : average >= 70 ? 'B' : average >= 60 ? 'C' : average >= 50 ? 'D' : 'F'
      };
    }).sort((a, b) => b.averageScore - a.averageScore);
    res.json(performanceData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// School-wide academic averages per class. Staff only: previously any
// signed-in account could read every class's performance.
router.get('/academic-admin/class-performance', authMiddleware, requireRole(...STAFF_ROLES), async (req, res) => {
  try {
    const classes = await Class.find();
    const students = await Student.find({ classId: { $in: classes.map(c => c._id) } });
    const gradeAgg = await Grade.aggregate([
      { $group: { _id: '$studentId', average: { $avg: '$score' } } }
    ]);
    const scoreMap = new Map(gradeAgg.map(g => [String(g._id), g.average]));
    const performanceData = classes.map(cls => {
      const classStudents = students.filter(s => String(s.classId) === String(cls._id));
      const scores = classStudents
        .map(s => scoreMap.get(String(s._id)))
        .filter(avg => avg !== undefined);
      const sum = scores.reduce((a, b) => a + b, 0);
      return {
        className: `${cls.grade} ${cls.className}`,
        studentCount: classStudents.length,
        assessedCount: scores.length,
        averageScore: scores.length ? Math.round(sum / scores.length) : 0
      };
    });
    res.json(performanceData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;