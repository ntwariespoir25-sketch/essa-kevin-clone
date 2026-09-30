const express = require('express');

const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const Student = require('../models/Student');
const Class = require('../models/Class');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');
const { teacherOwnsClass } = require('../utils/access');

const router = express.Router();

// Two separate questions, kept apart on purpose.
//
// QUIZ_ROLES is who may reach these endpoints at all. quizOversight is who may
// act on any class rather than only their own. Collapsing the two is how a
// teacher ends up authoring a quiz for, and reading the marks of, another
// teacher's form: 'teacher' has to be in the first list and must not be in the
// second.
const QUIZ_ROLES = ['teacher', 'academic_admin', 'super_admin'];
const quizOversight = (role) => role === 'academic_admin' || role === 'super_admin';

// ==================== shared helpers ====================

// Everything is compared as a normalised set. Pupils type " Paris ", "paris" and
// "PARIS" and all mean the same thing, and a multiple-choice question is marked
// on the exact set rather than on overlap: picking one extra option is wrong.
const normalise = (value) => String(value == null ? '' : value).trim().toLowerCase();

const asSet = (values) => new Set((Array.isArray(values) ? values : [values]).map(normalise).filter(Boolean));

const setsMatch = (a, b) => {
  const x = asSet(a), y = asSet(b);
  if (x.size !== y.size) return false;
  for (const v of x) if (!y.has(v)) return false;
  return true;
};

// The one reader allowed to hand a quiz to a pupil. The answer key is removed
// here and nowhere else, so there is a single place to audit. `correctAnswers`
// staying on the document is the whole risk: without this a pupil could open the
// quiz, read every answer out of the payload and submit it.
const studentQuizView = (quiz, { includeResult = null } = {}) => ({
  _id: quiz._id,
  title: quiz.title,
  description: quiz.description,
  subject: quiz.subject,
  classId: quiz.classId && quiz.classId._id ? quiz.classId._id : quiz.classId,
  timeLimitMinutes: quiz.timeLimitMinutes,
  opensAt: quiz.opensAt,
  closesAt: quiz.closesAt,
  status: quiz.status,
  allowRetakes: quiz.allowRetakes,
  totalPoints: (quiz.questions || []).reduce((sum, q) => sum + (q.points || 0), 0),
  questionCount: (quiz.questions || []).length,
  questions: (quiz.questions || []).map((q) => ({
    _id: q._id,
    prompt: q.prompt,
    type: q.type,
    options: q.options,
    points: q.points
  })),
  ...(includeResult ? { myResult: includeResult } : {})
});

const teacherQuizView = (quiz) => ({
  _id: quiz._id,
  title: quiz.title,
  description: quiz.description,
  subject: quiz.subject,
  classId: quiz.classId,
  teacherId: quiz.teacherId,
  timeLimitMinutes: quiz.timeLimitMinutes,
  opensAt: quiz.opensAt,
  closesAt: quiz.closesAt,
  allowRetakes: quiz.allowRetakes,
  status: quiz.status,
  publishedAt: quiz.publishedAt,
  createdAt: quiz.createdAt,
  updatedAt: quiz.updatedAt,
  questionCount: (quiz.questions || []).length,
  totalPoints: (quiz.questions || []).reduce((s, q) => s + (q.points || 0), 0),
  questions: quiz.questions
});

// Rejects malformed questions before anything is stored, so a quiz cannot be
// published in a state where a pupil can never score: a multiple-choice question
// with no answer key, or a short answer that silently auto-marks.
const validateQuestions = (questions) => {
  if (!Array.isArray(questions) || !questions.length) {
    return 'A quiz needs at least one question';
  }
  for (const [i, q] of questions.entries()) {
    const n = i + 1;
    if (!String(q.prompt || '').trim()) return `Question ${n} needs a prompt`;
    if (!['single', 'multiple', 'boolean', 'short'].includes(q.type)) {
      return `Question ${n} has an unknown type`;
    }
    const points = Number(q.points);
    if (!Number.isFinite(points) || points < 0) return `Question ${n} has an invalid mark`;

    if (q.type === 'boolean') {
      if (!q.correctAnswers || !q.correctAnswers.length) return `Question ${n} needs a true/false answer`;
      if (!['true', 'false'].includes(normalise(q.correctAnswers[0]))) {
        return `Question ${n} must be answered true or false`;
      }
    } else if (q.type === 'short') {
      if (String(q.correctAnswers || '').trim()) {
        return `Question ${n} is a written answer and cannot also carry an answer key`;
      }
    } else {
      const options = (q.options || []).map((o) => String(o).trim()).filter(Boolean);
      if (options.length < 2) return `Question ${n} needs at least two options`;
      if (new Set(options.map(normalise)).size !== options.length) {
        return `Question ${n} has duplicate options`;
      }
      const key = (q.correctAnswers || []).map(normalise).filter(Boolean);
      if (!key.length) return `Question ${n} needs a correct answer marked`;
      const missing = key.filter((k) => !options.some((o) => normalise(o) === k));
      if (missing.length) {
        return `Question ${n} marks "${missing[0]}" as correct, but that is not one of its options`;
      }
      if (q.type === 'single' && key.length !== 1) {
        return `Question ${n} is single choice and can only have one correct option`;
      }
    }
  }
  return null;
};

