const mongoose = require('mongoose');

// The full set of states an application can be in. Kept as a constant as well as
// an enum because the API validates against this list before writing: a bare
// findByIdAndUpdate skips schema validators unless told otherwise, which had
// left the door open for any string to be stored as a status.
const APPLICATION_STATUSES = ['pending', 'reviewing', 'shortlisted', 'accepted', 'rejected', 'waitlisted'];

// One rubric line. Scored out of 10 rather than 100 so the reviewer is grading on
// a scale they can hold in their head, and the four are averaged into a
// percentage at the end rather than summed, so a strong character score cannot
// outvote a weak academic one without saying so.
const rubricItemSchema = new mongoose.Schema({
  score: { type: Number, min: 0, max: 10, default: null },
  comment: { type: String, default: '', maxlength: 500 }
}, { _id: false });

const rubricSchema = new mongoose.Schema({
  academic: { type: rubricItemSchema, default: () => ({}) },
  exam: { type: rubricItemSchema, default: () => ({}) },
  character: { type: rubricItemSchema, default: () => ({}) },
  talent: { type: rubricItemSchema, default: () => ({}) },
  scoredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  scoredAt: Date
}, { _id: false });

// What happened, by whom, and when. This is the only way to answer "who moved
// this to shortlist and when", because reviewedBy on the application itself
// records the latest decision and overwrites the one before it.
const activityEntrySchema = new mongoose.Schema({
  action: { type: String, required: true },
  from: String,
  to: String,
  detail: String,
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  at: { type: Date, default: Date.now }
}, { _id: false });

const admissionApplicationSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  dateOfBirth: { type: Date, required: true },
  nationality: { type: String, default: 'Rwandan' },
  nationalId: { type: String, default: '' },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  level: { type: String, required: true },
  previousSchool: { type: String, required: true },
  lastAverage: { type: Number, required: true },
  achievements: { type: String, default: '' },
  parentName: { type: String, required: true },
  parentPhone: { type: String, required: true },
  parentEmail: { type: String, default: '' },
  parentOccupation: { type: String, default: '' },
  applyScholarship: { type: Boolean, default: false },
  reportCardUrl: { type: String, default: '' },
  birthCertUrl: { type: String, default: '' },
  studentPhotoUrl: { type: String, default: '' },
  // Permanent and quoted by applicants, so it is never reassigned. Older rows
  // carry the original APP- prefix and are left as they are.
  applicationNumber: { type: String, unique: true },
  status: {
    type: String,
    enum: APPLICATION_STATUSES,
    default: 'pending'
  },
  rubric: { type: rubricSchema, default: () => ({}) },
  // The internal decision note. Deliberately not shown to the applicant.
  reviewNotes: { type: String, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  activity: { type: [activityEntrySchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

admissionApplicationSchema.index({ status: 1, createdAt: -1 });
admissionApplicationSchema.index({ level: 1 });

// Highest ESSA- sequence issued so far, plus one. Derived from the stored
// numbers rather than a count, because the count is not the sequence once the
// APP- rows are in the table, and because a deleted application would otherwise
// hand the same number out twice.
const nextApplicationNumber = async () => {
  const prefix = `ESSA-${new Date().getFullYear()}-`;
  const last = await mongoose.model('AdmissionApplication')
    .findOne({ applicationNumber: { $regex: `^${prefix}` } })
    .sort({ applicationNumber: -1 })
    .select('applicationNumber')
    .lean();
  const seq = last ? parseInt(String(last.applicationNumber).slice(prefix.length), 10) + 1 : 1;
  return prefix + String(seq).padStart(4, '0');
};

admissionApplicationSchema.pre('validate', async function (next) {
  if (!this.applicationNumber) {
    try {
      this.applicationNumber = await nextApplicationNumber();
    } catch (error) {
      return next(error);
    }
  }
  next();
});

module.exports = mongoose.model('AdmissionApplication', admissionApplicationSchema);
module.exports.APPLICATION_STATUSES = APPLICATION_STATUSES;
module.exports.RUBRIC_CRITERIA = ['academic', 'exam', 'character', 'talent'];