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

// Every class the caller belongs to. A pupil has exactly one; a parent may have
// children spread across forms, and is entitled to the notices for each of them,
// so the plural matters.
const callerClassIds = ({ classId, classIds } = {}) => {
  const list = [classId, ...(classIds || [])].filter(Boolean);
  return new Set(list.map((id) => String(id)));
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

// Who sees an announcement.
//
// Order matters. Class scoping is resolved first, because a class-scoped notice
// is addressed to a role token ('students') that every pupil in the school also
// carries: testing the audience before the class would hand every pupil in the
// school another form's notice. Only once the caller is known to be inside the
// scope do the role and grade rules apply.
const visibleToAudience = (announcement, caller = {}) => {
  const classes = audienceClassIds(announcement);
  const classScoped = classes.length > 0;
  if (classScoped && !classScopedToCaller(announcement, caller)) return false;

  const audience = normalizeAudience(announcement);
  if (isOpenToEveryone(audience)) return true;
  if (isStaffRole(caller.role)) return true;

  // A teacher who is inside the scope of a class-scoped notice has already
  // passed the class check, and the audience tokens describe that class's own
  // pupils and parents rather than the teacher who wrote it. Without this a
  // teacher would stop seeing their own class notices the moment class scoping
  // was introduced.
  if (classScoped && String(caller.role || '').toLowerCase() === 'teacher') return true;

  if (audienceMatchesRole(audience, caller.role)) return true;
  return audienceMatchesGrade(audience, caller.gradeLabel);
};

module.exports = {
  ROLES,
  normalizeAudience,
  isOpenToEveryone,
  audienceMatchesRole,
  audienceMatchesGrade,
  audienceClassIds,
  classScopedToCaller,
  callerClassIds,
  isStaffRole,
  visibleToAudience
};