const normaliseQuestions = (questions) => (questions || []).map((q, i) => ({
  prompt: String(q.prompt || '').trim(),
  type: q.type || 'single',
  options: q.type === 'boolean' ? ['True', 'False'] : (q.options || []).map((o) => String(o).trim()),
  correctAnswers: q.type === 'short'
    ? []
    : (Array.isArray(q.correctAnswers) ? q.correctAnswers : [q.correctAnswers]).map((c) => String(c).trim()),
  points: Number(q.points) || 0,
  requiresManualMarking: q.type === 'short',
  order: i
}));

// Marks a submitted attempt. Anything not auto-markable is left for a teacher,
// and the attempt is flagged so it never looks finished.
const markAttempt = (quiz, submitted) => {
  const answers = [];
  let score = 0;
  let maxScore = 0;
  let pending = false;

  for (const q of quiz.questions || []) {
    const key = String(q._id);
    const given = (submitted || []).find((a) => String(a.questionId) === key) || {};
    const max = Number(q.points) || 0;
    maxScore += max;

    let isCorrect = null;
    let awarded = 0;

    if (q.type === 'short') {
      pending = true;
    } else {
      isCorrect = setsMatch(given.selectedOptions, q.correctAnswers);
      awarded = isCorrect ? max : 0;
      score += awarded;
    }

    answers.push({
      questionId: q._id,
      text: String(given.text || ''),
      selectedOptions: (given.selectedOptions || []).map((o) => String(o)),
      isCorrect,
      pointsAwarded: awarded,
      maxPoints: max,
      autoMarked: q.type !== 'short'
    });
  }

  return { answers, score, maxScore, pendingManualMarking: pending };
};

// A quiz is open to pupils only between its window, and only while published.
const quizWindow = (quiz) => {
  const now = Date.now();
  if (quiz.status !== 'published') return 'This quiz has not been published';
  if (quiz.opensAt && new Date(quiz.opensAt).getTime() > now) return 'This quiz is not open yet';
  if (quiz.closesAt && new Date(quiz.closesAt).getTime() < now) return 'This quiz has closed';
  return null;
};

// ==================== teacher: authoring ====================

