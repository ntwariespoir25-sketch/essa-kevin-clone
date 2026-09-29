const express = require('express');

const Discipline = require('../models/Discipline');
const Student = require('../models/Student');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');
const { authorizeStudentAccess } = require('../utils/access');

const router = express.Router();

router.get('/discipline-admin/cases', authMiddleware, requireRole('discipline_admin', 'super_admin'), async (req, res) => {
  try {
    const cases = await Discipline.find().sort({ createdAt: -1 });
    res.json(cases);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/discipline-admin/cases', authMiddleware, requireRole('teacher', 'discipline_admin', 'super_admin'), async (req, res) => {
  try {
    // The read and update routes on this file already restrict the case record
    // to discipline staff, but creation had no role check at all, so any
    // signed-in account could file a case against any named child.
    //
    // Teachers legitimately need this route for the portal's Report Incident
    // form, so a plain staff-only block would break that. Instead a teacher may
    // only report against a student they actually teach, and discipline staff
    // may report against anyone.
    const { studentId, category, description, action, actionDetails } = req.body;
    if (!studentId || !category || !description) {
      return res.status(400).json({ message: 'studentId, category and description are required' });
    }

    const student = await Student.findById(studentId).populate('classId', 'grade className');
    if (!student) return res.status(404).json({ message: 'Student not found' });

    if (req.userRole === 'teacher' && !(await authorizeStudentAccess(req, student))) {
      return res.status(403).json({ message: 'You can only report an incident for a student in your class' });
    }

    const disciplineCase = await Discipline.create({
      studentId: student._id,
      // Taken from the record rather than the request, so a case cannot be
      // filed against one child while naming another.
      studentName: student.fullName,
      className: student.classId ? `${student.classId.grade || ''} ${student.classId.className || ''}`.trim() : '',
      category,
      description,
      action: action || undefined,
      actionDetails: actionDetails || undefined,
      // Always pending. The body used to be spread into the document, so the
      // caller could file an already-reviewed or already-actioned case.
      status: 'pending',
      reportedBy: req.userId,
      reporterName: req.userName
    });
    res.json({ success: true, case: disciplineCase });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/discipline-admin/cases/:id', authMiddleware, requireRole('discipline_admin', 'super_admin'), async (req, res) => {
  try {
    const disciplineCase = await Discipline.findByIdAndUpdate(
      req.params.id,
      { ...req.body, reviewedBy: req.userId, reviewedAt: new Date() },
      { new: true }
    );
    res.json({ success: true, case: disciplineCase });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/discipline-admin/stats', authMiddleware, requireRole('discipline_admin', 'super_admin'), async (req, res) => {
  try {
    const [pending, resolved, total] = await Promise.all([
      Discipline.countDocuments({ status: 'pending' }),
      Discipline.countDocuments({ status: 'resolved' }),
      Discipline.countDocuments()
    ]);
    res.json({ success: true, pending, resolved, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;