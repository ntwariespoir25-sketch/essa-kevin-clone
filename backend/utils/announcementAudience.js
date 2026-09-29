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

// A pupil or a parent sees an announcement addressed to their role, to the
// whole school, or to their year group.
const visibleToAudience = (announcement, { role, gradeLabel } = {}) => {
  const audience = normalizeAudience(announcement);
  if (isOpenToEveryone(audience)) return true;
  if (isStaffRole(role)) return true;
  if (audienceMatchesRole(audience, role)) return true;
  return audienceMatchesGrade(audience, gradeLabel);
};

module.exports = {
  ROLES,
  normalizeAudience,
  isOpenToEveryone,
  audienceMatchesRole,
  audienceMatchesGrade,
  isStaffRole,
  visibleToAudience
};
