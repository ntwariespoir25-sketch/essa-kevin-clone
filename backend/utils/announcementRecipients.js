// Resolves who a notification for an announcement should go to.
//
// The rule it implements is deliberately simple: a person is notified exactly
// when they were actually addressed, which is the same predicate that decides
// whether the notice is visible to them minus staff oversight. Recomputing it
// from scratch here rather than trusting the audience array is what keeps the
// two from drifting apart - a class-scoped notice reaches that class's pupils
// and parents and nobody else, in the portal and in the inbox alike.

const User = require('../models/User');
const Student = require('../models/Student');
const Class = require('../models/Class');
const SubjectAllocation = require('../models/SubjectAllocation');
const ParentProfile = require('../models/ParentProfile');
const { addressedToAudience, targetedUserIds } = require('./announcementAudience');

// Every active account, each carrying the classes and year groups it belongs
// to. One pass over five collections instead of one query per user, which
// matters because this runs on every announcement.
const buildCallerContexts = async () => {
  const [users, pupils, profiles, classes, allocations] = await Promise.all([
    User.find({ isActive: true }).select('_id role').lean(),
    Student.find({}).select('userId classId').populate('classId', 'grade').lean(),
    ParentProfile.find({}).select('userId children').lean(),
    Class.find({}).select('_id teacherId grade').lean(),
    SubjectAllocation.find({}).select('teacherId classId').lean()
  ]);

  const classById = new Map(classes.map(c => [String(c._id), c]));
  const classOfStudent = new Map(pupils.map(p => [String(p._id), p.classId]));

  const contexts = new Map();
  const touch = (userId) => {
    const key = String(userId);
    if (!contexts.has(key)) contexts.set(key, { userId: key });
    return contexts.get(key);
  };

  for (const u of users) touch(u._id).role = u.role;

  const addClass = (userId, classRef) => {
    if (!userId || !classRef) return;
    const classId = classRef._id || classRef;
    const context = touch(userId);
    const id = String(classId);

    context.classIds = context.classIds || [];
    if (!context.classIds.includes(id)) context.classIds.push(id);

    const stored = classById.get(id);
    const grade = stored && stored.grade;
    if (grade) {
      context.grades = context.grades || [];
      if (!context.grades.includes(grade)) context.grades.push(grade);
      if (!context.gradeLabel) context.gradeLabel = grade;
    }
  };

  // Pupils.
  for (const p of pupils) addClass(p.userId, p.classId);

  // Parents inherit every class their children are in, and may have children
  // in more than one form or year, so the loop is not a lookup of one child.
  for (const profile of profiles) {
    for (const childId of profile.children || []) {
      addClass(profile.userId, classOfStudent.get(String(childId)));
    }
  }

  // Teachers: the forms they lead plus the ones they teach a subject in.
  for (const cls of classes) addClass(cls.teacherId, cls._id);
  for (const allocation of allocations) {
    const cls = classById.get(String(allocation.classId));
    addClass(allocation.teacherId, cls && cls._id);
  }

  return { users, contexts };
};

// Ordered so a named recipient can never be dropped by a cap applied earlier.
const resolveAnnouncementRecipients = async (announcement, { limit = 5000 } = {}) => {
  const { users, contexts } = await buildCallerContexts();
  const named = new Set(targetedUserIds(announcement));

  const recipients = [];
  for (const u of users) {
    const context = contexts.get(String(u._id)) || { userId: String(u._id), role: u.role };
    if (named.has(String(u._id)) || addressedToAudience(announcement, context)) {
      recipients.push(u._id);
      if (recipients.length >= limit) break;
    }
  }
  return recipients;
};

module.exports = { buildCallerContexts, resolveAnnouncementRecipients };
