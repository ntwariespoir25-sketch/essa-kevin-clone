import React, { useState, useEffect, useCallback } from 'react';
import Swal from 'sweetalert2';
import { openPrintableDocument } from '../utils/printDocument';

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

const TERMS = ['Term 1', 'Term 2', 'Term 3'];
const YEARS = [String(new Date().getFullYear()), String(new Date().getFullYear() - 1)];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EXAM_TYPES = ['CAT', 'Midterm', 'Final', 'Quiz', 'Assignment', 'Practical', 'Other'];

const inputStyle = {
  width: '100%', padding: '8px 11px', border: '1.5px solid #e0e0e0', borderRadius: 8,
  fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: 'white'
};
const Inp = (p) => <input {...p} style={{ ...inputStyle, ...p.style }} />;
const Sel = ({ children, ...p }) => <select {...p} style={{ ...inputStyle, ...p.style }}>{children}</select>;

const Panel = ({ title, sub, actions, children }) => (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 19, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>{title}</h2>
        {sub && <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#888', maxWidth: 640, lineHeight: 1.5 }}>{sub}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
    {children}
  </div>
);

const Card = ({ children, style }) => (
  <div style={{ background: 'white', borderRadius: 14, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,.05)', border: '1px solid #f0f0f0', ...style }}>{children}</div>
);

const Btn = ({ children, onClick, icon, color = '#1a3a5c', small, danger, disabled }) => (
  <button onClick={onClick} disabled={disabled} style={{
    background: danger ? '#e74c3c' : disabled ? '#ccc' : color, color: 'white', border: 'none',
    borderRadius: 8, padding: small ? '6px 12px' : '8px 16px', fontSize: small ? 12 : 13,
    fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', display: 'inline-flex',
    alignItems: 'center', gap: 6, fontFamily: 'inherit'
  }}>{icon && <i className={icon} />}{children}</button>
);

const Table = ({ cols, rows, empty = 'Nothing to show yet' }) => (
  <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #f0f0f0' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
      <thead>
        <tr style={{ background: '#f7f9fb' }}>
          {cols.map((c, i) => <th key={i} style={{ padding: '9px 13px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: '#888', letterSpacing: .8, borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>{c.toUpperCase()}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0
          ? <tr><td colSpan={cols.length} style={{ textAlign: 'center', padding: 30, color: '#bbb', fontSize: 13 }}>{empty}</td></tr>
          : rows.map((r, i) => <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>{r}</tr>)}
      </tbody>
    </table>
  </div>
);
const TD = ({ children, style }) => <td style={{ padding: '9px 13px', fontSize: 13, color: '#333', ...style }}>{children}</td>;

const Tag = ({ text, color = '#1a3a5c', bg = '#eef2f6' }) => (
  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 10.5, fontWeight: 700, color, background: bg }}>{text}</span>
);

const Metric = ({ label, value, sub, color = '#1a3a5c' }) => (
  <div style={{ background: 'white', borderRadius: 12, padding: '14px 16px', border: '1px solid #f0f0f0' }}>
    <div style={{ fontSize: 11, color: '#888', fontWeight: 600, letterSpacing: .4 }}>{label.toUpperCase()}</div>
    <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: 'Georgia, serif', marginTop: 4 }}>{value ?? '—'}</div>
    {sub && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{sub}</div>}
  </div>
);

const Bar = ({ value, max, color = '#27ae60' }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <div style={{ flex: 1, height: 7, background: '#eef1f4', borderRadius: 4, overflow: 'hidden', minWidth: 60 }}>
      <div style={{ width: `${max ? (value / max) * 100 : 0}%`, height: '100%', background: color, borderRadius: 4, transition: 'width .3s' }} />
    </div>
    <span style={{ fontSize: 12, fontWeight: 700, color: '#555', minWidth: 34, textAlign: 'right' }}>{value ?? 0}%</span>
  </div>
);

const classLabel = (c) => (c ? `${c.grade || ''} ${c.className || ''}`.trim() : '—');
const picker = (classes, value, onChange, includeAll) => (
  <Sel value={value} onChange={e => onChange(e.target.value)} style={{ width: 190 }}>
    {includeAll && <option value="">All classes</option>}
    {classes.map(c => <option key={c._id} value={c._id}>{classLabel(c)}</option>)}
  </Sel>
);

// ── Timetable ───────────────────────────────────────────────────────────────
export const TimetablePanel = ({ classes, teachers }) => {
  const [classId, setClassId] = useState('');
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ dayOfWeek: 1, period: 1, subject: '', teacherId: '', room: '', startTime: '', endTime: '' });

  const load = useCallback(() => {
    const qs = classId ? `?classId=${classId}` : '';
    return api(`/timetable${qs}`).then(d => setEntries(d.timetable || [])).catch(() => setEntries([]));
  }, [classId]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!classId) { alert('Pick a class first'); return; }
    if (!form.subject.trim()) { alert('Subject is required'); return; }
    setBusy(true);
    try {
      await api('/timetable', { method: 'POST', body: JSON.stringify({ ...form, classId, dayOfWeek: Number(form.dayOfWeek), period: Number(form.period) }) });
      setForm({ ...form, subject: '', room: '' });
      await load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    try { await api(`/timetable/${id}`, { method: 'DELETE' }); load(); } catch (e) { alert(e.message); }
  };

  const maxPeriod = entries.reduce((m, e) => Math.max(m, e.period), 0) || 8;
  const periods = Array.from({ length: Math.max(maxPeriod, 8) }, (_, i) => i + 1);

  return (
    <Panel
      title="Timetable"
      sub="Build the weekly schedule. The backend rejects a slot that clashes for the class or double-books a teacher, so you cannot save an impossible timetable."
      actions={<>{picker(classes, classId, setClassId)}</>}
    >
      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>DAY
            <Sel value={form.dayOfWeek} onChange={e => setForm({ ...form, dayOfWeek: e.target.value })} style={{ marginTop: 4, width: 150 }}>
              {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </Sel>
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>PERIOD
            <Inp type="number" min="1" max="12" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} style={{ marginTop: 4, width: 80 }} />
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>SUBJECT
            <Inp value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Mathematics" style={{ marginTop: 4, width: 170 }} />
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>TEACHER
            <Sel value={form.teacherId} onChange={e => setForm({ ...form, teacherId: e.target.value })} style={{ marginTop: 4, width: 170 }}>
              <option value="">— Unassigned —</option>
              {teachers.map(t => <option key={t._id} value={t._id}>{t.fullName}</option>)}
            </Sel>
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>ROOM
            <Inp value={form.room} onChange={e => setForm({ ...form, room: e.target.value })} placeholder="e.g. B12" style={{ marginTop: 4, width: 100 }} />
          </label>
          <Btn icon="fas fa-plus" onClick={add} disabled={busy}>Add slot</Btn>
          {classId && <Btn icon="fas fa-trash" color="#6c757d" small onClick={async () => {
            if (!confirm(`Remove every slot for this class timetable?`)) return;
            await api(`/timetable?classId=${classId}`, { method: 'DELETE' });
            load();
          }}>Clear all</Btn>}
        </div>
      </Card>

      <Card style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ padding: '9px', fontSize: 10.5, color: '#888', textAlign: 'left', width: 60 }}>PERIOD</th>
              {DAYS.map(d => <th key={d} style={{ padding: '9px', fontSize: 10.5, color: '#888', textAlign: 'left' }}>{d.toUpperCase()}</th>)}
            </tr>
          </thead>
          <tbody>
            {periods.map(p => (
              <tr key={p} style={{ borderBottom: '1px solid #f5f5f5' }}>
                <TD style={{ fontWeight: 700, color: '#999' }}>{p}</TD>
                {DAYS.map((_, di) => {
                  const e = entries.find(x => x.dayOfWeek === di + 1 && x.period === p);
                  return (
                    <td key={di} style={{ padding: '5px' }}>
                      {e ? (
                        <div style={{ background: '#eef4fb', borderLeft: '3px solid #3498db', borderRadius: 6, padding: '6px 8px' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#1a3a5c' }}>{e.subject}</div>
                          <div style={{ fontSize: 10.5, color: '#777' }}>{e.teacherName || 'Unassigned'}{e.room ? ` · ${e.room}` : ''}</div>
                          <button onClick={() => remove(e._id)} title="Remove" style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 10, padding: 0, marginTop: 2 }}><i className="fas fa-times" /></button>
                        </div>
                      ) : <div style={{ padding: '6px 8px', fontSize: 11, color: '#ddd' }}>—</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Panel>
  );
};

// ── Subject allocation ──────────────────────────────────────────────────────
export const SubjectAllocationPanel = ({ classes, teachers }) => {
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ subject: '', teacherId: '', periodsPerWeek: 4 });

  const load = useCallback(() => {
    const qs = classId ? `?classId=${classId}` : '';
    return api(`/subject-allocations${qs}`).then(d => setRows(d.allocations || [])).catch(() => setRows([]));
  }, [classId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!classId || !form.subject.trim()) { alert('Pick a class and enter a subject'); return; }
    try {
      await api('/subject-allocations', { method: 'POST', body: JSON.stringify({ ...form, classId, academicYear: String(new Date().getFullYear()) }) });
      setForm({ ...form, subject: '' });
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <Panel
      title="Subject Allocation"
      sub="Decide which teacher teaches which subject in which class. A class cannot have the same subject allocated twice."
      actions={<>{picker(classes, classId, setClassId, true)}</>}
    >
      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>SUBJECT
            <Inp value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Biology" style={{ marginTop: 4, width: 180 }} />
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>TEACHER
            <Sel value={form.teacherId} onChange={e => setForm({ ...form, teacherId: e.target.value })} style={{ marginTop: 4, width: 180 }}>
              <option value="">— Unassigned —</option>
              {teachers.map(t => <option key={t._id} value={t._id}>{t.fullName}</option>)}
            </Sel>
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>PERIODS / WEEK
            <Inp type="number" min="0" value={form.periodsPerWeek} onChange={e => setForm({ ...form, periodsPerWeek: e.target.value })} style={{ marginTop: 4, width: 120 }} />
          </label>
          <Btn icon="fas fa-plus" onClick={add}>Allocate</Btn>
        </div>
      </Card>

      <Table
        cols={['Class', 'Subject', 'Teacher', 'Periods/week', '']}
        rows={rows.map(a => (
          <tr key={a._id}>
            <TD>{a.className || '—'}</TD>
            <TD style={{ fontWeight: 600 }}>{a.subject}</TD>
            <TD>{a.teacherName || <Tag text="Unassigned" color="#b8860b" bg="#fff8e1" />}</TD>
            <TD>{a.periodsPerWeek}</TD>
            <TD>
              <Btn small danger icon="fas fa-trash" onClick={async () => {
                if (!confirm(`Remove ${a.subject} from this class?`)) return;
                await api(`/subject-allocations/${a._id}`, { method: 'DELETE' });
                load();
              }} />
            </TD>
          </tr>
        ))}
        empty={classId ? 'No subjects allocated for this class yet' : 'Pick a class to see its allocations'}
      />
    </Panel>
  );
};

// ── Exams ───────────────────────────────────────────────────────────────────
export const ExamsPanel = ({ classes }) => {
  const [exams, setExams] = useState([]);
  const [term, setTerm] = useState(TERMS[0]);
  const [year, setYear] = useState(YEARS[0]);
  const [form, setForm] = useState({ name: '', type: 'Midterm', weight: 20, maxScore: 100, examDate: '', instructions: '', classIds: [] });
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api(`/exams?term=${term}&year=${year}`).then(d => setExams(d.exams || [])).catch(() => setExams([])),
    [term, year]
  );
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim()) { alert('Exam name is required'); return; }
    setBusy(true);
    try {
      await api('/exams', {
        method: 'POST',
        body: JSON.stringify({ ...form, term, year: Number(year), classIds: form.classIds, examDate: form.examDate || undefined })
      });
      setForm({ ...form, name: '', instructions: '' });
      load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  const totalWeight = exams.filter(e => e.isPublished).reduce((a, e) => a + (e.weight || 0), 0);

  return (
    <Panel
      title="Exams & Weighting"
      sub="Set the weight of each assessment type. The weighted total is what feeds report cards, so the published weights should add up to 100."
      actions={
        <>
          <Sel value={term} onChange={e => setTerm(e.target.value)} style={{ width: 120 }}>
            {TERMS.map(t => <option key={t}>{t}</option>)}
          </Sel>
          <Sel value={year} onChange={e => setYear(e.target.value)} style={{ width: 110 }}>{YEARS.map(y => <option key={y}>{y}</option>)}</Sel>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 18 }}>
        <Metric label="Exams" value={exams.length} />
        <Metric label="Published weight" value={`${totalWeight}%`} sub={totalWeight === 100 ? 'Balanced' : 'Should total 100%'} color={totalWeight === 100 ? '#27ae60' : '#e67e22'} />
        <Metric label="Classes covered" value={new Set(exams.flatMap(e => e.classIds || []).map(String)).size} />
      </div>

      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>NAME
            <Inp value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Term 1 Midterm" style={{ marginTop: 4, width: 190 }} />
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>TYPE
            <Sel value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={{ marginTop: 4, width: 120 }}>
              {EXAM_TYPES.map(t => <option key={t}>{t}</option>)}
            </Sel>
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>WEIGHT %
            <Inp type="number" min="0" max="100" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} style={{ marginTop: 4, width: 90 }} />
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>MAX SCORE
            <Inp type="number" min="1" value={form.maxScore} onChange={e => setForm({ ...form, maxScore: e.target.value })} style={{ marginTop: 4, width: 100 }} />
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>DATE
            <Inp type="date" value={form.examDate} onChange={e => setForm({ ...form, examDate: e.target.value })} style={{ marginTop: 4, width: 150 }} />
          </label>
          <Btn icon="fas fa-plus" onClick={create} disabled={busy}>Create exam</Btn>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 6 }}>CLASSES THIS EXAM COVERS</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {classes.map(c => {
              const on = form.classIds.includes(c._id);
              return (
                <button key={c._id} onClick={() => setForm({
                  ...form,
                  classIds: on ? form.classIds.filter(id => id !== c._id) : [...form.classIds, c._id]
                })} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1.5px solid ${on ? '#1a3a5c' : '#e0e0e0'}`, background: on ? '#1a3a5c' : 'white', color: on ? 'white' : '#666'
                }}>{classLabel(c)}</button>
              );
            })}
          </div>
        </div>
      </Card>

      <Table
        cols={['Name', 'Type', 'Weight', 'Max', 'Date', 'Status', '']}
        rows={exams.map(e => (
          <tr key={e._id}>
            <TD style={{ fontWeight: 600 }}>{e.name}</TD>
            <TD><Tag text={e.type} /></TD>
            <TD>{e.weight}%</TD>
            <TD>{e.maxScore}</TD>
            <TD>{e.examDate ? new Date(e.examDate).toLocaleDateString('en-RW') : '—'}</TD>
            <TD>{e.isPublished ? <Tag text="Published" color="#27ae60" bg="#e8f5e9" /> : <Tag text="Draft" color="#888" bg="#f0f0f0" />}</TD>
            <TD style={{ whiteSpace: 'nowrap' }}>
              <Btn small color={e.isPublished ? '#6c757d' : '#27ae60'} onClick={async () => {
                await api(`/exams/${e._id}`, { method: 'PUT', body: JSON.stringify({ isPublished: !e.isPublished }) });
                load();
              }}>{e.isPublished ? 'Unpublish' : 'Publish'}</Btn>{' '}
              <Btn small danger icon="fas fa-trash" onClick={async () => {
                if (!confirm(`Delete ${e.name}?`)) return;
                await api(`/exams/${e._id}`, { method: 'DELETE' });
                load();
              }} />
            </TD>
          </tr>
        ))}
        empty="No exams set for this term yet"
      />
    </Panel>
  );
};

// ── Report cards ────────────────────────────────────────────────────────────
export const ReportCardsPanel = ({ classes }) => {
  const [classId, setClassId] = useState('');
  const [term, setTerm] = useState(TERMS[0]);
  const [year, setYear] = useState(YEARS[0]);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    const qs = `?term=${term}&year=${year}${classId ? `&classId=${classId}` : ''}`;
    api(`/report-cards${qs}`).then(d => setData(d)).catch(() => setData(null));
  }, [classId, term, year]);

  return (
    <Panel
      title="Report Cards"
      sub="Class ranking, GPA, subject averages and attendance for a term. The print view is a single page per student, ready to print or save as PDF."
      actions={
        <>
          {picker(classes, classId, setClassId, true)}
          <Sel value={term} onChange={e => setTerm(e.target.value)} style={{ width: 110 }}>{TERMS.map(t => <option key={t}>{t}</option>)}</Sel>
          <Sel value={year} onChange={e => setYear(e.target.value)} style={{ width: 100 }}>{YEARS.map(y => <option key={y}>{y}</option>)}</Sel>
          <Btn small icon="fas fa-print" color="#6c757d" onClick={() => window.print()}>Print list</Btn>
        </>
      }
    >
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 18 }}>
          <Metric label="Students" value={data.count} />
          <Metric label="Grading" value={data.weighted ? 'Weighted' : 'Simple average'} sub={data.weighted ? 'Using exam weights' : 'No exam weights set'} />
          <Metric label="Class average" value={data.reportCards?.length ? Math.round(data.reportCards.reduce((a, r) => a + r.average, 0) / data.reportCards.length) : 0} />
          <Metric label="Average attendance" value={`${data.reportCards?.length ? Math.round(data.reportCards.reduce((a, r) => a + r.attendanceRate, 0) / data.reportCards.length) : 0}%`} />
        </div>
      )}

      <Table
        cols={['Pos', 'Student', 'Class', 'Subjects', 'Average', 'Grade', 'GPA', 'Attendance', '']}
        rows={(data?.reportCards || []).map(r => (
          <tr key={r.studentId}>
            <TD style={{ fontWeight: 700, color: '#b8930a' }}>{r.position}</TD>
            <TD style={{ fontWeight: 600 }}>{r.name}</TD>
            <TD>{r.className}</TD>
            <TD>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {r.subjects.slice(0, 4).map(s => <Tag key={s.subject} text={`${s.subject} ${s.average}`} bg="#f4f6f8" color="#555" />)}
                {r.subjects.length > 4 && <Tag text={`+${r.subjects.length - 4}`} bg="#f4f6f8" color="#555" />}
              </div>
            </TD>
            <TD style={{ fontWeight: 700 }}>{r.average}</TD>
            <TD><Tag text={r.grade} color="#fff" bg={r.average >= 70 ? '#27ae60' : r.average >= 50 ? '#f39c12' : '#e74c3c'} /></TD>
            <TD>{r.gpa}</TD>
            <TD style={{ minWidth: 110 }}><Bar value={r.attendanceRate} color={r.attendanceRate >= 80 ? '#27ae60' : '#e67e22'} /></TD>
            <TD>
              <Btn small icon="fas fa-eye" onClick={() => setOpen(r)}>View</Btn>{' '}
              <Btn
                small
                icon="fas fa-file-pdf"
                color="#e74c3c"
                onClick={async () => {
                  try {
                    await openPrintableDocument(
                      `/report-cards/${r.studentId}/print?term=${term}&year=${year}`,
                      API_URL,
                      `Report Card — ${r.fullName || r.studentName || ''}`.trim()
                    );
                  } catch (e) {
                    Swal.fire('Cannot print', e.message || 'The report card could not be opened', 'error');
                  }
                }}
              >PDF</Btn>
            </TD>
          </tr>
        ))}
        empty="No graded results for this term yet"
      />

      {open && (
        <div onClick={() => setOpen(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, maxWidth: 640, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontFamily: 'Georgia, serif', color: '#1a3a5c' }}>{open.name}</h3>
                <div style={{ fontSize: 12, color: '#888' }}>{open.className} · {term} {year} · Position {open.position}</div>
              </div>
              <Btn small icon="fas fa-times" color="#6c757d" onClick={() => setOpen(null)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 18 }}>
              <Metric label="Average" value={open.average} />
              <Metric label="GPA" value={open.gpa} />
              <Metric label="Attendance" value={`${open.attendanceRate}%`} />
            </div>
            <Table
              cols={['Subject', 'Average', 'Grade']}
              rows={open.subjects.map(s => <tr key={s.subject}><TD style={{ fontWeight: 600 }}>{s.subject}</TD><TD>{s.average}</TD><TD><Tag text={s.grade} /></TD></tr>)}
            />
          </div>
        </div>
      )}
    </Panel>
  );
};

// ── Promotion ───────────────────────────────────────────────────────────────
export const PromotionPanel = ({ classes }) => {
  const [fromClassId, setFromClassId] = useState('');
  const [toClassId, setToClassId] = useState('');
  const [term, setTerm] = useState(TERMS[0]);
  const [year, setYear] = useState(YEARS[0]);
  const [minAverage, setMinAverage] = useState('');
  const [maxAverage, setMaxAverage] = useState('');
  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);

  const loadHistory = useCallback(
    () => api(`/enrollment-changes?year=${year}`).then(d => setHistory(d.changes || [])).catch(() => setHistory([])),
    [year]
  );
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const body = () => ({ fromClassId, toClassId, term, year: Number(year), minAverage, maxAverage });

  const runPreview = async () => {
    if (!fromClassId || !toClassId) { alert('Pick both a source and a target class'); return; }
    try {
      const d = await api('/enrollment-changes/promote/preview', { method: 'POST', body: JSON.stringify(body()) });
      setPreview(d);
    } catch (e) { alert(e.message); }
  };

  const commit = async () => {
    if (!preview) return;
    if (!confirm(`Promote ${preview.promote} student(s) from ${preview.from} to ${preview.to}? ${preview.retain} will be retained.`)) return;
    setBusy(true);
    try {
      const d = await api('/enrollment-changes/promote', { method: 'POST', body: JSON.stringify(body()) });
      setPreview(null);
      loadHistory();
      alert(`Promoted ${d.promoted}, retained ${d.retained}`);
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <Panel
      title="Promotion & Demotion"
      sub="Move a whole class up a grade at once. Preview first: you see exactly who moves and who is held back before anything changes. Students with no recorded average are promoted by default."
      actions={
        <>
          <Sel value={term} onChange={e => setTerm(e.target.value)} style={{ width: 110 }}>{TERMS.map(t => <option key={t}>{t}</option>)}</Sel>
          <Sel value={year} onChange={e => setYear(e.target.value)} style={{ width: 100 }}>{YEARS.map(y => <option key={y}>{y}</option>)}</Sel>
        </>
      }
    >
      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>FROM
            <Sel value={fromClassId} onChange={e => { setFromClassId(e.target.value); setPreview(null); }} style={{ marginTop: 4, width: 170 }}>
              <option value="">— Select —</option>
              {classes.map(c => <option key={c._id} value={c._id}>{classLabel(c)}</option>)}
            </Sel>
          </label>
          <i className="fas fa-arrow-right" style={{ color: '#ccc', marginBottom: 10 }} />
          <label style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>TO
            <Sel value={toClassId} onChange={e => { setToClassId(e.target.value); setPreview(null); }} style={{ marginTop: 4, width: 170 }}>
              <option value="">— Select —</option>
              {classes.filter(c => c._id !== fromClassId).map(c => <option key={c._id} value={c._id}>{classLabel(c)}</option>)}
            </Sel>
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>MIN AVG
            <Inp type="number" value={minAverage} onChange={e => setMinAverage(e.target.value)} placeholder="e.g. 50" style={{ marginTop: 4, width: 95 }} />
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#666' }}>MAX AVG
            <Inp type="number" value={maxAverage} onChange={e => setMaxAverage(e.target.value)} placeholder="e.g. 100" style={{ marginTop: 4, width: 95 }} />
          </label>
          <Btn icon="fas fa-eye" color="#3498db" onClick={runPreview}>Preview</Btn>
          {preview && <Btn icon="fas fa-check" color="#27ae60" onClick={commit} disabled={busy}>Promote {preview.promote}</Btn>}
        </div>
      </Card>

      {preview && (
        <Card style={{ marginBottom: 18, borderLeft: '3px solid #3498db' }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <Metric label="Will promote" value={preview.promote} color="#27ae60" />
            <Metric label="Will retain" value={preview.retain} color="#e67e22" />
            <Metric label="Target size now" value={preview.targetSize} />
            <Metric label="Size after" value={preview.targetSize + preview.promote} sub={preview.capacityDelta ? `${preview.capacityDelta > 0 ? '+' : ''}${preview.capacityDelta}` : ''} />
          </div>
          <Table
            cols={['Student', 'Code', 'Average', 'Outcome']}
            rows={preview.rows.map(r => (
              <tr key={r.studentId}>
                <TD style={{ fontWeight: 600 }}>{r.name}</TD>
                <TD>{r.studentCode}</TD>
                <TD>{r.average ?? '—'}</TD>
                <TD>{r.outcome === 'promoted'
                  ? <Tag text="Promote" color="#27ae60" bg="#e8f5e9" />
                  : <Tag text="Retain" color="#e67e22" bg="#fff3e0" />}</TD>
              </tr>
            ))}
          />
        </Card>
      )}

      <h3 style={{ fontSize: 14, color: '#1a3a5c', fontFamily: 'Georgia, serif', margin: '0 0 10px' }}>Enrollment history ({year})</h3>
      <Table
        cols={['Date', 'Student', 'From', 'To', 'Outcome', 'Average', 'By']}
        rows={history.map(h => (
          <tr key={h._id}>
            <TD>{new Date(h.createdAt).toLocaleDateString('en-RW')}</TD>
            <TD style={{ fontWeight: 600 }}>{h.studentName}</TD>
            <TD>{h.fromClassName || '—'}</TD>
            <TD>{h.toClassName || '—'}</TD>
            <TD>
              <Tag
                text={h.outcome}
                color={h.outcome === 'promoted' ? '#27ae60' : h.outcome === 'retained' ? '#e67e22' : h.outcome === 'graduated' ? '#3498db' : '#888'}
                bg={h.outcome === 'promoted' ? '#e8f5e9' : h.outcome === 'retained' ? '#fff3e0' : '#f4f6f8'}
              />
            </TD>
            <TD>{h.averageScore ?? '—'}</TD>
            <TD>{h.performedByName || '—'}</TD>
          </tr>
        ))}
        empty="No enrollment changes recorded for this year"
      />
    </Panel>
  );
};

// ── Analytics ───────────────────────────────────────────────────────────────
export const AnalyticsPanel = ({ classes }) => {
  const [classId, setClassId] = useState('');
  const [attendance, setAttendance] = useState(null);
  const [comparison, setComparison] = useState([]);
  const [risk, setRisk] = useState([]);
  const [term, setTerm] = useState(TERMS[0]);
  const [year, setYear] = useState(YEARS[0]);

  useEffect(() => {
    const qs = classId ? `?classId=${classId}` : '';
    api(`/attendance-overview${qs}`).then(setAttendance).catch(() => setAttendance(null));
    api(`/performance-comparison${qs}`).then(d => setComparison(d.comparison || [])).catch(() => setComparison([]));
  }, [classId]);

  useEffect(() => {
    api(`/at-risk-students?term=${term}&year=${year}`).then(d => setRisk(d.students || [])).catch(() => setRisk([]));
  }, [term, year]);

  const maxDaily = attendance ? Math.max(...attendance.daily.map(d => d.total), 1) : 1;

  return (
    <Panel
      title="Attendance & Performance"
      sub="Where absence concentrates, which classes are trending up or down across terms, and the students failing on both attendance and grades."
      actions={
        <>
          {picker(classes, classId, setClassId, true)}
          <Sel value={term} onChange={e => setTerm(e.target.value)} style={{ width: 110 }}>{TERMS.map(t => <option key={t}>{t}</option>)}</Sel>
          <Sel value={year} onChange={e => setYear(e.target.value)} style={{ width: 100 }}>{YEARS.map(y => <option key={y}>{y}</option>)}</Sel>
        </>
      }
    >
      {attendance && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 18 }}>
            <Metric label="Attendance rate" value={`${attendance.summary.rate}%`} sub={`${attendance.summary.schoolDays} school days`} color={attendance.summary.rate >= 90 ? '#27ae60' : '#e67e22'} />
            <Metric label="Present" value={attendance.summary.present} color="#27ae60" />
            <Metric label="Absent" value={attendance.summary.absent} color="#e74c3c" />
            <Metric label="At-risk students" value={risk.length} color={risk.length ? '#e74c3c' : '#27ae60'} sub={term} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 18, marginBottom: 18 }}>
            <Card>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>Daily attendance (last 30 days)</h3>
              {attendance.daily.length === 0
                ? <p style={{ fontSize: 13, color: '#bbb' }}>No attendance recorded in this period.</p>
                : (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 130, overflowX: 'auto' }}>
                    {attendance.daily.map(d => {
                      const absentH = (d.absent / maxDaily) * 110;
                      const presentH = (d.present / maxDaily) * 110;
                      return (
                        <div key={d.date} title={`${d.date}: ${d.present}/${d.total} present`} style={{ display: 'flex', flexDirection: 'column', minWidth: 14 }}>
                          <div style={{ height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                            <div style={{ height: absentH, background: '#e74c3c', borderRadius: '2px 2px 0 0' }} />
                            <div style={{ height: presentH, background: '#27ae60' }} />
                          </div>
                          <div style={{ fontSize: 8, color: '#aaa', textAlign: 'center', marginTop: 3 }}>{d.date.slice(8)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </Card>

            <Card>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>Attendance by class (weakest first)</h3>
              {attendance.byClass.length === 0
                ? <p style={{ fontSize: 13, color: '#bbb' }}>No data.</p>
                : attendance.byClass.map(c => (
                  <div key={c.classId} style={{ marginBottom: 9 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 3 }}>{c.className} <span style={{ color: '#aaa', fontWeight: 400 }}>({c.absent} absent)</span></div>
                    <Bar value={c.rate} color={c.rate >= 90 ? '#27ae60' : c.rate >= 75 ? '#f39c12' : '#e74c3c'} />
                  </div>
                ))}
            </Card>
          </div>

          {attendance.chronicAbsentees.length > 0 && (
            <Card style={{ marginBottom: 18 }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 14, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>Most absent</h3>
              <Table
                cols={['Student', 'Code', 'Class', 'Absences']}
                rows={attendance.chronicAbsentees.map(s => (
                  <tr key={s._id}>
                    <TD style={{ fontWeight: 600 }}>{s.name}</TD>
                    <TD>{s.studentCode}</TD>
                    <TD>{s.className}</TD>
                    <TD><Tag text={s.absences} color="#fff" bg={s.absences >= 5 ? '#e74c3c' : '#f39c12'} /></TD>
                  </tr>
                ))}
              />
            </Card>
          )}
        </>
      )}

      <Card style={{ marginBottom: 18 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>Term-over-term change</h3>
        {comparison.length === 0
          ? <p style={{ fontSize: 13, color: '#bbb' }}>No graded results to compare yet.</p>
          : comparison.map(c => (
            <div key={c.classId} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 0', borderBottom: '1px solid #f5f5f5' }}>
              <div style={{ width: 130, fontSize: 13, fontWeight: 600, color: '#1a3a5c' }}>{c.className}</div>
              <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {c.series.map((s, i) => (
                  <Tag key={i} text={`${s.term} ${s.year}: ${s.average}`} bg="#f4f6f8" color="#555" />
                ))}
              </div>
              <Tag
                text={`${c.change > 0 ? '+' : ''}${c.change}`}
                color={c.direction === 'up' ? '#27ae60' : c.direction === 'down' ? '#e74c3c' : '#888'}
                bg={c.direction === 'up' ? '#e8f5e9' : c.direction === 'down' ? '#fdecea' : '#f0f0f0'}
              />
            </div>
          ))}
      </Card>

      <Card>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>At-risk students · {term} {year}</h3>
        <Table
          cols={['Student', 'Code', 'Class', 'Attendance', 'Average', 'Severity', 'Why']}
          rows={risk.map(s => (
            <tr key={s._id}>
              <TD style={{ fontWeight: 600 }}>{s.name}</TD>
              <TD>{s.studentCode}</TD>
              <TD>{s.className}</TD>
              <TD style={{ minWidth: 110 }}>{s.attendanceRate !== null ? <Bar value={s.attendanceRate} color={s.attendanceRate >= 80 ? '#27ae60' : '#e67e22'} /> : '—'}</TD>
              <TD style={{ fontWeight: 700 }}>{s.average ?? '—'}</TD>
              <TD><Tag text={s.severity} color="#fff" bg={s.severity === 'high' ? '#e74c3c' : '#f39c12'} /></TD>
              <TD style={{ fontSize: 12, color: '#777' }}>{s.reasons.join(' · ')}</TD>
            </tr>
          ))}
          empty="No students are currently at risk"
        />
      </Card>
    </Panel>
  );
};

// ── Lesson plan review ──────────────────────────────────────────────────────
export const LessonReviewPanel = () => {
  const [plans, setPlans] = useState([]);
  const [counts, setCounts] = useState({});
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState({});

  const load = useCallback(
    () => api(`/lesson-plans${status ? `?status=${status}` : ''}`).then(d => { setPlans(d.lessonPlans || []); setCounts(d.counts || {}); }).catch(() => setPlans([])),
    [status]
  );
  useEffect(() => { load(); }, [load]);

  const review = async (id, decision) => {
    if (decision === 'rejected' && !notes[id]) {
      alert('Give a reason before rejecting — the teacher needs to know what to fix');
      return;
    }
    try {
      await api(`/lesson-plans/${id}/review`, { method: 'PUT', body: JSON.stringify({ decision, reviewNotes: notes[id] || '' }) });
      load();
    } catch (e) { alert(e.message); }
  };

  const pending = counts.submitted || 0;

  return (
    <Panel
      title="Lesson Plan Review"
      sub="Teachers submit plans for approval. Rejections require a written reason so the feedback is actionable rather than a silent no."
      actions={
        <>
          <Sel value={status} onChange={e => setStatus(e.target.value)} style={{ width: 150 }}>
            <option value="">All statuses</option>
            {['draft', 'submitted', 'approved', 'rejected'].map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </Sel>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12, marginBottom: 18 }}>
        <Metric label="Awaiting review" value={pending} color={pending ? '#e67e22' : '#27ae60'} />
        <Metric label="Approved" value={counts.approved || 0} color="#27ae60" />
        <Metric label="Rejected" value={counts.rejected || 0} color="#e74c3c" />
        <Metric label="Draft" value={counts.draft || 0} color="#888" />
      </div>

      {plans.length === 0
        ? <Card><p style={{ fontSize: 13, color: '#bbb', margin: 0, textAlign: 'center', padding: 20 }}>No lesson plans match this filter.</p></Card>
        : plans.map(p => (
          <Card key={p._id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1a3a5c' }}>{p.title}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {p.subject || 'No subject'} · {p.className || 'No class'} · {p.teacherName || 'Unknown teacher'}
                  {p.week ? ` · ${p.week}` : ''}
                </div>
              </div>
              <Tag
                text={p.status}
                color={p.status === 'approved' ? '#27ae60' : p.status === 'rejected' ? '#e74c3c' : p.status === 'submitted' ? '#e67e22' : '#888'}
                bg={p.status === 'approved' ? '#e8f5e9' : p.status === 'rejected' ? '#fdecea' : p.status === 'submitted' ? '#fff3e0' : '#f0f0f0'}
              />
            </div>
            {p.objectives && <p style={{ fontSize: 13, color: '#555', margin: '0 0 8px', lineHeight: 1.5 }}>{p.objectives}</p>}
            {p.reviewNotes && (
              <p style={{ fontSize: 12, color: '#777', background: '#f8f9fb', padding: '8px 11px', borderRadius: 7, margin: '0 0 8px' }}>
                <b>Review note:</b> {p.reviewNotes}
                {p.reviewedByName ? ` — ${p.reviewedByName}` : ''}
              </p>
            )}
            {(p.status === 'submitted' || p.status === 'draft') && (
              <>
                <Inp
                  placeholder="Review notes (required to reject)"
                  value={notes[p._id] || ''}
                  onChange={e => setNotes({ ...notes, [p._id]: e.target.value })}
                  style={{ marginBottom: 8 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn small icon="fas fa-check" color="#27ae60" onClick={() => review(p._id, 'approved')}>Approve</Btn>
                  <Btn small icon="fas fa-times" color="#e74c3c" onClick={() => review(p._id, 'rejected')}>Reject</Btn>
                </div>
              </>
            )}
          </Card>
        ))}
    </Panel>
  );
};

// ── SDMS codes ──────────────────────────────────────────────────────────────
export const SdmsPanel = ({ classes }) => {
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState([]);
  const [issued, setIssued] = useState({});

  const load = useCallback(
    () => api(`/sdms-codes${classId ? `?classId=${classId}` : ''}`).then(d => setRows(d.students || [])).catch(() => setRows([])),
    [classId]
  );
  useEffect(() => { load(); }, [load]);

  const issue = async (id, resetPassword) => {
    try {
      const d = await api(`/sdms-codes/${id}`, { method: 'POST', body: JSON.stringify({ resetPassword }) });
      setIssued({ ...issued, [id]: d.sdmsCode });
      load();
    } catch (e) { alert(e.message); }
  };

  const revoke = async (id) => {
    if (!confirm('Revoke this code? The student will not be able to log in until a new one is issued.')) return;
    await api(`/sdms-codes/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <Panel
      title="SDMS Login Codes"
      sub="Each student signs in with a code instead of a shared password. Reissuing a code also resets the account password, so a lost slip is not a permanent way in."
      actions={<>{picker(classes, classId, setClassId, true)}</>}
    >
      <Table
        cols={['Student', 'Code', 'Class', 'Issued', 'First login', 'Status', '']}
        rows={rows.map(s => (
          <tr key={s._id}>
            <TD style={{ fontWeight: 600 }}>
              {s.fullName}
              <div style={{ fontSize: 11, color: '#999', fontWeight: 400 }}>{s.studentId}</div>
            </TD>
            <TD>
              {issued[s._id] || s.sdmsCode
                ? <code style={{ background: '#f4f6f8', padding: '3px 8px', borderRadius: 5, fontSize: 12.5, letterSpacing: 1, fontWeight: 700, color: '#1a3a5c' }}>{issued[s._id] || s.sdmsCode}</code>
                : <Tag text="Not issued" color="#e74c3c" bg="#fdecea" />}
            </TD>
            <TD>{s.classId ? classLabel(s.classId) : '—'}</TD>
            <TD>{s.sdmsCodeIssuedAt ? new Date(s.sdmsCodeIssuedAt).toLocaleDateString('en-RW') : '—'}</TD>
            <TD>{s.firstLoginAt ? new Date(s.firstLoginAt).toLocaleDateString('en-RW') : 'Never'}</TD>
            <TD>{s.isActive ? <Tag text="Active" color="#27ae60" bg="#e8f5e9" /> : <Tag text="Inactive" color="#888" bg="#f0f0f0" />}</TD>
            <TD style={{ whiteSpace: 'nowrap' }}>
              <Btn small icon={s.sdmsCode ? 'fas fa-redo' : 'fas fa-plus'} color={s.sdmsCode ? '#6c757d' : '#27ae60'} onClick={() => issue(s._id, !!s.sdmsCode)}>
                {s.sdmsCode ? 'Reissue' : 'Issue'}
              </Btn>{' '}
              {s.sdmsCode && <Btn small danger icon="fas fa-ban" onClick={() => revoke(s._id)}>Revoke</Btn>}
            </TD>
          </tr>
        ))}
        empty="No students found"
      />
    </Panel>
  );
};
