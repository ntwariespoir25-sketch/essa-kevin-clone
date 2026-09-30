import React, { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';

const API_URL = import.meta.env.VITE_API_URL;
const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('portalToken')}`
});

const api = async (path, opts = {}) => {
  const res = await fetch(`${API_URL}/api${path}`, { headers: authHeaders(), ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return Promise.reject(new Error(body.message || 'Request failed'));
  }
  return res.json();
};

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-RW', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

// A percentage the pupil has not earned yet reads as a dash, not a zero. Zero is
// a real result and means something quite different: the pupil sat the work and
// failed it. Collapsing "no marks recorded" into 0 would invent a failing pupil
// on every new class.
const pct = (value) => (value === null || value === undefined ? null : value);

// Below the pass mark, or below the attendance floor, or most of the work set
// still outstanding. The threshold colours are the same three reasons the
// at-risk flag uses, so a red figure always means the same thing on this page.
const pctTone = (value, floor = 50) => {
  if (value === null) return { color: 'var(--text-faint-2)', label: '—' };
  if (value < floor) return { color: '#c0392b', label: `${value}%` };
  if (value < 75) return { color: '#b9770e', label: `${value}%` };
  return { color: '#1e8449', label: `${value}%` };
};

const Card = ({ title, action, children, style }) => (
  <div style={{ background: 'var(--surface-card)', borderRadius: 14, padding: 18, border: '1px solid var(--surface-page)', boxShadow: '0 2px 10px rgba(0,0,0,.05)', ...style }}>
    {(title || action) && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        {title && <h4 style={{ margin: 0, fontSize: 15, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>{title}</h4>}
        {action}
      </div>
    )}
    {children}
  </div>
);

const Button = ({ children, onClick, tone = 'default', small, style }) => {
  const tones = {
    default: { background: 'var(--surface-page)', color: 'var(--text-secondary)' },
    primary: { background: 'var(--navy)', color: 'var(--on-solid)' },
    danger: { background: '#c0392b', color: 'var(--on-solid)' }
  };
  return (
    <button onClick={onClick} style={{
      ...tones[tone], border: 'none', borderRadius: 8, padding: small ? '6px 12px' : '9px 16px',
      fontSize: small ? 12 : 13, fontWeight: 600, cursor: 'pointer', ...style
    }}>{children}</button>
  );
};

const Pill = ({ children, tone = 'default' }) => {
  const tones = {
    default: { color: 'var(--text-secondary)', background: 'var(--surface-page)' },
    bad: { color: '#c0392b', background: 'var(--tint-danger)' },
    warn: { color: '#b9770e', background: 'var(--tint-warning)' },
    good: { color: '#1e8449', background: 'var(--tint-success)' }
  };
  return <span style={{ ...tones[tone], display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{children}</span>;
};

// A thin bar makes a class-wide comparison readable at a glance, which a column
// of percentages on its own does not.
const Bar = ({ value, floor = 50 }) => {
  if (value === null) return <div style={{ fontSize: 12, color: 'var(--text-faint-2)' }}>no marks yet</div>;
  const tone = value < floor ? '#c0392b' : value < 75 ? '#b9770e' : '#1e8449';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--surface-page)', borderRadius: 20, overflow: 'hidden', minWidth: 60 }}>
        <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: tone, borderRadius: 20 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: tone, minWidth: 40, textAlign: 'right' }}>{value}%</span>
    </div>
  );
};

const SummaryTile = ({ label, value, sub, tone }) => (
  <div style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-page)', borderRadius: 12, padding: '13px 15px' }}>
    <div style={{ fontSize: 22, fontWeight: 700, color: tone || 'var(--navy)', fontFamily: 'Georgia, serif' }}>{value}</div>
    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{label}</div>
    {sub && <div style={{ fontSize: 11, color: 'var(--text-faint-2)', marginTop: 2 }}>{sub}</div>}
  </div>
);

export const ProgressPanel = () => {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState(null);
  const [roster, setRoster] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadClasses = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api('/teacher/progress/classes');
      setClasses(Array.isArray(d.classes) ? d.classes : []);
    } catch (e) {
      Swal.fire('Could not load your forms', e.message, 'error');
      setClasses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadClasses(); }, [loadClasses]);

  const openClass = async (id) => {
    setClassId(id);
    setDetail(null);
    setRoster(null);
    try {
      setRoster(await api(`/teacher/progress/classes/${id}`));
    } catch (e) {
      Swal.fire('Could not load that form', e.message, 'error');
    }
  };

  const openPupil = async (pupilId) => {
    try {
      setDetail(await api(`/teacher/progress/classes/${classId}/pupils/${pupilId}`));
    } catch (e) {
      Swal.fire('Could not load that pupil', e.message, 'error');
    }
  };

  // ── form list ──
  if (!classId) {
    return (
      <div>
        <h3 style={{ margin: '0 0 4px', fontSize: 17, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>Progress Tracking</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-faint)' }}>
          Marks, attendance and unfinished work for every pupil in your forms. Pupils who need help are listed first.
        </p>

        {loading && <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Loading…</p>}
        {!loading && classes.length === 0 && (
          <Card>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
              You are not assigned to any forms yet. A class appears here once you are made its class teacher or allocated to teach it.
            </p>
          </Card>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {classes.map((c) => (
            <Card key={c._id} style={{ cursor: 'pointer' }} onClick={undefined}>
              <div onClick={() => openClass(c._id)} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong style={{ fontSize: 15, color: 'var(--navy)' }}>{c.label}</strong>
                  {c.letter && c.letter !== '-' && <Pill tone={c.averageMarks < 50 ? 'bad' : 'good'}>{c.letter}</Pill>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>
                  {c.pupilCount} pupil{c.pupilCount === 1 ? '' : 's'}
                </div>
                <Bar value={pct(c.averageMarks)} />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── one pupil ──
  if (detail) {
    const p = detail.progress;
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>{p.pupil.fullName}</h3>
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{detail.class.label} · {p.pupil.studentId || 'no code'}</div>
          </div>
          <Button onClick={() => setDetail(null)}>Back to the form</Button>
        </div>

        {p.atRisk && (
          <div style={{ background: 'var(--tint-danger)', border: '1px solid #e74c3c', borderRadius: 11, padding: '12px 15px', marginBottom: 14 }}>
            <strong style={{ fontSize: 13, color: '#c0392b' }}>This pupil needs a conversation</strong>
            <div style={{ fontSize: 12, color: 'var(--text-body)', marginTop: 4 }}>{p.riskReasons.join(' · ')}</div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
          <SummaryTile label="Average mark" value={p.marks.percentage === null ? '—' : `${p.marks.percentage}%`}
            sub={p.marks.letter} tone={p.marks.percentage === null ? undefined : (p.marks.percentage < 50 ? '#c0392b' : '#1e8449')} />
          <SummaryTile label="Attendance" value={p.attendance.percentage === null ? '—' : `${p.attendance.percentage}%`}
            sub={`${p.attendance.daysPresent} present · ${p.attendance.daysAbsent} absent`}
            tone={p.attendance.percentage === null ? undefined : (p.attendance.percentage < 75 ? '#c0392b' : '#1e8449')} />
          <SummaryTile label="Work handed in" value={p.work.percentComplete === null ? '—' : `${p.work.percentComplete}%`}
            sub={`${p.work.submitted} of ${p.work.assigned} set`}
            tone={p.work.outstanding > 0 ? '#b9770e' : '#1e8449'} />
          <SummaryTile label="Assessments" value={p.marks.assessmentsGraded}
            sub={p.marks.subjects.length ? p.marks.subjects.join(', ') : 'no subjects marked yet'} />
        </div>

        <Card title="Every mark recorded">
          {(detail.marks || []).length === 0
            ? <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>No marks recorded for this pupil yet.</p>
            : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                  <thead>
                    <tr>
                      {['Assessment', 'Subject', 'Score', 'Grade', 'Term', 'Recorded'].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>{h.toUpperCase()}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.marks.map((m) => (
                      <tr key={m._id} style={{ borderBottom: '1px solid var(--surface-muted)' }}>
                        <td style={{ padding: '8px 10px', fontSize: 13, color: 'var(--text-body)' }}>{m.assessment}</td>
                        <td style={{ padding: '8px 10px', fontSize: 13, color: 'var(--text-secondary)' }}>{m.subject || '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: 13, color: 'var(--text-body)', fontWeight: 600 }}>
                          {m.score === null ? 'not sat' : `${m.score}${m.maxScore !== null ? ` / ${m.maxScore}` : ''}`}
                          {m.maxScore === null && <div style={{ fontSize: 10, color: 'var(--text-faint-2)' }}>no ceiling on file</div>}
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 700, color: m.letter === 'F' ? '#c0392b' : 'var(--navy)' }}>{m.letter}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-secondary)' }}>{m.term || '—'}</td>
                        <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-faint)' }}>{fmt(m.recordedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>
      </div>
    );
  }

  // ── roster ──
  if (!roster) return <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Loading the form…</p>;

  const s = roster.summary;
  const pupils = roster.pupils || [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 17, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>{roster.class.label}</h3>
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{s.pupilCount} pupils · at-risk pupils are listed first</div>
        </div>
        <Button onClick={() => { setClassId(null); setRoster(null); }}>All my forms</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
        <SummaryTile label="Average" value={s.averageMarks === null ? '—' : `${s.averageMarks}%`} />
        <SummaryTile label="Above the pass mark" value={s.passingCount} sub={`${s.failingCount} below`} tone={s.failingCount ? '#c0392b' : '#1e8449'} />
        <SummaryTile label="Needs a conversation" value={s.atRiskCount} tone={s.atRiskCount ? '#c0392b' : '#1e8449'} />
        <SummaryTile label="Average attendance" value={s.averageAttendance === null ? '—' : `${s.averageAttendance}%`}
          tone={s.averageAttendance !== null && s.averageAttendance < 75 ? '#c0392b' : undefined} />
        <SummaryTile label="Work outstanding" value={s.outstandingWorkCount} tone={s.outstandingWorkCount ? '#b9770e' : undefined} />
      </div>

      {pupils.length === 0 && (
        <Card><p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>No pupils are enrolled in this form.</p></Card>
      )}

      {pupils.length > 0 && (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--surface-page)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
            <thead>
              <tr style={{ background: 'var(--surface-muted)' }}>
                {['Pupil', 'Marks', 'Attendance', 'Work in', 'Outstanding', 'Status'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 13px', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pupils.map((p) => (
                <tr key={p.pupil._id} onClick={() => openPupil(p.pupil._id)}
                  style={{ borderBottom: '1px solid var(--surface-muted)', cursor: 'pointer' }}>
                  <td style={{ padding: '10px 13px', fontSize: 13 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-body)' }}>{p.pupil.fullName}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{p.pupil.studentId || 'no code'}</div>
                  </td>
                  <td style={{ padding: '10px 13px', minWidth: 130 }}>
                    <Bar value={pct(p.marks.percentage)} />
                    <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                      {p.marks.percentage === null ? 'no marks' : `grade ${p.marks.letter}`} · {p.marks.assessmentsGraded} marked
                    </div>
                  </td>
                  <td style={{ padding: '10px 13px', fontSize: 13, fontWeight: 600, color: pctTone(p.attendance.percentage, 75).color }}>
                    {pctTone(p.attendance.percentage, 75).label}
                  </td>
                  <td style={{ padding: '10px 13px', fontSize: 13, color: 'var(--text-body)' }}>
                    {p.work.percentComplete === null ? '—' : `${p.work.submitted}/${p.work.assigned}`}
                  </td>
                  <td style={{ padding: '10px 13px', fontSize: 13, color: p.work.outstanding ? '#b9770e' : 'var(--text-faint-2)' }}>
                    {p.work.outstanding || '—'}
                  </td>
                  <td style={{ padding: '10px 13px' }}>
                    {p.atRisk
                      ? <Pill tone="bad" >{p.riskReasons[0]}</Pill>
                      : <Pill tone="good">On track</Pill>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
