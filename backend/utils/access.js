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

module.exports = { authorizeStudentAccess };
