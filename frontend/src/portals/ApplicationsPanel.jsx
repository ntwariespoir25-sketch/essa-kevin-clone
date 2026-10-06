import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { openPrintableDocument } from '../utils/printDocument';

const API_URL = import.meta.env.VITE_API_URL;
const getToken = () => localStorage.getItem('portalToken');
const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` });

// ─── constants ────────────────────────────────────────────────────────────────

const STATUS_META = {
  pending:    { label: 'Pending',     color: '#7a4a00', bg: '#fff4e5' },
  reviewing:  { label: 'Under Review', color: '#1d3f7a', bg: '#eef4ff' },
  shortlisted:{ label: 'Shortlisted', color: '#7a5a00', bg: '#fffbe6' },
  accepted:   { label: 'Accepted',    color: '#1b5e20', bg: '#e8f5e9' },
  rejected:   { label: 'Rejected',    color: '#b91c1c', bg: '#fef2f2' },
  waitlisted: { label: 'Waitlisted',  color: '#4a148c', bg: '#f3e5f5' }
};

const CHIP_STATUSES = ['pending', 'reviewing', 'accepted', 'rejected'];

const KPI_DEFS = [
  { key: 'all',        label: 'Total',       icon: 'fas fa-file-alt',    accent: '#1a3a5c', bg: '#e8eef5' },
  { key: 'pending',    label: 'Pending',     icon: 'fas fa-hourglass-half', accent: '#7a4a00', bg: '#fff4e5' },
  { key: 'reviewing',  label: 'Under Review', icon: 'fas fa-eye',        accent: '#1d3f7a', bg: '#eef4ff' },
  { key: 'accepted',   label: 'Accepted',    icon: 'fas fa-check-circle', accent: '#1b5e20', bg: '#e8f5e9' },
  { key: 'rejected',   label: 'Rejected',    icon: 'fas fa-times-circle', accent: '#b91c1c', bg: '#fef2f2' }
];

const RUBRIC = [
  { key: 'academic',  label: 'Academic',  icon: 'fas fa-book',         hint: 'Grades, transcripts' },
  { key: 'exam',      label: 'Exam',      icon: 'fas fa-pen-to-square', hint: 'Entrance exam result' },
  { key: 'character', label: 'Character', icon: 'fas fa-user',         hint: 'Discipline, references' },
  { key: 'talent',    label: 'Talent',    icon: 'fas fa-star',         hint: 'Aptitude, extracurriculars' }
];

const DOCUMENTS = [
  { key: 'reportCardUrl',  label: 'Report card' },
  { key: 'birthCertUrl',   label: 'Birth certificate' },
  { key: 'studentPhotoUrl', label: 'Student photo' }
];

const PAGE_SIZES = [10, 20, 50, 100];

// ─── helpers ──────────────────────────────────────────────────────────────────

const initialsOf = (name = '') =>
  String(name).trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';

const averageTone = (value) => {
  if (typeof value !== 'number') return { color: 'var(--text-faint)', pct: 0 };
  if (value >= 80) return { color: '#1b5e20', pct: Math.min(100, value) };
  if (value >= 70) return { color: '#7a5a00', pct: Math.min(100, value) };
  return { color: '#b91c1c', pct: Math.max(4, Math.min(100, value)) };
};

// "3 days ago" reads faster than "2026-09-28" when scanning a list, but the
// exact date is only a hover away for anyone who needs to quote it.
const relativeTime = (value) => {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const seconds = Math.round((Date.now() - then) / 1000);
  const table = [
    [60, 'second', 1],
    [3600, 'minute', 60],
    [86400, 'hour', 3600],
    [604800, 'day', 86400],
    [2629800, 'week', 604800],
    [31557600, 'month', 2629800]
  ];
  for (const [limit, unit, divisor] of table) {
    if (Math.abs(seconds) < limit) {
      const value = Math.round(seconds / divisor);
      if (value <= 0) return 'just now';
      return `${value} ${unit}${value === 1 ? '' : 's'} ago`;
    }
  }
  return `${Math.round(seconds / 31557600)}y ago`;
};

const fullDate = (value) =>
  value ? new Date(value).toLocaleString('en-RW', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const rubricTotal = (rubric) => {
  const scored = RUBRIC.filter(r => typeof rubric?.[r.key]?.score === 'number');
  if (!scored.length) return null;
  const sum = scored.reduce((total, r) => total + rubric[r.key].score, 0);
  return Math.round((sum / scored.length) * 10);
};

const csvCell = (value) => {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const ActionButton = ({ icon, label, title, onClick, tone = 'default', disabled }) => {
  const tones = {
    default: { color: 'var(--text-secondary)', border: 'var(--surface-sunken-2)', hover: '#1a3a5c' },
    score:   { color: '#1d3f7a', border: '#c7d7f0', hover: '#1d3f7a' },
    decide:  { color: '#7a5a00', border: '#ecd9a0', hover: '#7a5a00' }
  };
  const t = tones[tone];
  return (
    <button
      type="button"
      title={title || label}
      aria-label={title || label}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px',
        borderRadius: 8, border: `1px solid ${t.border}`, background: 'var(--surface-card)',
        color: t.color, fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap'
      }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.color = t.hover; e.currentTarget.style.borderColor = t.hover; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.color = t.color; e.currentTarget.style.borderColor = t.border; } }}
    >
      <i className={icon} style={{ fontSize: 11 }} />{label}
    </button>
  );
};

const StatusPill = ({ status }) => {
  const meta = STATUS_META[status] || { label: status, color: 'var(--text-secondary)', bg: 'var(--surface-page)' };
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: meta.color, background: meta.bg, whiteSpace: 'nowrap' }}>
      {meta.label}
    </span>
  );
};

// Small circular initials avatar, navy gradient with gold lettering.
const InitialAvatar = ({ name, size = 36, img }) => (
  img
    ? <img src={img} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    : (
      <div style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg,#1a3a5c,#2c5f8a)', color: '#ffc107',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: size * 0.38, letterSpacing: 1
      }}>{initialsOf(name)}</div>
    )
);

const ReviewerChip = ({ user }) => {
  if (!user) return <span style={{ fontSize: 12, color: 'var(--text-faint-2)' }}>—</span>;
  return (
    <span title={user.email || user.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
      <span style={{
        width: 22, height: 22, borderRadius: '50%', background: 'var(--surface-navy-tint)',
        color: 'var(--navy)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700
      }}>{initialsOf(user.name)}</span>
      {String(user.name || '').split(' ')[0]}
    </span>
  );
};

const LABEL_STYLE = {
  display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
  color: 'var(--text-secondary)', marginBottom: 5
};

const Detail = ({ k, v }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={LABEL_STYLE}>{k.toUpperCase()}</div>
    <div style={{ fontSize: 13, color: 'var(--text-body)', wordBreak: 'break-word' }}>{v || '—'}</div>
  </div>
);

const TABLE_TH = {
  padding: '9px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 700,
  letterSpacing: 0.7, color: 'var(--text-faint)', borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap', textTransform: 'uppercase', background: 'var(--surface-muted)'
};

const SortHeader = ({ field, sort, dir, onSort, children }) => (
  <th
    style={{ ...TABLE_TH, cursor: 'pointer', userSelect: 'none' }}
    onClick={() => onSort(field)}
    title={`Sort by ${String(children).toLowerCase()}`}
  >
    {children}
    <i
      className={`fas ${sort === field ? (dir === 'asc' ? 'fa-arrow-up' : 'fa-arrow-down') : 'fa-sort'}`}
      style={{ marginLeft: 6, opacity: sort === field ? 1 : 0.32, fontSize: 9 }}
    />
  </th>
);

// ─── application detail drawer ────────────────────────────────────────────────

// The drawer is mounted with key={application._id}, so a different row opens a
// fresh instance with these initial values and the previous applicant's score
// edits can never be saved against the wrong record. Saving an application
// keeps the same key, so whatever the reviewer is still typing survives.
const draftFor = (application) => Object.fromEntries(
  RUBRIC.map(r => [
    r.key,
    {
      score: application?.rubric?.[r.key]?.score ?? '',
      comment: application?.rubric?.[r.key]?.comment || ''
    }
  ])
);

const decisionFor = (application) =>
  application?.status === 'pending' ? 'shortlisted' : application?.status;

const Drawer = ({ application, tab, setTab, onClose, onSaveScores, onDecide, onPrint, saving }) => {
  const [draft, setDraft] = useState(() => draftFor(application));
  const [decision, setDecision] = useState(() => decisionFor(application));
  const [note, setNote] = useState(() => application?.reviewNotes || '');
  const [notify, setNotify] = useState(true);

  // The live total is derived from the draft rather than stored, so it stays in
  // step with every keystroke.
  const live = useMemo(() => {
    if (!draft) return null;
    const scored = RUBRIC.filter(r => draft[r.key].score !== '' && draft[r.key].score !== null && !Number.isNaN(Number(draft[r.key].score)));
    if (!scored.length) return null;
    const sum = scored.reduce((total, r) => total + Number(draft[r.key].score), 0);
    return { pct: Math.round((sum / scored.length) * 10), scored: scored.length };
  }, [draft]);

  if (!application) return null;

  const fieldStyle = {
    width: '100%', padding: '9px 11px', border: '1.5px solid var(--surface-sunken-2)',
    borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none',
    background: 'var(--surface-card)', color: 'var(--text-body)', boxSizing: 'border-box'
  };
  const sectionTitle = {
    fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
    color: 'var(--text-faint)', margin: '20px 0 10px'
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,.45)' }} onClick={(e) => e.currentTarget === e.target && onClose()}>
      <aside style={{ width: 'min(560px, 100vw)', background: 'var(--surface-card)', display: 'flex', flexDirection: 'column', boxShadow: '-24px 0 60px rgba(0,0,0,.25)' }}>

        {/* header */}
        <header style={{ padding: '18px 22px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}>
            <InitialAvatar name={application.fullName} size={44} img={application.studentPhotoUrl || undefined} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--navy)', fontFamily: 'Georgia, serif' }}>{application.fullName}</div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{application.applicationNumber}</div>
              <div style={{ marginTop: 7 }}><StatusPill status={application.status} /></div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" title="Print application" aria-label="Print application" onClick={onPrint} style={{ background: 'none', border: '1px solid var(--surface-sunken-2)', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <i className="fas fa-print" />
              </button>
              <button type="button" title="Close" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-faint)', lineHeight: 1 }}>×</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 4, marginTop: 16 }}>
            {[['profile', 'Profile'], ['score', 'Review & Score'], ['decision', 'Decision']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                style={{
                  padding: '9px 13px', border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: tab === key ? 700 : 600,
                  color: tab === key ? 'var(--navy)' : 'var(--text-faint)',
                  borderBottom: `2px solid ${tab === key ? 'var(--navy)' : 'transparent'}`,
                  fontFamily: 'inherit'
                }}
              >{label}</button>
            ))}
          </div>
        </header>

        {/* body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>

          {tab === 'profile' && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>{application.level}</div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                Applied {relativeTime(application.createdAt)} · Previous average {application.lastAverage}%
              </div>

              <div style={sectionTitle}>Applicant</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
                <Detail k="Date of birth" v={application.dateOfBirth ? new Date(application.dateOfBirth).toDateString() : ''} />
                <Detail k="Nationality" v={application.nationality} />
                <Detail k="Email" v={application.email} />
                <Detail k="Phone" v={application.phone} />
                <Detail k="National ID" v={application.nationalId} />
                <Detail k="Scholarship" v={application.applyScholarship ? 'Applied' : 'Not applied'} />
              </div>
              <Detail k="Address" v={application.address} />

              <div style={sectionTitle}>Academic background</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
                <Detail k="Previous school" v={application.previousSchool} />
                <Detail k="Previous average" v={`${application.lastAverage}%`} />
              </div>
              <Detail k="Achievements" v={application.achievements} />

              <div style={sectionTitle}>Parent / guardian</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
                <Detail k="Name" v={application.parentName} />
                <Detail k="Phone" v={application.parentPhone} />
                <Detail k="Email" v={application.parentEmail} />
                <Detail k="Occupation" v={application.parentOccupation} />
              </div>

              <div style={sectionTitle}>Documents</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                {DOCUMENTS.map(doc => {
                  const url = application[doc.key];
                  return (
                    <a
                      key={doc.key}
                      href={url || undefined}
                      target={url ? '_blank' : undefined}
                      rel={url ? 'noreferrer' : undefined}
                      title={url ? `Open ${doc.label}` : `${doc.label} not uploaded`}
                      style={{
                        display: 'block', padding: 14, borderRadius: 10, textAlign: 'center',
                        border: `1px dashed ${url ? 'var(--accent-blue)' : 'var(--surface-sunken-2)'}`,
                        background: url ? 'var(--surface-card)' : 'var(--surface-muted)',
                        color: url ? 'var(--accent-blue)' : 'var(--text-faint-2)',
                        textDecoration: 'none', fontSize: 11, opacity: url ? 1 : 0.75
                      }}
                    >
                      <i className={`fas ${url ? 'fa-file-alt' : 'fa-file-circle-ex'}`} style={{ fontSize: 19, display: 'block', marginBottom: 6 }} />
                      {doc.label}
                      <div style={{ fontSize: 10, marginTop: 3 }}>{url ? 'Uploaded' : 'Not uploaded'}</div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'score' && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16 }}>
                Score each criterion from 0 to 10. Unscored criteria are left out of the total, so a partly finished review still produces a fair average.
              </div>

              {RUBRIC.map(item => (
                <div key={item.key} style={{ padding: '13px 0', borderBottom: '1px solid var(--surface-muted)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                    <div>
                      <i className={`fas ${item.icon}`} style={{ marginRight: 7, color: 'var(--accent-blue)', fontSize: 12 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>{item.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-faint-2)', marginLeft: 8 }}>{item.hint}</span>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      value={draft?.[item.key]?.score ?? ''}
                      placeholder="—"
                      onChange={(e) => setDraft(prev => ({ ...prev, [item.key]: { ...prev[item.key], score: e.target.value } }))}
                      style={{ ...fieldStyle, width: 74, textAlign: 'center', fontWeight: 700 }}
                    />
                  </div>
                  <input
                    placeholder={`Comment on ${item.label.toLowerCase()}…`}
                    value={draft?.[item.key]?.comment || ''}
                    onChange={(e) => setDraft(prev => ({ ...prev, [item.key]: { ...prev[item.key], comment: e.target.value } }))}
                    style={fieldStyle}
                  />
                </div>
              ))}

              {live && (
                <div style={{ marginTop: 18, padding: 15, borderRadius: 12, background: 'var(--surface-navy-tint)', display: 'flex', alignItems: 'center', gap: 15 }}>
                  <div style={{
                    width: 62, height: 62, borderRadius: '50%', flexShrink: 0,
                    background: `conic-gradient(#1a3a5c ${live.pct * 3.6}deg, var(--surface-card) 0deg)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--surface-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>
                      {live.pct}%
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--navy)' }}>Overall score {live.pct}%</strong>
                    <div style={{ marginTop: 3, color: 'var(--text-faint)' }}>
                      Averaged across {live.scored} of {RUBRIC.length} scored criteria.
                    </div>
                    <div style={{ marginTop: 3, color: 'var(--text-faint)' }}>
                      Previous school average was {application.lastAverage}%.
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={saving}
                onClick={() => onSaveScores(draft)}
                style={{
                  width: '100%', marginTop: 18, padding: '11px', borderRadius: 9, border: 'none',
                  background: saving ? '#b8c4ce' : 'var(--navy)', color: 'var(--on-solid)',
                  fontWeight: 600, fontSize: 13, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit'
                }}
              >
                {saving ? 'Saving…' : 'Save scores'}
              </button>
            </div>
          )}

          {tab === 'decision' && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16 }}>
                Recorded decisions email the applicant and are logged in the activity feed. The note below is for staff only.
              </div>

              <div style={LABEL_STYLE}>OUTCOME</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {['shortlisted', 'accepted', 'waitlisted', 'rejected'].map(status => {
                  const meta = STATUS_META[status];
                  const active = decision === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setDecision(status)}
                      style={{
                        padding: '11px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: 13, fontWeight: 600, textAlign: 'left',
                        border: `1.5px solid ${active ? meta.color : 'var(--surface-sunken-2)'}`,
                        background: active ? meta.bg : 'var(--surface-card)',
                        color: active ? meta.color : 'var(--text-secondary)'
                      }}
                    >
                      <i className={`fas fa-${status === 'accepted' ? 'check' : status === 'rejected' ? 'times' : status === 'shortlisted' ? 'star' : 'hourglass-half'}`} style={{ marginRight: 8 }} />
                      {meta.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ ...LABEL_STYLE, marginTop: 18 }}>DECISION REASON (INTERNAL)</div>
              <textarea
                rows={5}
                value={note}
                placeholder="Why was this outcome chosen? Only staff see this text."
                onChange={(e) => setNote(e.target.value)}
                style={{ ...fieldStyle, resize: 'vertical', fontSize: 13 }}
              />

              <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} style={{ width: 15, height: 15, accentColor: '#1a3a5c' }} />
                Email the applicant with this outcome
              </label>

              <button
                type="button"
                disabled={saving}
                onClick={() => onDecide(decision, note, notify)}
                style={{
                  width: '100%', marginTop: 18, padding: '11px', borderRadius: 9, border: 'none',
                  background: saving ? '#b8c4ce' : 'var(--navy)', color: 'var(--on-solid)',
                  fontWeight: 600, fontSize: 13, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit'
                }}
              >
                {saving ? 'Saving…' : notify ? 'Save & notify applicant' : 'Save decision'}
              </button>

              {application.reviewedBy && (
                <div style={{ marginTop: 16, padding: 13, borderRadius: 10, background: 'var(--surface-muted)', fontSize: 12, color: 'var(--text-secondary)' }}>
                  Last decided by <strong>{application.reviewedBy.name}</strong> on {fullDate(application.reviewedAt)}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

// ─── panel ────────────────────────────────────────────────────────────────────

const ApplicationsPanel = ({ refreshSignal, onCountChange }) => {
  const navigate = useNavigate();

  const [data, setData] = useState({ applications: [], total: 0, page: 1, pages: 1, limit: 10, counts: {}, levels: [] });
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [level, setLevel] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sort, setSort] = useState('applied');
  const [dir, setDir] = useState('desc');
  const [selected, setSelected] = useState([]);
  const [open, setOpen] = useState(null);
  const [tab, setTab] = useState('profile');
  const [saving, setSaving] = useState(false);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // A debounced search term means every keystroke does not become a request.
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(q); setPage(1); }, 320);
    return () => clearTimeout(timer);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), sort, dir });
      if (search) params.set('q', search);
      if (status !== 'all') params.set('status', status);
      if (level !== 'all') params.set('level', level);
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const res = await fetch(`${API_URL}/api/academic-admin/applications?${params}`, { headers: authHeaders() });
      if (res.status === 401) { navigate('/portal/login'); return; }
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || 'Could not load applications');
      setData(body);
      onCountChange?.(body.counts || {});
      setSelected([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, limit, sort, dir, search, status, level, from, to, navigate, onCountChange]);

  useEffect(() => { load(); }, [load]);

  // New applications arrive from outside this tab, so pick them up when the
  // dashboard is refocused rather than only when a filter changes.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  // The dashboard passes refreshSignal when it wants this list to re-pull after
    // something changed elsewhere. load is in the deps so a changed filter also
    // re-runs it; with no signal set that branch is inert.
    useEffect(() => {
      if (refreshSignal) load();
    }, [refreshSignal, load]);

  const loadActivity = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/academic-admin/applications/activity?limit=10`, { headers: authHeaders() });
      if (!res.ok) return;
      const body = await res.json();
      setActivity(body.activity || []);
    } catch {
      // A missing activity feed is cosmetic; the table above is the real page.
    }
  }, []);

  useEffect(() => { loadActivity(); }, [loadActivity]);

  const rows = data.applications || [];
  const counts = data.counts || {};
  const dirty = search || status !== 'all' || level !== 'all' || from || to;

  const resetFilters = () => {
    setQ(''); setSearch(''); setStatus('all'); setLevel('all'); setFrom(''); setTo(''); setPage(1);
  };

  const toggleSort = (field) => {
    if (sort === field) setDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(field); setDir(field === 'applicant' || field === 'level' ? 'asc' : 'desc'); }
    setPage(1);
  };

  const toggleRow = (id) =>
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const toggleAllOnPage = () => {
    const ids = rows.map(r => r._id);
    const allOn = ids.every(id => selected.includes(id));
    setSelected(prev => (allOn ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
  };

  const saveScores = async (draft) => {
    setSaving(true);
    try {
      const rubric = Object.fromEntries(
        Object.entries(draft).map(([key, value]) => [key, {
          score: value.score === '' ? null : Number(value.score),
          comment: value.comment || ''
        }])
      );
      const res = await fetch(`${API_URL}/api/academic-admin/applications/${open._id}/score`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ rubric })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || 'Could not save scores');
      setOpen(body.application);
      Swal.fire('Scores saved', 'The review scorecard has been updated.', 'success');
      await load();
      await loadActivity();
    } catch (err) {
      Swal.fire('Could not save', err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const decide = async (next, note, notify) => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/academic-admin/applications/${open._id}/status`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ status: next, reviewNotes: note, notify })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || 'Could not save the decision');

      setOpen(body.application);
      const label = STATUS_META[next]?.label || next;
      await Promise.all([load(), loadActivity()]);

      // Distinguish "saved but the mail bounced" from "saved and notified".
      if (notify && !body.notified) {
        Swal.fire('Decision saved', `Marked ${label}, but the notification email could not be sent.`, 'warning');
      } else if (notify) {
        Swal.fire('Decision saved', `Marked ${label} and the applicant has been notified.`, 'success');
      } else {
        Swal.fire('Decision saved', `Marked ${label}.`, 'success');
      }
    } catch (err) {
      Swal.fire('Could not save', err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Row-level decisions go through the drawer's Decision tab so the reviewer
  // always sees the profile and scores before committing an outcome.

  const bulkStatus = async (next) => {
    const result = await Swal.fire({
      title: `Mark ${selected.length} application${selected.length === 1 ? '' : 's'} as ${STATUS_META[next]?.label}?`,
      html: `<input id="bulk-note" class="swal2-input" placeholder="Decision reason (internal, optional)" />`,
      showCancelButton: true,
      confirmButtonText: `Mark ${selected.length}`,
      focusConfirm: false,
      preConfirm: () => ({ note: document.getElementById('bulk-note')?.value || '' })
    });
    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`${API_URL}/api/academic-admin/applications/bulk-status`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ ids: selected, status: next, reviewNotes: result.value.note })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || 'Bulk update failed');
      Swal.fire('Updated', `${body.updated} moved to ${STATUS_META[next]?.label}${body.skipped ? `, ${body.skipped} left unchanged` : ''}.`, 'success');
      await Promise.all([load(), loadActivity()]);
    } catch (err) {
      Swal.fire('Could not update', err.message, 'error');
    }
  };

  const exportCsv = () => {
    const header = [
      'Application number', 'Full name', 'Email', 'Phone', 'Level', 'Previous school',
      'Previous average', 'Status', 'Applied', 'Decision date',
      'Score: Academic', 'Score: Exam', 'Score: Character', 'Score: Talent',
      'Rubric total', 'Reviewer', 'Scholarship requested'
    ];
    const cell = (row) => [
      row.applicationNumber, row.fullName, row.email, row.phone, row.level, row.previousSchool,
      row.lastAverage, STATUS_META[row.status]?.label || row.status,
      row.createdAt ? new Date(row.createdAt).toISOString() : '',
      row.reviewedAt ? new Date(row.reviewedAt).toISOString() : '',
      ...RUBRIC.map(r => row.rubric?.[r.key]?.score ?? ''),
      rubricTotal(row.rubric) == null ? '' : `${rubricTotal(row.rubric)}%`,
      row.reviewedBy?.name || '',
      row.applyScholarship ? 'Yes' : 'No'
    ];

    const source = selected.length ? rows.filter(r => selected.includes(r._id)) : rows;
    const csv = [header, ...source.map(cell)].map(line => line.map(csvCell).join(',')).join('\r\n');

    // The BOM keeps Excel from rendering accented applicant names as mojibake.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `admissions-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    Swal.fire('Exported', `${source.length} row${source.length === 1 ? '' : 's'} written to CSV.`, 'success');
  };

  const print = async (application) => {
    try {
      await openPrintableDocument(`/academic-admin/applications/${application._id}/print`, API_URL, application.applicationNumber);
    } catch (err) {
      Swal.fire('Cannot print', err.message, 'error');
    }
  };

  const inputStyle = {
    padding: '8px 11px', border: '1.5px solid var(--surface-sunken-2)', borderRadius: 8,
    fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--surface-card)',
    color: 'var(--text-body)'
  };

  const rangeStart = data.total === 0 ? 0 : (data.page - 1) * data.limit + 1;
  const rangeEnd = Math.min(data.page * data.limit, data.total);
  const pageNumbers = [];
  for (let i = 1; i <= data.pages; i += 1) {
    if (i === 1 || i === data.pages || Math.abs(i - data.page) <= 1) pageNumbers.push(i);
    else if (pageNumbers[pageNumbers.length - 1] !== '…') pageNumbers.push('…');
  }
  const allOnPageSelected = rows.length > 0 && rows.every(r => selected.includes(r._id));

  return (
    <div>
      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
        {KPI_DEFS.map(kpi => {
          const value = counts[kpi.key] ?? 0;
          const active = kpi.key === 'all' ? status === 'all' : status === kpi.key;
          return (
            <button
              key={kpi.key}
              type="button"
              onClick={() => { setStatus(active && kpi.key !== 'all' ? 'all' : kpi.key); setPage(1); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '15px 16px', borderRadius: 13,
                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                background: 'var(--surface-card)',
                border: `1.5px solid ${active ? kpi.accent : 'var(--surface-page)'}`,
                boxShadow: '0 2px 10px rgba(0,0,0,.05)'
              }}
            >
              <span style={{ width: 40, height: 40, borderRadius: 11, background: kpi.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i className={`fas ${kpi.icon}`} style={{ color: kpi.accent, fontSize: 17 }} />
              </span>
              <span>
                <span style={{ display: 'block', fontSize: 21, fontWeight: 700, color: 'var(--navy)', lineHeight: 1, fontFamily: 'Georgia, serif' }}>{value}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-faint)', marginTop: 4 }}>{kpi.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* filters */}
      <div style={{ background: 'var(--surface-card)', borderRadius: 13, padding: 14, marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px,2fr) repeat(auto-fit,minmax(130px,1fr))', gap: 9, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint-2)', fontSize: 12 }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, email or application no."
              style={{ ...inputStyle, width: '100%', paddingLeft: 31 }}
            />
          </div>

          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={inputStyle} title="Filter by status">
            <option value="all">All statuses</option>
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>

          <select value={level} onChange={(e) => { setLevel(e.target.value); setPage(1); }} style={inputStyle} title="Filter by level">
            <option value="all">All levels</option>
            {(data.levels || []).map(l => <option key={l} value={l}>{l}</option>)}
          </select>

          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} style={inputStyle} title="Applied from" />
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} style={inputStyle} title="Applied to" />

          <button
            type="button"
            onClick={resetFilters}
            disabled={!dirty}
            style={{
              padding: '8px 13px', borderRadius: 8, border: '1px solid var(--surface-sunken-2)',
              background: 'var(--surface-card)', color: 'var(--text-secondary)', fontSize: 12.5,
              fontWeight: 600, cursor: dirty ? 'pointer' : 'default', opacity: dirty ? 1 : 0.45, fontFamily: 'inherit'
            }}
          >Reset</button>
        </div>

        {/* quick chips */}
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => { setStatus('all'); setPage(1); }}
            style={{
              padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit',
              border: `1px solid ${status === 'all' ? 'var(--navy)' : 'var(--surface-sunken-2)'}`,
              background: status === 'all' ? 'var(--navy)' : 'var(--surface-card)',
              color: status === 'all' ? 'var(--on-solid)' : 'var(--text-secondary)'
            }}
          >All ({counts.all ?? 0})</button>

          {CHIP_STATUSES.map(key => {
            const meta = STATUS_META[key];
            const active = status === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => { setStatus(active ? 'all' : key); setPage(1); }}
                style={{
                  padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit',
                  border: `1px solid ${active ? meta.color : meta.bg}`,
                  background: active ? meta.bg : 'var(--surface-card)',
                  color: active ? meta.color : 'var(--text-secondary)'
                }}
              >{meta.label} ({counts[key] ?? 0})</button>
            );
          })}

          <span style={{ flex: 1 }} />

          <button
            type="button"
            onClick={exportCsv}
            style={{
              padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: 'inherit', border: '1px solid #d4af37', background: 'var(--surface-card)', color: '#7a5a00'
            }}
          ><i className="fas fa-file-csv" style={{ marginRight: 6 }} />Export CSV</button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: 9, background: 'var(--tint-danger)', color: 'var(--danger)', fontSize: 12.5, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* table */}
      <div style={{ background: 'var(--surface-card)', borderRadius: 13, boxShadow: '0 2px 10px rgba(0,0,0,.05)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
            <thead>
              <tr>
                <th style={{ ...TABLE_TH, width: 38 }}>
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleAllOnPage}
                    aria-label="Select all on this page"
                    style={{ accentColor: '#1a3a5c', width: 14, height: 14 }}
                  />
                </th>
                <th style={TABLE_TH}>Application no.</th>
                <SortHeader field="applicant" sort={sort} dir={dir} onSort={toggleSort}>Applicant</SortHeader>
                <SortHeader field="level" sort={sort} dir={dir} onSort={toggleSort}>Level</SortHeader>
                <SortHeader field="average" sort={sort} dir={dir} onSort={toggleSort}>Average</SortHeader>
                <SortHeader field="applied" sort={sort} dir={dir} onSort={toggleSort}>Applied</SortHeader>
                <SortHeader field="status" sort={sort} dir={dir} onSort={toggleSort}>Status</SortHeader>
                <th style={TABLE_TH}>Reviewer</th>
                <th style={{ ...TABLE_TH, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-faint-2)', fontSize: 13 }}>
                  <i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }} />Loading applications…
                </td></tr>
              )}

              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '46px 20px' }}>
                    <i className="fas fa-inbox" style={{ fontSize: 34, color: 'var(--text-faint-2)', display: 'block', marginBottom: 12 }} />
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', marginBottom: 5 }}>No applications found.</div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint-2)', marginBottom: 14 }}>
                      {dirty ? 'No applications match the filters you have applied.' : 'New applications will appear here as soon as they are submitted.'}
                    </div>
                    {dirty && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        style={{ padding: '7px 15px', borderRadius: 8, border: '1px solid var(--surface-sunken-2)', background: 'var(--surface-card)', color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                      >Clear filters</button>
                    )}
                  </td>
                </tr>
              )}

              {rows.map(app => {
                const tone = averageTone(app.lastAverage);
                const total = rubricTotal(app.rubric);
                return (
                  <tr key={app._id} style={{ borderBottom: '1px solid var(--surface-muted)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <input
                        type="checkbox"
                        checked={selected.includes(app._id)}
                        onChange={() => toggleRow(app._id)}
                        aria-label={`Select ${app.fullName}`}
                        style={{ accentColor: '#1a3a5c', width: 14, height: 14 }}
                      />
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {app.applicationNumber}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <InitialAvatar name={app.fullName} img={app.studentPhotoUrl || undefined} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)' }}>{app.fullName}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{app.email}</div>
                          {total != null && (
                            <div style={{ fontSize: 10.5, color: 'var(--text-faint-2)', marginTop: 2 }}>Score {total}%</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-body)' }}>{app.level}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: tone.color }}>{app.lastAverage}%</div>
                      <div style={{ width: 52, height: 4, borderRadius: 3, background: 'var(--surface-sunken-2)', marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${tone.pct}%`, height: '100%', background: tone.color, borderRadius: 3 }} />
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-faint)' }} title={fullDate(app.createdAt)}>
                      {relativeTime(app.createdAt)}
                    </td>
                    <td style={{ padding: '10px 12px' }}><StatusPill status={app.status} /></td>
                    <td style={{ padding: '10px 12px' }}><ReviewerChip user={app.reviewedBy} /></td>
                    <td style={{ padding: '10px 12px' }}>
                      {/* Full labels on wide screens; a single overflow menu once
                          the table would otherwise have to scroll sideways. */}
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <span className="app-actions-wide" style={{ display: 'flex', gap: 6 }}>
                          <ActionButton icon="fas fa-eye" label="View" onClick={() => { setOpen(app); setTab('profile'); }} />
                          <ActionButton icon="fas fa-star" label="Score" tone="score" onClick={() => { setOpen(app); setTab('score'); }} />
                          <ActionButton icon="fas fa-gavel" label="Decide" tone="decide" onClick={() => { setOpen(app); setTab('decision'); }} />
                        </span>
                        <details className="app-actions-narrow" style={{ position: 'relative' }}>
                          <summary style={{ listStyle: 'none', cursor: 'pointer', padding: '5px 8px', border: '1px solid var(--surface-sunken-2)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                            <i className="fas fa-ellipsis-h" />
                          </summary>
                          <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 9, boxShadow: '0 10px 28px rgba(0,0,0,.14)', padding: 5, zIndex: 40, minWidth: 150 }}>
                            <ActionButton icon="fas fa-eye" label="View" onClick={() => { setOpen(app); setTab('profile'); }} />
                            <ActionButton icon="fas fa-star" label="Score" tone="score" onClick={() => { setOpen(app); setTab('score'); }} />
                            <ActionButton icon="fas fa-gavel" label="Decide" tone="decide" onClick={() => { setOpen(app); setTab('decision'); }} />
                            <ActionButton icon="fas fa-print" label="Print" onClick={() => print(app)} />
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* pagination */}
        <div style={{ padding: '11px 14px', borderTop: '1px solid var(--surface-muted)', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-faint)' }}>
          <span>
            Showing <strong>{rangeStart}</strong>–<strong>{rangeEnd}</strong> of <strong>{data.total}</strong>
          </span>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              Rows
              <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} style={{ ...inputStyle, padding: '4px 7px', fontSize: 12 }}>
                {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>

            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={data.page <= 1}
              style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--surface-sunken-2)', background: 'var(--surface-card)', color: 'var(--text-secondary)', fontSize: 12, cursor: data.page <= 1 ? 'default' : 'pointer', opacity: data.page <= 1 ? 0.45 : 1, fontFamily: 'inherit' }}
            >Prev</button>

            {pageNumbers.map((n, i) =>
              n === '…'
                ? <span key={`gap-${i}`} style={{ padding: '0 3px', color: 'var(--text-faint-2)' }}>…</span>
                : (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    style={{
                      padding: '5px 9px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${n === data.page ? 'var(--navy)' : 'var(--surface-sunken-2)'}`,
                      background: n === data.page ? 'var(--navy)' : 'var(--surface-card)',
                      color: n === data.page ? 'var(--on-solid)' : 'var(--text-secondary)'
                    }}
                  >{n}</button>
                )
            )}

            <button
              type="button"
              onClick={() => setPage(p => Math.min(data.pages, p + 1))}
              disabled={data.page >= data.pages}
              style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--surface-sunken-2)', background: 'var(--surface-card)', color: 'var(--text-secondary)', fontSize: 12, cursor: data.page >= data.pages ? 'default' : 'pointer', opacity: data.page >= data.pages ? 0.45 : 1, fontFamily: 'inherit' }}
            >Next</button>
          </div>
        </div>
      </div>

      {/* bulk action bar */}
      {selected.length > 0 && (
        <div style={{
          position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 2500,
          display: 'flex', gap: 9, alignItems: 'center', padding: '11px 15px', borderRadius: 13,
          background: 'var(--navy)', color: 'var(--on-solid)', boxShadow: '0 14px 40px rgba(0,0,0,.3)',
          flexWrap: 'wrap', maxWidth: 'calc(100vw - 32px)'
        }}>
          <strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{selected.length} selected</strong>
          <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,.22)' }} />
          <ActionButton icon="fas fa-star" label="Shortlist" onClick={() => bulkStatus('shortlisted')} />
          <ActionButton icon="fas fa-check" label="Accept" onClick={() => bulkStatus('accepted')} />
          <ActionButton icon="fas fa-times" label="Reject" onClick={() => bulkStatus('rejected')} />
          <ActionButton icon="fas fa-file-csv" label="Export" onClick={exportCsv} />
          <button
            type="button"
            onClick={() => setSelected([])}
            style={{ padding: '5px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,.3)', background: 'transparent', color: 'var(--on-solid)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >Clear</button>
        </div>
      )}

      {/* recent activity */}
      {activity.length > 0 && (
        <div style={{ background: 'var(--surface-card)', borderRadius: 13, padding: 15, marginTop: 14, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--navy)', marginBottom: 11 }}>
            <i className="fas fa-history" style={{ marginRight: 7, color: 'var(--accent-blue)' }} />Recent activity
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {activity.map((item, i) => (
              <div key={`${item.applicationId}-${i}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-secondary)' }}>
                <InitialAvatar name={item.fullName} size={24} />
                <div style={{ minWidth: 0 }}>
                  <div>
                    <strong style={{ color: 'var(--navy)' }}>{item.actorName || 'System'}</strong>
                    {item.action === 'status_changed' && (
                      <> moved <strong>{item.fullName}</strong> from {STATUS_META[item.from]?.label || item.from} to {STATUS_META[item.to]?.label || item.to}</>
                    )}
                    {item.action === 'scored' && <> updated the review scores for <strong>{item.fullName}</strong></>}
                    {item.action === 'submitted' && <> received an application from <strong>{item.fullName}</strong></>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint-2)', marginTop: 1 }}>
                    {item.applicationNumber} · {relativeTime(item.at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {open && (
        <Drawer
          key={open._id}
          application={open}
          tab={tab}
          setTab={setTab}
          onClose={() => setOpen(null)}
          onSaveScores={saveScores}
          onDecide={decide}
          onPrint={() => print(open)}
          saving={saving}
        />
      )}
    </div>
  );
};

export default ApplicationsPanel;