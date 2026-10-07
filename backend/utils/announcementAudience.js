// One definition of "who is this announcement for".
//
// The same question was being answered in three places that disagreed. A
// parents-only announcement was returned to every unauthenticated visitor of
// GET /announcements, and simultaneously withheld from every actual parent,
// because the parent filter only ever looked for 'all' and a grade name. So the
// private notice reached the public and not its intended readers.

const ROLES = {
  super_admin:      ['super_admin', 'admins', 'staff'],
  academic_admin:   ['academic_admin', 'admins', 'staff'],
  discipline_admin: ['discipline_admin', 'admins', 'staff'],
  accounts_admin:   ['accounts_admin', 'admins', 'staff'],
  teacher:          ['teacher', 'teachers', 'staff'],
  student:          ['student', 'students', 'pupils'],
  parent:           ['parent', 'parents', 'guardians']
};

const normalizeAudience = (announcement) => {
  const raw = announcement && announcement.audience;
  const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  return list.map((a) => String(a).trim().toLowerCase()).filter(Boolean);
};

const isOpenToEveryone = (audience) =>
  audience.length === 0 || audience.includes('all') || audience.includes('everyone');

const audienceMatchesRole = (audience, role) => {
  if (isOpenToEveryone(audience)) return true;
  const keys = ROLES[String(role || '').toLowerCase()] || [String(role || '').toLowerCase()];
  return audience.some((a) => keys.includes(a));
};

const isStaffRole = (role) =>
  ['super_admin', 'academic_admin', 'discipline_admin', 'accounts_admin'].includes(String(role || '').toLowerCase());

// Announcements can be addressed to a year group ("S3") as well as a role, and
// the stored value is free text, so match on the grade as a substring. This is
// deliberately forgiving about formatting and strict about scope: a grade tag
// only ever widens to that grade.
const audienceMatchesGrade = (audience, gradeLabel) => {
  const grade = String(gradeLabel || '').trim().toLowerCase();
  if (!grade) return false;
  return audience.some((a) => a !== 'all' && a.includes(grade));
};

// The classes an announcement is restricted to. Empty means "not class scoped",
// in which case the role and grade rules below decide.
const audienceClassIds = (announcement) => {
  const raw = (announcement && announcement.classIds) || [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter(Boolean).map((id) => String(id));
};

// Year groups an announcement is restricted to, normalised for comparison.
const normGrade = (g) => String(g || '').trim().toLowerCase().replace(/\s+/g, ' ');

const audienceGrades = (announcement) => {
  const raw = (announcement && announcement.grades) || [];
  const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  return list.map(normGrade).filter(Boolean);
};

// People addressed by name. These always receive the notice: naming an
// individual is the one targeting mode that cannot be satisfied by any role
// or year-group token, so it is resolved before every other rule.
const targetedUserIds = (announcement) => {
  const raw = (announcement && announcement.userIds) || [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter(Boolean).map((id) => String(id));
};

// Every class the caller belongs to. A pupil has exactly one; a parent may have
// children spread across forms, and is entitled to the notices for each of them,
// so the plural matters.
const callerClassIds = ({ classId, classIds } = {}) => {
  const list = [classId, ...(classIds || [])].filter(Boolean);
  return new Set(list.map((id) => String(id)));
};

// Every year group the caller belongs to. A parent with children in two years
// belongs to both, so this is a list and not a single label.
const callerGrades = (caller = {}) => {
  const list = [caller.gradeLabel, ...(caller.grades || [])].filter(Boolean);
  return [...new Set(list.map(normGrade).filter(Boolean))];
};

// Comparison stays deliberately forgiving about formatting: an author may type
// "S3" or "S3 B" or "primary 4", and the stored caller grade comes from the
// Class document, so exact string equality alone would miss real matches in
// either direction. The match never widens past the characters involved.
const gradeMatchesCaller = (grades, caller = {}) => {
  if (!grades.length) return false;
  const mine = callerGrades(caller);
  if (!mine.length) return false;
  return grades.some((g) => mine.some((m) => m === g || m.includes(g) || g.includes(m)));
};

// A pupil or a parent only ever sees a class-scoped notice for a class they are
// actually enrolled in. This check runs before the role and grade checks, because
// a teacher's notice to "S3 B" is addressed to the role 'students' as well: role
// matching alone would hand every pupil in the school someone else's homework
// reminder.
const classScopedToCaller = (announcement, caller = {}) => {
  const classes = audienceClassIds(announcement);
  if (!classes.length) return true;
  const mine = callerClassIds(caller);
  if (!mine.size) return false;
  return classes.some((id) => mine.has(id));
};

// Who the notice was written to.
//
// Deliberately separate from `visibleToAudience`. Staff can see every notice
// for oversight purposes, but "can see" is not "was addressed": a teacher's
// homework reminder for S3 B should not push a notification onto every
// administrator just because their portal shows it. Notification fan-out uses
// this function; portal visibility uses the one below.
//
// Order matters:
//   1. a named recipient always receives it - naming a person is the only mode
//      no role or year token can stand in for;
//   2. class scope, which runs for whole-school-shaped notices too, because an
//      admin notice addressed to a single form has to be restricted to that
//      form whether or not its role token happens to say "all";
//   3. year group scope, before the "open to everyone" shortcut, because "S3"
//      with an audience of everyone must still mean S3;
//   4. role tokens, then the older free-text grade matching.
const addressedToAudience = (announcement, caller = {}) => {
  const audience = normalizeAudience(announcement);
  const classes = audienceClassIds(announcement);
  const grades = audienceGrades(announcement);

  if (caller.userId && targetedUserIds(announcement).includes(String(caller.userId))) return true;

  if (classes.length && !classScopedToCaller(announcement, caller)) return false;
  if (grades.length && !gradeMatchesCaller(grades, caller)) return false;

  if (isOpenToEveryone(audience)) return true;

  // A teacher who is inside the scope of their own class notice passes the
  // class check without matching a role token, because a class notice is
  // addressed to that class's pupils and parents rather than to its author.
  if (classes.length && String(caller.role || '').toLowerCase() === 'teacher') return true;

  if (audienceMatchesRole(audience, caller.role)) return true;
  return audienceMatchesGrade(audience, caller.gradeLabel);
};

// Who sees an announcement in the portal: everything above plus staff
// oversight, checked first. Admins have no class or year of their own, so
// testing either before this shortcut silently hid every scoped notice from
// them - the opposite of the oversight they exist to provide.
const visibleToAudience = (announcement, caller = {}) => {
  if (isStaffRole(caller.role)) return true;
  return addressedToAudience(announcement, caller);
};

module.exports = {
  ROLES,
  normalizeAudience,
  isOpenToEveryone,
  audienceMatchesRole,
  audienceMatchesGrade,
  audienceClassIds,
  audienceGrades,
  targetedUserIds,
  gradeMatchesCaller,
  classScopedToCaller,
  callerClassIds,
  callerGrades,
  normGrade,
  isStaffRole,
  addressedToAudience,
  visibleToAudience
};
