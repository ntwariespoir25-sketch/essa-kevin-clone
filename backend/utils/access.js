const mongoose = require('mongoose');
const Student = require('../models/Student');
const Class = require('../models/Class');
const SubjectAllocation = require('../models/SubjectAllocation');
const ParentProfile = require('../models/ParentProfile');

// A single student's results are personal data, so read access has to follow
// the relationship rather than mere authentication. Otherwise any logged-in
// account — including a parent of a different child — could read any record
// by guessing an id.
const authorizeStudentAccess = async (req, student) => {
  const { userId, userRole } = req;

  if (userRole === 'super_admin' || userRole === 'academic_admin') return true;

  if (userRole === 'student') {
    const own = await Student.findOne({ userId }).select('_id');
    return !!own && String(own._id) === String(student._id);
  }

  if (userRole === 'parent') {
    return !!(await ParentProfile.exists({ userId, children: student._id }));
  }

  if (userRole === 'teacher') {
    if (student.teacherId && String(student.teacherId) === String(userId)) return true;
    if (!student.classId) return false;
    const [classItem, allocation] = await Promise.all([
      Class.findById(student.classId).select('teacherId'),
      SubjectAllocation.exists({ classId: student.classId, teacherId: userId })
    ]);
    return (
      (classItem?.teacherId && String(classItem.teacherId) === String(userId)) ||
      !!allocation
    );
  }

  return false;
};

// Confirms a teacher is responsible for a class, either as its class teacher or
// through a subject allocation. Used by the class-wide endpoints (attendance
// registers, exam mark entry) where there is no single student to authorise
// against, so authorizeStudentAccess cannot help.
const teacherOwnsClass = async (userId, classId) => {
  if (!classId) return false;
  const [classItem, allocation] = await Promise.all([
    Class.findById(classId).select('teacherId'),
    SubjectAllocation.exists({ classId, teacherId: userId })
  ]);
  return (
    (classItem?.teacherId && String(classItem.teacherId) === String(userId)) ||
    !!allocation
  );
};

// Roles that oversee the whole school rather than a slice of it. Kept in one
// place because the student and class scopes and several route guards all need
// the same definition of "staff".
const STAFF_ROLES = ['super_admin', 'academic_admin', 'accounts_admin', 'discipline_admin'];
const isStaff = (role) => STAFF_ROLES.includes(role);

// The class ids a caller is entitled to see: the classes they teach, or the
// classes their children or their own record are enrolled in. Staff roles get
// null, meaning "no restriction", which the callers turn into an empty filter.
const allowedClassIds = async (userId, userRole) => {
  if (isStaff(userRole)) {
    return null;
  }

  if (userRole === 'teacher') {
    const [ownClasses, allocations] = await Promise.all([
      Class.find({ teacherId: userId }).distinct('_id'),
      SubjectAllocation.find({ teacherId: userId }).distinct('classId')
    ]);
    return [...new Set([...ownClasses, ...allocations].map(id => new mongoose.Types.ObjectId(String(id))))];
  }

  if (userRole === 'student') {
    const own = await Student.findOne({ userId }).select('classId');
    return own && own.classId ? [own.classId] : [];
  }

  if (userRole === 'parent') {
    const profile = await ParentProfile.findOne({ userId }).select('children');
    if (!profile || !profile.children || !profile.children.length) return [];
    return Student.find({ _id: { $in: profile.children } }).distinct('classId');
  }

  // Unknown role: no access rather than everything.
  return [];
};

// Builds the filter that limits a bulk student listing to what the caller is
// entitled to see.
//
// /academic-admin/students previously had no role check at all, so any logged
// in account including a parent and a pupil could list every student in the
// school along with their class and code. Callers span four portals, so the
// scoping lives here rather than being repeated per route.
const studentScopeFilter = async (userId, userRole) => {
  if (userRole === 'student') {
    const own = await Student.findOne({ userId }).select('_id');
    return own ? { _id: own._id } : { _id: { $in: [] } };
  }

  if (userRole === 'parent') {
    const profile = await ParentProfile.findOne({ userId }).select('children');
    return { _id: { $in: (profile && profile.children) || [] } };
  }

  const ids = await allowedClassIds(userId, userRole);
  if (ids === null) return {};                       // unrestricted staff
  if (userRole !== 'teacher') return { _id: { $in: [] } };
  // An empty $in matches nothing, which is correct: a teacher assigned no
  // classes must not fall back to seeing the school roll.
  return { classId: { $in: ids } };
};

// The same treatment for the class list, which was previously returned to any
// logged-in account. A parent or pupil could read the whole school structure
// and the assigned teacher's name, and the teacher portals used the response
// to build their class pickers, so they also listed classes the teacher does
// not own.
const classScopeFilter = async (userId, userRole) => {
  const ids = await allowedClassIds(userId, userRole);
  return ids === null ? {} : { _id: { $in: ids } };
};

// The set of people a caller is allowed to start a conversation with, plus
// whether their email may be included.
//
// /messages/users previously returned every active account - full name, email
// and role - to anybody who was merely signed in. That let a parent read the
// name and email of every pupil in the school, and a pupil read every parent,
// which is not something either role needs in order to message their own
// teacher. Staff still see everyone, because oversight is their job.
const messagingDirectory = async (userId, userRole) => {
  const base = { isActive: true, _id: { $ne: userId } };

  if (isStaff(userRole)) {
    return { includeEmail: true, filter: base };
  }

  // Everyone in a leadership role stays reachable from any portal, so a
  // student or parent can always escalate.
  const leadership = { role: { $in: STAFF_ROLES } };

  if (userRole === 'teacher') {
    const ids = await allowedClassIds(userId, userRole);
    return {
      includeEmail: false,
      filter: {
        ...base,
        $or: [
          leadership,
          { role: 'teacher' },
          { role: 'student', classId: { $in: ids } }
        ]
      }
    };
  }

  if (userRole === 'parent') {
    const profile = await ParentProfile.findOne({ userId }).select('children');
    const children = (profile && profile.children) || [];
    const coParents = children.length
      ? await ParentProfile.find({ children: { $in: children } }).distinct('userId')
      : [];
    return {
      includeEmail: false,
      filter: {
        ...base,
        $or: [
          leadership,
          // Every teacher stays reachable. Staff names are not private, and a
          // parent must be able to ask any of them about their child even when
          // no class teacher has been assigned yet.
          { role: 'teacher' },
          { _id: { $in: coParents } }
        ]
      }
    };
  }

  if (userRole === 'student') {
    const own = await Student.findOne({ userId }).select('classId');
    const classIds = own && own.classId ? [own.classId] : [];
    const classmates = classIds.length
      ? await Student.find({ classId: { $in: classIds } }).distinct('userId')
      : [];
    return {
      includeEmail: false,
      filter: {
        ...base,
        $or: [
          leadership,
          { role: 'teacher' },
          { _id: { $in: classmates } }
        ]
      }
    };
  }

  // Unknown role gets leadership only rather than the whole school.
  return { includeEmail: false, filter: { ...base, ...leadership } };
};

module.exports = {
  authorizeStudentAccess,
  teacherOwnsClass,
  studentScopeFilter,
  classScopeFilter,
  allowedClassIds,
  messagingDirectory,
  STAFF_ROLES,
  isStaff
};
