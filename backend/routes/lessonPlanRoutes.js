const express = require('express');

const LessonPlan = require('../models/LessonPlan');
const TeacherProfile = require('../models/TeacherProfile');
const Class = require('../models/Class');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');

const router = express.Router();

const review = requireRole('academic_admin', 'super_admin');

const withNames = async (plans) => {
  const classIds = [...new Set(plans.map(p => p.classId).filter(Boolean).map(String))];
  const classes = classIds.length ? await Class.find({ _id: { $in: classIds } }).select('grade className') : [];
  const classById = new Map(classes.map(c => [String(c._id), c]));

  const teacherIds = [...new Set(plans.map(p => p.teacherId).filter(Boolean).map(String))];
  const profiles = teacherIds.length ? await TeacherProfile.find({ userId: { $in: teacherIds } }).select('userId fullName') : [];
  const byUser = new Map(profiles.map(p => [String(p.userId), p]));

  return plans.map(p => {
    const obj = p.toObject();
    const c = p.classId ? classById.get(String(p.classId)) : null;
    obj.className = c ? `${c.grade || ''} ${c.className || ''}`.trim() : null;
    obj.teacherName = p.teacherId ? byUser.get(String(p.teacherId))?.fullName || null : null;
    return obj;
  });
};

router.get('/lesson-plans', authMiddleware, requireRole('academic_admin', 'super_admin', 'teacher'), async (req, res) => {
  try {
    const query = {};
    if (req.userRole === 'teacher') {
      query.teacherId = req.userId;
    } else {
      if (req.query.status) query.status = req.query.status;
      if (req.query.classId) query.classId = req.query.classId;
    }
    if (req.query.term) query.term = req.query.term;
    if (req.query.year) query.year = Number(req.query.year);

    const plans = await LessonPlan.find(query).sort({ createdAt: -1 });
    const shaped = await withNames(plans);

    const counts = { draft: 0, submitted: 0, approved: 0, rejected: 0 };
    const all = await LessonPlan.find(req.userRole === 'teacher' ? { teacherId: req.userId } : {}).select('status');
    all.forEach(p => { if (counts[p.status] !== undefined) counts[p.status] += 1; });

    res.json({ success: true, lessonPlans: shaped, counts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/lesson-plans/:id/review', authMiddleware, review, async (req, res) => {
  try {
    const { decision, reviewNotes } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'decision must be approved or rejected' });
    }
    if (decision === 'rejected' && !reviewNotes) {
      return res.status(400).json({ success: false, message: 'A reason is required when rejecting a plan' });
    }

    const plan = await LessonPlan.findByIdAndUpdate(
      req.params.id,
      {
        status: decision,
        reviewNotes: reviewNotes || '',
        reviewedBy: req.userId,
        reviewedByName: req.userName,
        reviewedAt: new Date()
      },
      { new: true }
    );
    if (!plan) return res.status(404).json({ success: false, message: 'Lesson plan not found' });

    const [shaped] = await withNames([plan]);
    res.json({ success: true, lessonPlan: shaped });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
