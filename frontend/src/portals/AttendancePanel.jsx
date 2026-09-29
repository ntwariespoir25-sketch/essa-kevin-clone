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

const STATUSES = [
  { value: 'present', label: 'Present', short: 'P', color: '#1e8449', bg: '#e8f8ee' },
  { value: 'absent', label: 'Absent', short: 'A', color: '#c0392b', bg: '#fdeeec' },
  { value: 'late', label: 'Late', short: 'L', color: '#b9770e', bg: '#fdf6e3' },
  { value: 'excused', label: 'Excused', short: 'E', color: '#2874a6', bg: '#eaf4fc' },
  { value: 'halfDay', label: 'Half Day', short: 'H', color: '#6c3483', bg: '#f4ecf7' }
];

const statusMeta = (value) => STATUSES.find(s => s.value === value) || null;

const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const rateColor = (rate) => {
  if (rate === null || rate === undefined) return '#bbb';
  if (rate >= 90) return '#1e8449';
  if (rate >= 75) return '#2874a6';
  if (rate >= 60) return '#b9770e';
  return '#c0392b';
};

// One student row in the register. The status buttons are exclusive, so a
// mis-tap replaces the previous mark rather than needing a separate clear step.
const RegisterRow = ({ student, status, onSet }) => (
  <tr style={{ borderBottom: '1px solid #f5f5f5', background: status ? 'white' : '#fffdf5' }}>
    <td style={{ padding: '9px 12px', fontSize: 13, color: '#1a3a5c', fontWeight: 600 }}>
      {student.fullName}
      <div style={{ fontSize: 10, color: '#aaa', fontWeight: 400 }}>{student.code}</div>
    </td>
    <td style={{ padding: '9px 12px' }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {STATUSES.map(s => {
          const on = status === s.value;
          return (
            <button
              key={s.value}
              onClick={() => onSet(on ? null : s.value)}
              title={s.label}
              style={{
                width: 30, height: 28, borderRadius: 6, cursor: 'pointer',
                border: `1.5px solid ${on ? s.color : '#e0e0e0'}`,
                background: on ? s.bg : 'white',
                color: on ? s.color : '#aaa',
                fontSize: 12, fontWeight: 700, fontFamily: 'inherit'
              }}
            >{s.short}</button>
          );
        })}
      </div>
    </td>
    <td style={{ padding: '9px 12px', fontSize: 11, color: status ? '#666' : '#e0a800' }}>
      {status ? (statusMeta(status) || {}).label : 'Not marked'}
    </td>
  </tr>
);

export const AttendancePanel = () => {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(todayISO());

  const [register, setRegister] = useState(null);
  const [marks, setMarks] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // analytics
  const [range, setRange] = useState({ from: '', to: '' });
  const [analytics, setAnalytics] = useState(null);
  const [threshold, setThreshold] = useState(75);
  const [anLoading, setAnLoading] = useState(false);

  useEffect(() => {
    api('/academic-admin/classes')
      .then(d => {
        const list = Array.isArray(d) ? d : [];
        setClasses(list);
        if (list.length) {
          setClassId(prev => prev || list[0]._id);
          const now = new Date();
          const start = new Date(now.getFullYear(), now.getMonth(), 1);
          const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
          setRange(prev => (prev.from ? prev : { from: iso(start), to: iso(end) }));
        }
      })
      .catch(() => setClasses([]));
  }, []);

  const loadRegister = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ classId, date });
      const d = await api(`/teacher/attendance/register?${q.toString()}`);
      setRegister(d);
      // Seed from stored marks so correcting a day's register opens on the
      // existing values instead of blank cells.
      const seeded = {};
      (d.students || []).forEach(s => { seeded[s.studentId] = s.status; });
      setMarks(seeded);
    } catch (e) {
      setRegister(null);
      Swal.fire('Error', e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [classId, date]);

  useEffect(() => { loadRegister(); }, [loadRegister]);

  const setStatus = (studentId, value) => setMarks(p => ({ ...p, [studentId]: value }));

  const save = async () => {
    if (!classId) return;
    const records = Object.entries(marks)
      .map(([studentId, status]) => ({ studentId, status }))
      .filter(r => r.status);
    if (!records.length) {
      return Swal.fire('Nothing to save', 'Mark at least one student before saving.', 'warning');
    }
    setSaving(true);
    try {
      await api('/teacher/attendance', {
        method: 'POST',
        body: JSON.stringify({ classId, date, records })
      });
      await Swal.fire('Attendance saved', `${records.length} student(s) recorded for ${date}.`, 'success');
      loadRegister();
    } catch (e) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const markAllPresent = () => {
    const next = {};
    (register?.students || []).forEach(s => { next[s.studentId] = marks[s.studentId] || 'present'; });
    setMarks(next);
  };

  const clearAll = () => {
    const next = {};
    (register?.students || []).forEach(s => { next[s.studentId] = null; });
    setMarks(next);
  };

  const loadAnalytics = useCallback(async () => {
    if (!classId || !range.from || !range.to) return;
    setAnLoading(true);
    try {
      const q = new URLSearchParams({ classId, from: range.from, to: range.to, threshold: String(threshold) });
      setAnalytics(await api(`/teacher/attendance/analytics?${q.toString()}`));
    } catch (e) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      setAnLoading(false);
    }
  }, [classId, range.from, range.to, threshold]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  const students = (register && register.students) || [];
  const unmarked = students.filter(s => !marks[s.studentId]).length;
  const counts = STATUSES.map(s => ({
    ...s,
    n: students.filter(x => marks[x.studentId] === s.value).length
  })).filter(s => s.n > 0);

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 19, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>Attendance</h2>
        <p style={{ margin: '3px 0 0', fontSize: 12, color: '#888' }}>Daily register and chronic-absence reporting</p>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#888', marginBottom: 4 }}>CLASS</label>
          <select value={classId} onChange={e => setClassId(e.target.value)} style={{ padding: '8px 11px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', minWidth: 170 }}>
            {classes.length === 0 && <option value="">No classes assigned</option>}
            {classes.map(c => <option key={c._id} value={c._id}>{c.grade} {c.className}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#888', marginBottom: 4 }}>DATE</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: '8px 11px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={markAllPresent} style={{ background: '#f0f0f0', color: '#666', border: 'none', borderRadius: 8, padding: '8px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>All Present</button>
          <button onClick={clearAll} style={{ background: '#f0f0f0', color: '#666', border: 'none', borderRadius: 8, padding: '8px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Clear</button>
          <button onClick={save} disabled={saving || !classId} style={{ background: saving || !classId ? '#ccc' : '#f39c12', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : 'Save Register'}
          </button>
        </div>
      </div>

      {unmarked > 0 && students.length > 0 && (
        <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderLeft: '4px solid #ffc107', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#7a5c00', marginBottom: 14 }}>
          {unmarked} of {students.length} students not marked yet. Unmarked rows are left out of the day's record
          rather than being saved as absent.
        </div>
      )}

      {counts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {counts.map(c => (
            <span key={c.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: c.color, background: c.bg }}>
              {c.label}: {c.n}
            </span>
          ))}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 30, color: '#aaa', fontSize: 13 }}>Loading register…</div>}

      {!loading && (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #f0f0f0', background: 'white' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead>
              <tr style={{ background: '#f7f9fb' }}>
                {['Student', 'Mark', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: .6, borderBottom: '1px solid #eee' }}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', padding: 36, color: '#bbb', fontSize: 13 }}>No students in this class yet.</td></tr>
              ) : students.map(s => (
                <RegisterRow key={s.studentId} student={s} status={marks[s.studentId]} onSet={v => setStatus(s.studentId, v)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10, fontSize: 11, color: '#999', flexWrap: 'wrap' }}>
        {STATUSES.map(s => (
          <span key={s.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 16, height: 16, borderRadius: 4, background: s.bg, color: s.color, fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{s.short}</span>
            {s.label}
          </span>
        ))}
        <span style={{ marginLeft: 8 }}>· click a marked button again to clear it</span>
      </div>

      {/* ══ ANALYTICS ══ */}
      <div style={{ marginTop: 34, paddingTop: 24, borderTop: '1px solid #eee' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>Attendance Analytics</h3>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#888' }}>Chronic absentees over a date range</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#888', marginBottom: 4 }}>FROM</label>
              <input type="date" value={range.from} onChange={e => setRange(p => ({ ...p, from: e.target.value }))} style={{ padding: '7px 10px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 12, fontFamily: 'inherit' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#888', marginBottom: 4 }}>TO</label>
              <input type="date" value={range.to} onChange={e => setRange(p => ({ ...p, to: e.target.value }))} style={{ padding: '7px 10px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 12, fontFamily: 'inherit' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#888', marginBottom: 4 }}>CHRONIC BELOW</label>
              <select value={threshold} onChange={e => setThreshold(Number(e.target.value))} style={{ padding: '7px 10px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 12, fontFamily: 'inherit' }}>
                {[60, 70, 75, 80, 85, 90].map(t => <option key={t} value={t}>{t}%</option>)}
              </select>
            </div>
          </div>
        </div>

        {anLoading && <div style={{ textAlign: 'center', padding: 24, color: '#aaa', fontSize: 13 }}>Loading analytics…</div>}

        {!anLoading && analytics && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Class Average', value: analytics.classRate === null ? '—' : `${analytics.classRate}%`, color: rateColor(analytics.classRate) },
                { label: 'Chronic Absentees', value: analytics.summary.chronic, color: analytics.summary.chronic > 0 ? '#c0392b' : '#1e8449' },
                { label: 'Below Class Average', value: analytics.summary.belowAverage, color: '#b9770e' },
                { label: 'Never Marked', value: analytics.summary.unmarked, color: analytics.summary.unmarked > 0 ? '#b9770e' : '#999' }
              ].map(c => (
                <div key={c.label} style={{ background: 'white', borderRadius: 12, padding: '14px 16px', border: '1px solid #f0f0f0' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: c.color, fontFamily: 'Georgia, serif' }}>{c.value}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{c.label}</div>
                </div>
              ))}
            </div>

            {analytics.summary.unmarked > 0 && (
              <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderLeft: '4px solid #ffc107', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#7a5c00', marginBottom: 14 }}>
                {analytics.summary.unmarked} student(s) have no attendance recorded in this range. They are excluded
                from the class average and cannot be flagged as chronic — mark their registers first.
              </div>
            )}

            <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #f0f0f0', background: 'white' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr style={{ background: '#f7f9fb' }}>
                    {['Student', 'Days', 'Present', 'Absent', 'Late', 'Excused', 'Rate', 'Flag'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#888', letterSpacing: .6, borderBottom: '1px solid #eee' }}>{h.toUpperCase()}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analytics.students.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: 34, color: '#bbb', fontSize: 13 }}>No students in this class.</td></tr>
                  ) : analytics.students.map(s => (
                    <tr key={String(s.studentId)} style={{ borderBottom: '1px solid #f5f5f5', background: s.chronic ? '#fdeeec' : 'transparent' }}>
                      <td style={{ padding: '9px 12px', fontSize: 13, color: '#1a3a5c', fontWeight: 600 }}>{s.name}<div style={{ fontSize: 10, color: '#aaa', fontWeight: 400 }}>{s.code}</div></td>
                      <td style={{ padding: '9px 12px', fontSize: 13, color: '#666' }}>{s.total}</td>
                      <td style={{ padding: '9px 12px', fontSize: 13, color: '#1e8449' }}>{s.present}</td>
                      <td style={{ padding: '9px 12px', fontSize: 13, color: s.absent ? '#c0392b' : '#ccc' }}>{s.absent}</td>
                      <td style={{ padding: '9px 12px', fontSize: 13, color: s.late ? '#b9770e' : '#ccc' }}>{s.late}</td>
                      <td style={{ padding: '9px 12px', fontSize: 13, color: '#2874a6' }}>{s.excused}</td>
                      <td style={{ padding: '9px 12px', fontSize: 14, fontWeight: 700, color: rateColor(s.attendanceRate) }}>
                        {s.attendanceRate === null ? '—' : `${s.attendanceRate}%`}
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        {s.chronic
                          ? <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700, color: '#c0392b', background: '#fadbd8' }}>CHRONIC</span>
                          : !s.meetsMinimum
                            ? <span style={{ fontSize: 10, color: '#bbb' }}>too few days</span>
                            : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p style={{ margin: '10px 0 0', fontSize: 11, color: '#999' }}>
              Excused absences are excluded from the rate, so approved sick leave is not counted against a student.
              A student needs at least {analytics.minDays} recorded days before the chronic flag can apply.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