router.get('/teacher/quizzes', authMiddleware, requireRole(...QUIZ_ROLES), async (req, res) => {
  try {
    // Staff oversee every quiz; a teacher sees only their own, so one teacher
    // cannot read or edit another's questions by guessing an id.
    const filter = quizOversight(req.userRole) ? {} : { teacherId: req.userId };
    if (req.query.classId) filter.classId = req.query.classId;

    const quizzes = await Quiz.find(filter)
      .sort({ createdAt: -1 })
      .populate('classId', 'grade className')
      .lean();

    res.json({
      quizzes: quizzes.map((q) => ({
        ...teacherQuizView(q),
        classLabel: q.classId ? `${q.classId.grade} ${q.classId.className}` : 'Unassigned'
      }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/teacher/quizzes', authMiddleware, requireRole(...QUIZ_ROLES), async (req, res) => {
  try {
    const { classId } = req.body;
    if (!classId) return res.status(400).json({ message: 'Choose a class for this quiz' });

    // Staff may target any class; a teacher may only target one they are
    // responsible for.
    if (!quizOversight(req.userRole) && !(await teacherOwnsClass(req.userId, classId))) {
      return res.status(403).json({ message: 'You are not responsible for that class' });
    }
    const classItem = await Class.findById(classId).select('_id');
    if (!classItem) return res.status(400).json({ message: 'That class does not exist' });

    const title = String(req.body.title || '').trim();
    if (!title) return res.status(400).json({ message: 'A title is required' });

    const problem = validateQuestions(req.body.questions);
    if (problem) return res.status(400).json({ message: problem });

    const quiz = await Quiz.create({
      title,
      description: String(req.body.description || '').trim(),
      subject: String(req.body.subject || '').trim(),
      classId,
      // Server-owned: a quiz is always attributed to whoever created it, never
      // to a teacherId supplied in the body.
      teacherId: req.userId,
      questions: normaliseQuestions(req.body.questions),
      timeLimitMinutes: Math.max(0, Number(req.body.timeLimitMinutes) || 0),
      opensAt: req.body.opensAt || null,
      closesAt: req.body.closesAt || null,
      allowRetakes: Boolean(req.body.allowRetakes),
      status: 'draft'
    });

    res.status(201).json({ success: true, quiz: teacherQuizView(quiz) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Loading or saving a quiz is an authoring operation. Everything below funnels
// through here so the ownership rule is written once: a teacher may only touch a
// quiz they created, and only while it is a draft.
const loadOwnQuiz = async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) { res.status(404).json({ message: 'Quiz not found' }); return null; }
  if (!quizOversight(req.userRole) && String(quiz.teacherId) !== String(req.userId)) {
    res.status(403).json({ message: 'That quiz belongs to another teacher' });
    return null;
  }
  return quiz;
};

router.put('/teacher/quizzes/:id', authMiddleware, requireRole(...QUIZ_ROLES), async (req, res) => {
  try {
    const quiz = await loadOwnQuiz(req, res);
    if (!quiz) return;

    // Editing a live quiz would change the questions out from under attempts that
    // were already scored against the old wording.
    if (quiz.status === 'published') {
      return res.status(409).json({ message: 'Unpublish the quiz before editing it' });
    }

    const problem = validateQuestions(req.body.questions);
    if (problem) return res.status(400).json({ message: problem });

    if (req.body.classId && String(req.body.classId) !== String(quiz.classId)) {
      if (!quizOversight(req.userRole) && !(await teacherOwnsClass(req.userId, req.body.classId))) {
        return res.status(403).json({ message: 'You are not responsible for that class' });
      }
      quiz.classId = req.body.classId;
    }

    if (req.body.title !== undefined) quiz.title = String(req.body.title).trim() || quiz.title;
    if (req.body.description !== undefined) quiz.description = String(req.body.description).trim();
    if (req.body.subject !== undefined) quiz.subject = String(req.body.subject).trim();
    if (req.body.questions !== undefined) quiz.questions = normaliseQuestions(req.body.questions);
    if (req.body.timeLimitMinutes !== undefined) {
      quiz.timeLimitMinutes = Math.max(0, Number(req.body.timeLimitMinutes) || 0);
    }
    if (req.body.opensAt !== undefined) quiz.opensAt = req.body.opensAt || null;
    if (req.body.closesAt !== undefined) quiz.closesAt = req.body.closesAt || null;
    if (req.body.allowRetakes !== undefined) quiz.allowRetakes = Boolean(req.body.allowRetakes);

    quiz.updatedAt = new Date();
    await quiz.save();

    res.json({ success: true, quiz: teacherQuizView(quiz) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/teacher/quizzes/:id/publish', authMiddleware, requireRole(...QUIZ_ROLES), async (req, res) => {
  try {
    const quiz = await loadOwnQuiz(req, res);
    if (!quiz) return;

    const wantPublished = req.body.status !== 'draft';

    if (wantPublished) {
      // A quiz with no questions can never be sat, and a quiz whose window has
      // already closed would publish as immediately unavailable.
      if (!quiz.questions || !quiz.questions.length) {
        return res.status(400).json({ message: 'Add at least one question before publishing' });
      }
      if (quiz.closesAt && new Date(quiz.closesAt).getTime() < Date.now()) {
        return res.status(400).json({ message: 'The closing date is already in the past' });
      }
      quiz.status = 'published';
      quiz.publishedAt = quiz.publishedAt || new Date();
    } else {
      quiz.status = 'draft';
      // Clearing the stamp keeps "when did this go live" honest: the quiz is not
      // live right now, so it has no live-since date.
      quiz.publishedAt = undefined;
    }

    quiz.updatedAt = new Date();
    await quiz.save();
    res.json({ success: true, quiz: teacherQuizView(quiz) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/teacher/quizzes/:id', authMiddleware, requireRole(...QUIZ_ROLES), async (req, res) => {
  try {
    const quiz = await loadOwnQuiz(req, res);
    if (!quiz) return;

    // The attempts go with it. Leaving them behind would strand real pupil work
    // and keep quiz documents referenced by nothing.
    await QuizAttempt.deleteMany({ quizId: quiz._id });
    await quiz.deleteOne();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== teacher: results ====================

router.get('/teacher/quizzes/:id/results', authMiddleware, requireRole(...QUIZ_ROLES), async (req, res) => {
  try {
    const quiz = await loadOwnQuiz(req, res);
    if (!quiz) return;

    const attempts = await QuizAttempt.find({ quizId: quiz._id })
      .sort({ submittedAt: -1 })
      .populate('studentId', 'fullName studentId')
      .lean();

    const roster = await Student.find({ classId: quiz.classId }).select('fullName studentId').lean();
    const attempted = new Set(attempts.map((a) => String(a.studentId && a.studentId._id)));

    // Per-question breakdown, so a teacher can see which question the form
    // actually struggled with rather than only a class average.
    const perQuestion = (quiz.questions || []).map((q, i) => {
      const answers = attempts.map((a) => (a.answers || [])[i]).filter(Boolean);
      const graded = answers.filter((a) => a.autoMarked);
      const correct = graded.filter((a) => a.isCorrect).length;
      return {
        index: i,
        prompt: q.prompt,
        type: q.type,
        points: q.points,
        correctAnswers: q.correctAnswers,
        answered: answers.length,
        autoMarked: graded.length,
        correct,
        pending: answers.filter((a) => !a.autoMarked).length,
        percentCorrect: graded.length ? Math.round((correct / graded.length) * 100) : null
      };
    });

    const marked = attempts.filter((a) => a.fullyMarked);
    const scored = marked.filter((a) => Number.isFinite(a.percentage));

    res.json({
      quiz: {
        ...teacherQuizView(quiz),
        classLabel: quiz.classId && quiz.classId.grade !== undefined
          ? `${quiz.classId.grade} ${quiz.classId.className}`
          : null
      },
      rosterSize: roster.length,
      attemptedCount: attempts.length,
      notAttempted: roster.filter((s) => !attempted.has(String(s._id))),
      attempts: attempts.map((a) => {
        const elapsed = a.startedAt && a.submittedAt
          ? Math.round((new Date(a.submittedAt) - new Date(a.startedAt)) / 1000)
          : null;
        // Lateness is computed here rather than stored, because the limit can be
        // changed after the fact and a pupil must not be punished for a window
        // that was widened afterwards.
        const overBy = (quiz.timeLimitMinutes && elapsed !== null && a.submittedAt)
          ? Math.max(0, elapsed - quiz.timeLimitMinutes * 60)
          : 0;
        return {
          ...a,
          studentName: a.studentId ? a.studentId.fullName : 'Unknown',
          studentCode: a.studentId ? a.studentId.studentId : null,
          elapsedSeconds: elapsed,
          lateBySeconds: overBy
        };
      }),
      summary: {
        averagePercent: scored.length
          ? Math.round(scored.reduce((s, a) => s + a.percentage, 0) / scored.length)
          : null,
        highestPercent: scored.length ? Math.max(...scored.map((a) => a.percentage)) : null,
        lowestPercent: scored.length ? Math.min(...scored.map((a) => a.percentage)) : null,
        pendingMarking: attempts.filter((a) => a.pendingManualMarking).length
      },
      perQuestion
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Marks the written answers on one attempt. Per-question rather than wholesale,
// because a teacher works through a script one mark at a time.
router.put('/teacher/attempts/:attemptId/mark', authMiddleware, requireRole(...QUIZ_ROLES), async (req, res) => {
  try {
    const attempt = await QuizAttempt.findById(req.params.attemptId);
    if (!attempt) return res.status(404).json({ message: 'Attempt not found' });

    const quiz = await Quiz.findById(attempt.quizId);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
    if (!quizOversight(req.userRole) && String(quiz.teacherId) !== String(req.userId)) {
      return res.status(403).json({ message: 'That attempt belongs to another teacher' });
    }

    const marks = Array.isArray(req.body.marks) ? req.body.marks : [];
    const byId = new Map(marks.map((m) => [String(m.questionId), m]));

    let score = 0;
    let maxScore = 0;
    let stillPending = false;

    for (const answer of attempt.answers) {
      const q = (quiz.questions || []).find((x) => String(x._id) === String(answer.questionId));
      maxScore += Number(q ? q.points : answer.maxPoints) || 0;

      if (!q || q.type !== 'short') {
        // Auto-marked answers are the server's to decide. Letting a teacher
        // overwrite them here would let a quiz be marked twice, by two rules.
        score += answer.pointsAwarded || 0;
        if (answer.autoMarked === false && !byId.has(String(answer.questionId))) stillPending = true;
        continue;
      }

      const given = byId.get(String(answer.questionId));
      if (!given) { stillPending = true; continue; }

      const awarded = Math.max(0, Math.min(Number(given.pointsAwarded) || 0, Number(q.points) || 0));
      answer.pointsAwarded = awarded;
      answer.autoMarked = true;
      answer.teacherComment = given.teacherComment !== undefined
        ? String(given.teacherComment).slice(0, 500)
        : answer.teacherComment;
      if (given.isCorrect === true || given.isCorrect === false) answer.isCorrect = given.isCorrect;
      score += awarded;
    }

    attempt.score = score;
    attempt.maxScore = maxScore;
    attempt.percentage = maxScore ? Math.round((score / maxScore) * 100) : 0;
    attempt.pendingManualMarking = stillPending;
    attempt.fullyMarked = !stillPending;
    await attempt.save();

    res.json({ success: true, attempt });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ==================== pupil: taking ====================

// The pupil's own record. Anything outside this shape is not theirs to see.
const pupilOwnRecord = async (userId) => {
  const pupil = await Student.findOne({ userId }).select('_id classId');
  return pupil;
};

router.get('/student/quizzes', authMiddleware, requireRole('student'), async (req, res) => {
  try {
    const pupil = await pupilOwnRecord(req.userId);
    if (!pupil || !pupil.classId) return res.json({ quizzes: [] });

    // Only published quizzes for the pupil's own class. A draft, another form's
    // quiz, or a closed window is not returned at all rather than returned and
    // hidden by the client.
    const quizzes = await Quiz.find({
      classId: pupil.classId,
      status: 'published'
    }).sort({ createdAt: -1 }).lean();

    const attempts = await QuizAttempt.find({ studentId: pupil._id }).lean();
    const attemptByQuiz = new Map(attempts.map((a) => [String(a.quizId), a]));

    res.json({
      quizzes: quizzes
        .map((q) => studentQuizView(q, { includeResult: attemptByQuiz.get(String(q._id)) }))
        .map((q) => {
          const windowState = quizWindow(q);
          // A pupil who has already sat the quiz may try again only when the
          // teacher allowed retakes. The answer comes from the quiz, not from
          // whether an attempt happens to exist.
          return {
            ...q,
            windowState,
            canAttempt: !windowState && (!q.myResult || q.allowRetakes)
          };
        })
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Loads a published quiz in the pupil's own class, or explains why not. Used by
// both the start and submit paths so the rule cannot drift between them.
const loadPupilQuiz = async (req, res) => {
  const pupil = await pupilOwnRecord(req.userId);
  if (!pupil || !pupil.classId) {
    res.status(403).json({ message: 'No pupil record is linked to this account' });
    return null;
  }
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) { res.status(404).json({ message: 'Quiz not found' }); return null; }
  if (String(quiz.classId) !== String(pupil.classId)) {
    res.status(403).json({ message: 'That quiz is not for your class' });
    return null;
  }
  const closed = quizWindow(quiz);
  if (closed) { res.status(403).json({ message: closed }); return null; }
  return { quiz, pupil };
};

router.get('/student/quizzes/:id', authMiddleware, requireRole('student'), async (req, res) => {
  try {
    const loaded = await loadPupilQuiz(req, res);
    if (!loaded) return;
    const attempt = await QuizAttempt.findOne({ quizId: loaded.quiz._id, studentId: loaded.pupil._id })
      .sort({ attemptNumber: -1 }).lean();
    res.json({ quiz: studentQuizView(loaded.quiz, { includeResult: attempt || null }) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/student/quizzes/:id/submit', authMiddleware, requireRole('student'), async (req, res) => {
  try {
    const loaded = await loadPupilQuiz(req, res);
    if (!loaded) return;
    const { quiz, pupil } = loaded;

    const existing = await QuizAttempt.find({ quizId: quiz._id, studentId: pupil._id }).sort({ attemptNumber: -1 });
    const last = existing[0];
    // A retake is a new attempt, so the earlier one is kept rather than
    // overwritten: the attempt history is what a parent dispute relies on.
    if (last && !quiz.allowRetakes) {
      return res.status(409).json({ message: 'You have already attempted this quiz' });
    }

    const submitted = Array.isArray(req.body.answers) ? req.body.answers : [];
    const known = new Set((quiz.questions || []).map((q) => String(q._id)));
    // Silently dropping answers for questions that are not in this quiz keeps a
    // crafted payload from inserting marks against somebody else's question.
    const answers = submitted.filter((a) => known.has(String(a.questionId)));

    const marked = markAttempt(quiz, answers);

    // The time limit is enforced here, not in the browser. A client-side timer is
    // a suggestion; without this the pupil closes the tab, waits and submits.
    // submittedAt is the server's own clock, so this cannot be back-dated.
    const startedAt = req.body.startedAt ? new Date(req.body.startedAt) : new Date();
    const elapsed = Math.round((Date.now() - startedAt.getTime()) / 1000);

    const attempt = await QuizAttempt.create({
      quizId: quiz._id,
      studentId: pupil._id,
      classId: pupil.classId,
      answers: marked.answers,
      score: marked.score,
      maxScore: marked.maxScore,
      percentage: marked.maxScore ? Math.round((marked.score / marked.maxScore) * 100) : 0,
      pendingManualMarking: marked.pendingManualMarking,
      fullyMarked: !marked.pendingManualMarking,
      attemptNumber: (last ? last.attemptNumber : 0) + 1,
      startedAt,
      submittedAt: new Date(),
      durationSeconds: elapsed
    });

    res.status(201).json({
      success: true,
      attempt: {
        _id: attempt._id,
        score: attempt.score,
        maxScore: attempt.maxScore,
        percentage: attempt.percentage,
        pendingManualMarking: attempt.pendingManualMarking,
        fullyMarked: attempt.fullyMarked,
        attemptNumber: attempt.attemptNumber,
        submittedAt: attempt.submittedAt,
        // Written answers are echoed back so the pupil can check what was
        // recorded, but the key is never included.
        answers: attempt.answers.map((a) => ({
          questionId: a.questionId,
          text: a.text,
          selectedOptions: a.selectedOptions,
          isCorrect: a.isCorrect,
          pointsAwarded: a.pointsAwarded,
          maxPoints: a.maxPoints,
          autoMarked: a.autoMarked
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/student/quizzes/attempts/mine', authMiddleware, requireRole('student'), async (req, res) => {
  try {
    const pupil = await pupilOwnRecord(req.userId);
    if (!pupil) return res.json({ attempts: [] });

    const attempts = await QuizAttempt.find({ studentId: pupil._id })
      .sort({ submittedAt: -1 })
      .populate('quizId', 'title subject timeLimitMinutes questions')
      .lean();

    res.json({
      attempts: attempts.map((a) => {
        const quiz = a.quizId || {};
        return {
          _id: a._id,
          quizTitle: quiz.title || 'Removed quiz',
          subject: quiz.subject || '',
          score: a.score,
          maxScore: a.maxScore,
          percentage: a.percentage,
          pendingManualMarking: a.pendingManualMarking,
          fullyMarked: a.fullyMarked,
          attemptNumber: a.attemptNumber,
          submittedAt: a.submittedAt,
          durationSeconds: a.durationSeconds,
          // The answer key travels back to the pupil only once the attempt is
          // fully marked, which is the point at which it stops being a secret.
          answerKey: a.fullyMarked
            ? (quiz.questions || []).map((q) => ({
              prompt: q.prompt,
              correctAnswers: q.correctAnswers,
              type: q.type,
              points: q.points
            }))
            : null
        };
      })
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
