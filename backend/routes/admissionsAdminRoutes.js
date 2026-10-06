const express = require('express');
const mongoose = require('mongoose');
const AdmissionApplication = require('../models/AdmissionApplication');
const { sendAdmissionDecisionEmail } = require('../utils/emailService');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleCheck');

const router = express.Router();
const { APPLICATION_STATUSES, RUBRIC_CRITERIA } = AdmissionApplication;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ADMIN_ONLY = [authMiddleware, requireRole('academic_admin', 'super_admin')];

// Fields the table and drawer need that live on the referenced User.
// The User schema names its display field fullName, not name.
const POPULATE = [
  { path: 'reviewedBy', select: 'fullName email' },
  { path: 'rubric.scoredBy', select: 'fullName email' }
];

// Reads a status value from a request body and confirms it is one we actually
// support. findByIdAndUpdate does not run the enum unless told to, so without
// this an arbitrary string could be written straight into the field.
const readStatus = (value) => {
  const status = String(value || '').trim();
  if (!APPLICATION_STATUSES.includes(status)) return null;
  return status;
};

// Builds the Mongo filter shared by the list endpoint and the per-status counts,
// so the chips can never disagree with the rows underneath them.
const buildFilter = (query) => {
  const filter = {};
  const q = String(query.q || '').trim();
  if (q) {
    const safe = escapeRegex(q);
    filter.$or = [
      { fullName: new RegExp(safe, 'i') },
      { email: new RegExp(safe, 'i') },
      { applicationNumber: new RegExp(safe, 'i') },
      { phone: new RegExp(safe, 'i') }
    ];
  }

  const statuses = String(query.status || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => APPLICATION_STATUSES.includes(s));
  if (statuses.length === 1) filter.status = statuses[0];
  else if (statuses.length > 1) filter.status = { $in: statuses };

  const levels = String(query.level || '')
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);
  if (levels.length === 1) filter.level = levels[0];
  else if (levels.length > 1) filter.level = { $in: levels };

  const created = {};
  const from = new Date(query.from || '');
  if (!Number.isNaN(from.getTime())) created.$gte = from;
  const to = new Date(query.to || '');
  if (!Number.isNaN(to.getTime())) {
    // Date inputs give a day; take the whole of it.
    to.setHours(23, 59, 59, 999);
    created.$lte = to;
  }
  if (created.$gte || created.$lte) filter.createdAt = created;

  return filter;
};

const SORTABLE = {
  applied: 'createdAt',
  applicant: 'fullName',
  level: 'level',
  average: 'lastAverage',
  status: 'status'
};

