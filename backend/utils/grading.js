// Shared weighted-average logic for grades.
//
// Grading maths lives here rather than in any single route because the teacher
// gradebook and the report card must never disagree: a teacher who sees 72% in
// the gradebook has to see 72% on the report card, or the marks become
// indefensible at a parents' meeting.
//
// Two subtleties that a naive sum/sum of raw scores gets wrong:
//
//  1. Raw scores are not comparable across assessments. A 8/10 quiz and an
//     80/100 final are both 80%, but averaging them as 8 and 80 collapses the
//     quiz's contribution to nothing. Every score is normalised to a percentage
//     against its own assessment's maxScore before averaging.
//  2. Weighting is resolved per assessment, not per type. Assessments are
//     looked up by their own id first so two different Final papers can carry
//     different weights; the type is only a fallback for legacy grade rows that
//     predate the assessmentId field.

const DEFAULT_MAX_SCORE = 100;

// Builds the lookup used to weight a set of grades.
// Accepts either an array of Exam documents or a lean projection with the
// fields below, so callers can pre-select and avoid pulling instructions text.
const buildWeightIndex = (exams = []) => {
  const byId = new Map();
  const byType = new Map();

  exams.forEach(exam => {
    const entry = {
      weight: Number(exam.weight) || 0,
      maxScore: Number(exam.maxScore) || DEFAULT_MAX_SCORE,
      type: exam.type || 'Other',
      name: exam.name
    };
    if (exam._id) byId.set(String(exam._id), entry);
    // First exam of a type wins, matching the previous report-card behaviour
    // when a term contains several papers of the same type.
    if (!byType.has(entry.type)) byType.set(entry.type, entry);
  });

  return { byId, byType, hasWeights: [...byId.values()].some(e => e.weight > 0) };
};

// Resolves how a single grade row should be scored and weighted.
const resolveGrade = (grade, index) => {
  const matched = (grade.assessmentId && index.byId.get(String(grade.assessmentId)))
    || index.byType.get(grade.assessmentType || 'Other')
    || null;

  const maxScore = matched ? matched.maxScore : DEFAULT_MAX_SCORE;
  const raw = Number(grade.score);
  const score = Number.isFinite(raw) ? raw : 0;

  // Guard against a zero or negative maxScore, which would otherwise produce
  // Infinity or NaN and silently poison the whole class average.
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;

  return {
    percentage,
    weight: matched ? matched.weight : 0,
    weightKnown: !!matched
  };
};

// Computes the term average for one student across a set of grade rows.
//
// Returns the weighted average when the term has weighted assessments, and a
// plain mean of percentages otherwise, so a term with no weights configured
// still produces a number rather than a division by zero.
const averageFor = (grades = [], index) => {
  const rows = grades.map(g => resolveGrade(g, index)).filter(r => Number.isFinite(r.percentage));
  if (rows.length === 0) return { average: null, count: 0, graded: 0, weightTotal: 0 };

  if (index.hasWeights) {
    // Only weighted rows count toward the total, otherwise an unweighted
    // assessment would drag the average down purely by existing.
    const weighted = rows.filter(r => r.weight > 0);
    if (weighted.length > 0) {
      const weightTotal = weighted.reduce((sum, r) => sum + r.weight, 0);
      const weightedSum = weighted.reduce((sum, r) => sum + r.percentage * r.weight, 0);
      return {
        average: Math.round(weightedSum / weightTotal),
        count: rows.length,
        graded: weighted.length,
        weightTotal
      };
    }
  }

  const plainSum = rows.reduce((sum, r) => sum + r.percentage, 0);
  return {
    average: Math.round(plainSum / rows.length),
    count: rows.length,
    graded: rows.length,
    weightTotal: 0
  };
};

// Maps a percentage to the letter grade used on report cards.
// Deliberately identical to the previous inline scale, including using F below
// 50 rather than E, because report cards are already issued on that basis.
// GRADE_POINTS still carries a dead E: 1 entry; changing the scale would
// retroactively alter every published report card and its GPA.
const letterFor = (percentage) => {
  if (percentage === null || percentage === undefined) return '-';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B';
  if (percentage >= 60) return 'C';
  if (percentage >= 50) return 'D';
  return 'F';
};

module.exports = { buildWeightIndex, averageFor, resolveGrade, letterFor, DEFAULT_MAX_SCORE };
