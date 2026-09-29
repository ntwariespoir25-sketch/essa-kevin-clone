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

// Builds the filter that limits a bulk student listing to what the caller is
// entitled to see.
//
// /academic-admin/students previously had no role check at all, so any logged
// in account including a parent and a pupil could list every student in the
// school along with their class and code. Callers span four portals, so the
// scoping lives here rather than being repeated per route.
const studentScopeFilter = async (userId, userRole) => {
  // Staff who legitimately need the whole roll.
  if (['super_admin', 'academic_admin', 'accounts_admin', 'discipline_admin'].includes(userRole)) {
    return {};
  }

  if (userRole === 'teacher') {
    const [ownClasses, allocations] = await Promise.all([
      Class.find({ teacherId: userId }).distinct('_id'),
      SubjectAllocation.find({ teacherId: userId }).distinct('classId')
    ]);
    const ids = [...new Set([...ownClasses, ...allocations].map(String))];
    // An empty $in would match nothing, which is the correct outcome: a
    // teacher assigned no classes must not see the school roll.
    return { classId: { $in: ids.length ? ids.map(id => new mongoose.Types.ObjectId(id)) : [] } };
  }

  if (userRole === 'student') {
    const own = await Student.findOne({ userId }).select('_id');
    return own ? { _id: own._id } : { _id: { $in: [] } };
  }

  if (userRole === 'parent') {
    const profile = await ParentProfile.findOne({ userId }).select('children');
    return { _id: { $in: (profile && profile.children) || [] } };
  }

  // Unknown role: show nothing rather than everything.
  return { _id: { $in: [] } };
};

module.exports = { authorizeStudentAccess, teacherOwnsClass, studentScopeFilter };