const esc = (value) =>
  String(value == null ? '' : value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

// ─── list, filter, paginate ───────────────────────────────────────────────────
router.get('/applications', ...ADMIN_ONLY, async (req, res) => {
  try {
    const filter = buildFilter(req.query);

    // Counts answer "how many would I get if I clicked this chip", so they honour
    // the search and level and date filters but not the status filter itself.
    const countFilter = { ...filter };
    delete countFilter.status;
    const [total, grouped, allCount, levels] = await Promise.all([
      AdmissionApplication.countDocuments(filter),
      AdmissionApplication.aggregate([
        { $match: countFilter },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      AdmissionApplication.countDocuments(countFilter),
      AdmissionApplication.distinct('level')
    ]);

    const counts = { all: allCount };
    for (const status of APPLICATION_STATUSES) counts[status] = 0;
    for (const row of grouped) counts[row._id] = row.count;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const requested = parseInt(req.query.limit, 10) || 10;
    const limit = [10, 20, 50, 100].includes(requested) ? requested : 10;
    const pages = Math.max(1, Math.ceil(total / limit));
    const current = Math.min(page, pages);

    const sortField = SORTABLE[req.query.sort] || 'createdAt';
    const direction = String(req.query.dir).toLowerCase() === 'asc' ? 1 : -1;

    const applications = await AdmissionApplication.find(filter)
      .sort({ [sortField]: direction, _id: -1 })
      .skip((current - 1) * limit)
      .limit(limit)
      .populate(POPULATE)
      .lean();

    res.json({
      applications,
      total,
      page: current,
      pages,
      limit,
      counts,
      levels: levels.filter(Boolean).sort()
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── recent activity across all applications ──────────────────────────────────
// Declared before /:id routes so "activity" is never read as an id.
router.get('/applications/activity', ...ADMIN_ONLY, async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const recent = await AdmissionApplication.find({ 'activity.0': { $exists: true } })
      .sort({ 'activity.at': -1 })
      .select('fullName applicationNumber activity')
      .lean();

    // Mongo cannot sort an array of embedded subdocuments by a field inside the
    // array, so flatten across applications and sort here.
    const entries = recent
      .flatMap((app) =>
        app.activity.map((item) => ({
          applicationId: app._id,
          fullName: app.fullName,
          applicationNumber: app.applicationNumber,
          ...item
        }))
      )
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, limit);

    const withActors = await Promise.all(
      entries.map(async (entry) => {
        // A public submission has no actor attached, so the feed still needs a
        // label rather than an empty line.
        if (!entry.actor) return { ...entry, actorName: 'Applicant' };
        const User = mongoose.model('User');
        const actor = await User.findById(entry.actor).select('fullName').lean();
        return { ...entry, actorName: actor?.fullName || 'Unknown' };
      })
    );

    res.json({ activity: withActors });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── bulk status change ───────────────────────────────────────────────────────
router.put('/applications/bulk-status', ...ADMIN_ONLY, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const status = readStatus(req.body.status);
    if (!ids.length) return res.status(400).json({ message: 'Select at least one application.' });
    if (!status) return res.status(400).json({ message: 'Unknown status.' });

    const note = String(req.body.reviewNotes || '').trim();
    const updated = [];
    const skipped = [];

    // Sequential rather than bulkWrite: each write has to append an activity
    // entry naming the status it came from, which differs per application.
    for (const id of ids) {
      const current = await AdmissionApplication.findById(id);
      if (!current) {
        skipped.push(id);
        continue;
      }
      if (current.status === status) {
        skipped.push(id);
        continue;
      }
      const from = current.status;
      current.status = status;
      current.reviewedBy = req.userId;
      current.reviewedAt = new Date();
      if (note) current.reviewNotes = note;
      current.activity.push({
        action: 'status_changed',
        from,
        to: status,
        detail: note || 'Bulk update',
        actor: req.userId,
        at: new Date()
      });
      await current.save();
      updated.push(id);
    }

    if (req.body.notify) {
      const changed = await AdmissionApplication.find({ _id: { $in: updated } });
      for (const app of changed) {
        try {
          await sendAdmissionDecisionEmail(app);
        } catch (error) {
          console.error(`Decision email failed for ${app.applicationNumber}: ${error.message}`);
        }
      }
    }

    res.json({ updated: updated.length, skipped: skipped.length, notified: !!req.body.notify });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── save rubric scores ───────────────────────────────────────────────────────
router.put('/applications/:id/score', ...ADMIN_ONLY, async (req, res) => {
  try {
    const application = await AdmissionApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ message: 'Application not found.' });

    const rubric = {};
    const rejected = [];
    for (const criterion of RUBRIC_CRITERIA) {
      const incoming = req.body.rubric?.[criterion];
      if (incoming == null) {
        rubric[criterion] = application.rubric?.[criterion]?.toObject?.() ?? {};
        continue;
      }
      const score = incoming.score === null || incoming.score === '' ? null : Number(incoming.score);
      if (score !== null && (Number.isNaN(score) || score < 0 || score > 10)) {
        rejected.push(criterion);
        continue;
      }
      rubric[criterion] = {
        score,
        comment: String(incoming.comment || '').slice(0, 500)
      };
    }

    if (rejected.length) {
      return res.status(400).json({ message: `Scores must be between 0 and 10: ${rejected.join(', ')}` });
    }

    application.rubric = rubric;
    application.rubric.scoredBy = req.userId;
    application.rubric.scoredAt = new Date();
    application.activity.push({
      action: 'scored',
      detail: 'Review scores updated',
      actor: req.userId,
      at: new Date()
    });
    await application.save();

    await application.populate(POPULATE);
    res.json({ application });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── record a decision ────────────────────────────────────────────────────────
router.put('/applications/:id/status', ...ADMIN_ONLY, async (req, res) => {
  try {
    const status = readStatus(req.body.status);
    if (!status) return res.status(400).json({ message: 'Unknown status.' });

    const application = await AdmissionApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ message: 'Application not found.' });

    const from = application.status;
    const note = String(req.body.reviewNotes || '').trim();

    application.status = status;
    application.reviewedBy = req.userId;
    application.reviewedAt = new Date();
    // An empty note means "unchanged": clearing the reason behind a decision by
    // accident on an unrelated edit would be worse than not clearing it.
    if (note) application.reviewNotes = note;

    application.activity.push({
      action: 'status_changed',
      from,
      to: status,
      detail: note || application.reviewNotes || '',
      actor: req.userId,
      at: new Date()
    });
    await application.save();

    let notified = false;
    if (req.body.notify) {
      try {
        await sendAdmissionDecisionEmail(application);
        notified = true;
      } catch (error) {
        // The decision stands even if the mail bounces; only report the failure.
        console.error(`Decision email failed for ${application.applicationNumber}: ${error.message}`);
      }
    }

    await application.populate(POPULATE);
    res.json({ application, notified });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ─── printable application record ─────────────────────────────────────────────
router.get('/applications/:id/print', ...ADMIN_ONLY, async (req, res) => {
  try {
    const application = await AdmissionApplication.findById(req.params.id).populate(POPULATE);
    if (!application) return res.status(404).send('Application not found.');

    const score = (key) => {
      const value = application.rubric?.[key]?.score;
      return value == null ? '—' : `${value}/10`;
    };
    const total = RUBRIC_CRITERIA.reduce((sum, key) => {
      const value = application.rubric?.[key]?.score;
      return sum + (typeof value === 'number' ? value : 0);
    }, 0);
    const scoredCount = RUBRIC_CRITERIA.filter((k) => typeof application.rubric?.[k]?.score === 'number').length;
    const rubricTotal = scoredCount ? `${Math.round((total / scoredCount) * 10)}%` : 'Not scored';

    const rows = [
      ['Application number', application.applicationNumber],
      ['Full name', application.fullName],
      ['Status', application.status],
      ['Date of birth', application.dateOfBirth ? new Date(application.dateOfBirth).toDateString() : '—'],
      ['Nationality', application.nationality],
      ['National ID', application.nationalId],
      ['Email', application.email],
      ['Phone', application.phone],
      ['Address', application.address],
      ['Level applied for', application.level],
      ['Previous school', application.previousSchool],
      ['Previous average', `${application.lastAverage}%`],
      ['Achievements', application.achievements || '—'],
      ['Scholarship requested', application.applyScholarship ? 'Yes' : 'No'],
      ['Parent / guardian', application.parentName],
      ['Parent phone', application.parentPhone],
      ['Parent email', application.parentEmail || '—'],
      ['Parent occupation', application.parentOccupation || '—']
    ];

    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${esc(application.applicationNumber)}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1f2933;margin:0;padding:32px;line-height:1.5}
  header{background:linear-gradient(135deg,#1a3a5c,#2c5f8a);color:#fff;padding:24px 28px;border-radius:12px;margin-bottom:24px}
  header h1{margin:0 0 4px;font-size:22px} header p{margin:0;opacity:.85;font-size:13px}
  h2{font-size:15px;text-transform:uppercase;letter-spacing:.8px;color:#1a3a5c;border-bottom:2px solid #e5e7eb;padding-bottom:6px;margin:26px 0 12px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{padding:8px 10px;border-bottom:1px solid #eef1f5;vertical-align:top}
  td:first-child{width:210px;color:#52606d;font-weight:600}
  .note{background:#fff8e6;border-left:4px solid #f0b429;padding:12px 16px;font-size:13px;margin-top:8px}
  footer{margin-top:28px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:11px;color:#7b8794}
  @media print{body{padding:0}header{border-radius:0}}
</style></head><body>
<header>
  <h1>ESSA Nyarugunga - Admission Application</h1>
  <p>${esc(application.applicationNumber)} &middot; ${esc(application.level)}</p>
</header>

<h2>Applicant details</h2>
<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>

<h2>Documents on file</h2>
<table>
  <tr><td>Report card</td><td>${application.reportCardUrl ? 'Uploaded' : 'Not uploaded'}</td></tr>
  <tr><td>Birth certificate</td><td>${application.birthCertUrl ? 'Uploaded' : 'Not uploaded'}</td></tr>
  <tr><td>Student photo</td><td>${application.studentPhotoUrl ? 'Uploaded' : 'Not uploaded'}</td></tr>
</table>

<h2>Review scores</h2>
<table>
  <tr><td>Academic</td><td>${score('academic')}</td></tr>
  <tr><td>Exam</td><td>${score('exam')}</td></tr>
  <tr><td>Character</td><td>${score('character')}</td></tr>
  <tr><td>Talent</td><td>${score('talent')}</td></tr>
  <tr><td>Overall</td><td>${rubricTotal}</td></tr>
</table>

<h2>Decision</h2>
<table>
  <tr><td>Status</td><td>${esc(application.status)}</td></tr>
  <tr><td>Internal note</td><td>${esc(application.reviewNotes || 'None recorded')}</td></tr>
  <tr><td>Decided by</td><td>${esc(application.reviewedBy?.fullName || 'Not yet reviewed')}</td></tr>
  <tr><td>Decided on</td><td>${application.reviewedAt ? new Date(application.reviewedAt).toDateString() : '—'}</td></tr>
</table>
<p class="note">The internal note above is for staff use and is not shown to the applicant.</p>

<footer>Generated ${new Date().toLocaleString('en-RW')} &middot; ESSA Nyarugunga admissions office</footer>
</body></html>`);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// ─── history for a single application ─────────────────────────────────────────
router.get('/applications/:id', ...ADMIN_ONLY, async (req, res) => {
  try {
    const application = await AdmissionApplication.findById(req.params.id).populate(POPULATE);
    if (!application) return res.status(404).json({ message: 'Application not found.' });

    const User = mongoose.model('User');
    const entries = [...(application.activity || [])].sort((a, b) => new Date(b.at) - new Date(a.at));
    const withNames = await Promise.all(
      entries.map(async (item) => {
        const actor = item.actor ? await User.findById(item.actor).select('fullName').lean() : null;
        return { ...item.toObject ? item.toObject() : item, actorName: actor?.fullName || 'System' };
      })
    );

    res.json({ application, activity: withNames });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;