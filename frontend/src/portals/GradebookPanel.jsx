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

const TERMS = ['Term 1', 'Term 2', 'Term 3'];

const currentYear = () => {
  const now = new Date();
  // Academic years in Uganda run from roughly February, so January still
  // belongs to the year that started the previous February.
  const start = now.getMonth() >= 1 ? now.getFullYear() : now.getFullYear() - 1;
  return start;
};

const gradeColor = (grade) => ({
  A: { color: '#1e8449', bg:'var(--tint-success)' },
  B: { color:'var(--navy-mid)', bg:'var(--tint-primary)' },
  C: { color: '#b9770e', bg: '#fdf6e3' },
  D: { color: '#ca6f1e', bg: '#fef5e7' },
  F: { color: '#c0392b', bg:'var(--tint-danger)' }
}[grade] || { color:'var(--text-faint)', bg:'var(--surface-page)' });

const averageColor = (avg) => {
  if (avg === null || avg === undefined) return '#bbb';
  if (avg >= 80) return '#1e8449';
  if (avg >= 70) return '#2874a6';
  if (avg >= 60) return '#b9770e';
  return '#c0392b';
};

// One cell in the mark entry grid. Held as text while editing so a half-typed
// value like "1" on the way to "15" is not clobbered by a numeric parse.
const MarkCell = ({ value, max, onChange }) => {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value));
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!touched) {
      setText(value === null || value === undefined ? '' : String(value));
    }
  }, [value, touched]);

  const commit = (raw) => {
    setTouched(true);
    const trimmed = raw.trim();
    if (trimmed === '') return onChange(null);
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return onChange(null);
    return onChange(Math.min(max, Math.max(0, n)));
  };

  const outOfRange = text !== '' && Number.isFinite(Number(text)) && Number(text) > max;

  return (
    <input
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      inputMode="decimal"
      placeholder="—"
      style={{
        width: 62, padding: '5px 7px', textAlign: 'center', fontSize: 13,
        border: `1.5px solid ${outOfRange ? '#e74c3c' : '#e0e0e0'}`,
        borderRadius: 6, outline: 'none', boxSizing: 'border-box',
        fontFamily: 'inherit',
        background: outOfRange ? '#fdeeec' : (text === '' ? '#fafbfc' : 'var(--surface-card)')
      }}
    />
  );
};

export const GradebookPanel = () => {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [term, setTerm] = useState(TERMS[0]);
  const [year, setYear] = useState(currentYear());
  const [subject, setSubject] = useState('');

  const [book, setBook] = useState(null);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(false);

  // mark entry
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryExam, setEntryExam] = useState('');
  const [entrySubject, setEntrySubject] = useState('');
  const [entryYear, setEntryYear] = useState(currentYear());
  const [grid, setGrid] = useState(null);
  const [marks, setMarks] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/academic-admin/classes')
      .then(d => {
        const list = Array.isArray(d) ? d : [];
        setClasses(list);
        if (list.length && !classId) setClassId(list[0]._id);
      })
      .catch(() => setClasses([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBook = useCallback(async () => {
    if (!term || !year) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ term, year: String(year) });
      if (classId) q.set('classId', classId);
      if (subject) q.set('subject', subject);
      const d = await api(`/teacher/gradebook?${q.toString()}`);
      setBook(d);
      if (d.classes && d.classes.length && !classId && d.classes[0]._id) setClassId(d.classes[0]._id);
    } catch (e) {
      setBook(null);
      Swal.fire('Error', e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [classId, term, year, subject]);

  useEffect(() => { loadBook(); }, [loadBook]);

  // Assessments the teacher can enter marks for. An exam has to exist before it
  // has a column, so this is populated from the admin-created exam list rather
  // than from the gradebook response.
  const loadExams = useCallback(async () => {
    try {
      const q = new URLSearchParams({ term, year: String(year) });
      const d = await api(`/exams?${q.toString()}`);
      setExams((d.exams || d || []).filter(Boolean));
    } catch {
      setExams([]);
    }
  }, [term, year]);

  useEffect(() => { loadExams(); }, [loadExams]);

  const openEntry = async (examId) => {
    if (!examId) return;
    setEntryExam(examId);
    setEntrySubject(subject || (book && book.subjects && book.subjects[0]) || '');
    try {
      const d = await api(`/teacher/exams/${examId}/marks`);
      setGrid(d);
      // Seed the editable state from what is already stored so a correction
      // opens on the current mark rather than blank.
      const seeded = {};
      (d.students || []).forEach(s => {
        const existing = (d.byStudent && d.byStudent[String(s._id)]) || [];
        const match = existing.find(g => g.subject === (subject || (book && book.subjects && book.subjects[0])));
        seeded[s._id] = match && match.score !== null && match.score !== undefined ? match.score : '';
      });
      setMarks(seeded);
      setEntryOpen(true);
    } catch (e) {
      Swal.fire('Error', e.message, 'error');
    }
  };

  const saveMarks = async () => {
    if (!entrySubject.trim()) {
      return Swal.fire('Subject required', 'Enter the subject these marks belong to.', 'warning');
    }
    const rows = Object.entries(marks).map(([studentId, score]) => ({ studentId, score: score === '' ? null : score }));
    if (rows.every(r => r.score === null)) {
      return Swal.fire('Nothing to save', 'All marks are blank. Use a blank cell for a student who sat nothing.', 'warning');
    }
    setSaving(true);
    try {
      await api(`/teacher/exams/${entryExam}/marks`, {
        method: 'POST',
        body: JSON.stringify({ subject: entrySubject.trim(), term, year: entryYear, marks: rows })
      });
      await Swal.fire('Marks saved', `${rows.filter(r => r.score !== null).length} of ${rows.length} students marked.`, 'success');
      setEntryOpen(false);
      loadBook();
    } catch (e) {
      Swal.fire('Error', e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const rows = (book && book.rows) || [];
  const assessments = (book && book.assessments) || [];
  const noWeight = book && !book.weighted;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, color:'var(--navy)', fontFamily: 'Georgia, serif' }}>Gradebook</h2>
          <p style={{ margin: '3px 0 0', fontSize: 12, color:'var(--text-faint)' }}>
            Weighted term averages, identical to the figures on report cards
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={entryExam} onChange={e => setEntryExam(e.target.value)} style={{ padding: '7px 10px', border:'1.5px solid var(--surface-sunken-2)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit' }}>
            <option value="">Select assessment to enter marks…</option>
            {exams.map(e => <option key={e._id} value={e._id}>{e.name} ({e.type}, out of {e.maxScore})</option>)}
          </select>
          <button
            onClick={() => openEntry(entryExam)}
            disabled={!entryExam}
            style={{ background: entryExam ? '#9b59b6' : '#ccc', color:'var(--on-solid)', border: 'none', borderRadius: 8, padding: '8px 15px', fontSize: 12, fontWeight: 600, cursor: entryExam ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <i className="fas fa-table" style={{ fontSize: 12 }} />Enter Marks
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color:'var(--text-faint)', marginBottom: 4 }}>CLASS</label>
          <select value={classId} onChange={e => setClassId(e.target.value)} style={{ padding: '8px 11px', border:'1.5px solid var(--surface-sunken-2)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', minWidth: 170 }}>
            <option value="">All my classes</option>
            {classes.map(c => <option key={c._id} value={c._id}>{c.grade} {c.className}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color:'var(--text-faint)', marginBottom: 4 }}>TERM</label>
          <select value={term} onChange={e => setTerm(e.target.value)} style={{ padding: '8px 11px', border:'1.5px solid var(--surface-sunken-2)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}>
            {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color:'var(--text-faint)', marginBottom: 4 }}>YEAR</label>
          <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: '8px 11px', border:'1.5px solid var(--surface-sunken-2)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', width: 95 }} />
        </div>
        {book && book.subjects && book.subjects.length > 0 && (
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color:'var(--text-faint)', marginBottom: 4 }}>SUBJECT</label>
            <select value={subject} onChange={e => setSubject(e.target.value)} style={{ padding: '8px 11px', border:'1.5px solid var(--surface-sunken-2)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', minWidth: 150 }}>
              <option value="">All subjects</option>
              {book.subjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
      </div>

      {noWeight && (
        <div style={{ background:'var(--tint-amber)', border:'1px solid var(--tint-amber-line)', borderLeft: '4px solid #ffc107', borderRadius: 10, padding: '11px 14px', fontSize: 12, color:'var(--tint-amber-text)', marginBottom: 14 }}>
          <strong>No assessment weights set for this term.</strong> Averages below are a plain mean of percentages.
          Ask Academic Admin to set a weight on at least one assessment, otherwise every assessment counts the same
          regardless of whether it was a 10-mark quiz or the final paper.
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color:'var(--text-faint)', fontSize: 13 }}>Loading gradebook…</div>
      )}

      {!loading && (
        <div style={{ overflowX: 'auto', borderRadius: 10, border:'1px solid var(--surface-page)', background:'var(--surface-card)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr style={{ background:'var(--surface-muted)' }}>
                {['#', 'Student', ...assessments.map(a => `${a.name} (${a.weight || 0}%)`), 'Average', 'Grade', 'Rank'].map((h, i) => (
                  <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color:'var(--text-faint)', letterSpacing: .6, borderBottom:'1px solid var(--border)', whiteSpace: 'nowrap' }}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6 + assessments.length} style={{ textAlign: 'center', padding: 40, color:'var(--text-faint-2)', fontSize: 13 }}>
                  No graded students for this class and term yet.
                </td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.studentId} style={{ borderBottom:'1px solid var(--surface-muted)' }}>
                  <td style={{ padding: '9px 12px', fontSize: 12, color:'var(--text-faint)' }}>{i + 1}</td>
                  <td style={{ padding: '9px 12px', fontSize: 13, color:'var(--navy)', fontWeight: 600 }}>
                    {r.name}
                    <div style={{ fontSize: 10, color:'var(--text-faint)', fontWeight: 400 }}>{r.className} · {r.studentCode}</div>
                  </td>
                  {assessments.map(a => {
                    const cell = r.cells[String(a._id)];
                    const score = cell && cell.score;
                    const absent = score === null || score === undefined;
                    return (
                      <td key={a._id} style={{ padding: '9px 12px', fontSize: 13, color: absent ? '#ccc' : '#333' }}>
                        {absent ? '—' : `${score}/${a.maxScore}`}
                      </td>
                    );
                  })}
                  <td style={{ padding: '9px 12px', fontSize: 15, fontWeight: 700, color: averageColor(r.average) }}>
                    {r.average === null || r.average === undefined ? '—' : `${r.average}%`}
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ display: 'inline-block', minWidth: 24, textAlign: 'center', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700, ...gradeColor(r.grade) }}>{r.grade}</span>
                  </td>
                  <td style={{ padding: '9px 12px', fontSize: 13, color:'var(--text-secondary)' }}>{r.rank || '—'}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && book.subjectTotals && book.subjectTotals.length > 0 && (
              <tfoot>
                <tr style={{ background:'var(--surface-muted)', fontWeight: 700 }}>
                  <td style={{ padding: '10px 12px', fontSize: 12, color:'var(--navy)' }} colSpan={2}>CLASS MEAN</td>
                  {assessments.map(a => <td key={a._id} style={{ padding: '10px 12px', fontSize: 12, color:'var(--text-faint)' }}>—</td>)}
                  <td style={{ padding: '10px 12px', fontSize: 13, color:'var(--navy)' }}>
                    {(() => {
                      const vals = rows.map(r => r.average).filter(v => typeof v === 'number');
                      return vals.length ? `${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)}%` : '—';
                    })()}
                  </td>
                  <td colSpan={2} style={{ padding: '10px 12px', fontSize: 12, color:'var(--text-faint)' }}>
                    {book.subjectTotals.map(s => `${s.subject}: ${s.mean === null ? '—' : `${s.mean}%`}`).join('  ·  ')}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <p style={{ margin: '10px 0 0', fontSize: 11, color:'var(--text-faint)' }}>
          A blank cell means the student did not sit that assessment and is left out of the average.
          A recorded 0 is treated as a genuine zero.
        </p>
      )}

      {entryOpen && grid && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={e => e.target === e.currentTarget && setEntryOpen(false)}>
          <div style={{ background:'var(--surface-card)', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,.25)' }}>
            <div style={{ padding: '18px 22px', borderBottom:'1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, color:'var(--navy)', fontFamily: 'Georgia, serif' }}>
                Enter Marks — {grid.exam.name}
                <span style={{ display: 'block', fontSize: 11, color:'var(--text-faint)', fontFamily: 'inherit', marginTop: 3 }}>
                  {grid.exam.type} · out of {grid.exam.maxScore} · {term} {entryYear}
                </span>
              </h3>
              <button onClick={() => setEntryOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color:'var(--text-faint)', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: '18px 22px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color:'var(--text-faint)', marginBottom: 4 }}>SUBJECT *</label>
                  <input value={entrySubject} onChange={e => setEntrySubject(e.target.value)} placeholder="e.g. Mathematics" style={{ width: '100%', padding: '9px 12px', border:'1.5px solid var(--surface-sunken-2)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color:'var(--text-faint)', marginBottom: 4 }}>YEAR *</label>
                  <input type="number" value={entryYear} onChange={e => setEntryYear(Number(e.target.value))} style={{ width: '100%', padding: '9px 12px', border:'1.5px solid var(--surface-sunken-2)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ overflowX: 'auto', border:'1px solid var(--surface-page)', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background:'var(--surface-muted)' }}>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color:'var(--text-faint)' }}>STUDENT</th>
                      <th style={{ padding: '9px 12px', textAlign: 'center', fontSize: 10, fontWeight: 700, color:'var(--text-faint)' }}>SCORE / {grid.exam.maxScore}</th>
                      <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 10, fontWeight: 700, color:'var(--text-faint)' }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(grid.students || []).map(s => {
                      const raw = marks[s._id];
                      const has = raw !== '' && raw !== null && raw !== undefined;
                      const pct = has ? Math.round((Number(raw) / (grid.exam.maxScore || 100)) * 100) : null;
                      return (
                        <tr key={s._id} style={{ borderBottom:'1px solid var(--surface-muted)' }}>
                          <td style={{ padding: '7px 12px', fontSize: 13, color:'var(--navy)' }}>{s.fullName}<div style={{ fontSize: 10, color:'var(--text-faint)' }}>{s.studentId}</div></td>
                          <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                            <MarkCell value={marks[s._id]} max={grid.exam.maxScore || 100} onChange={v => setMarks(p => ({ ...p, [s._id]: v === null ? '' : v }))} />
                          </td>
                          <td style={{ padding: '7px 12px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: pct === null ? '#ccc' : averageColor(pct) }}>{pct === null ? '—' : `${pct}%`}</td>
                        </tr>
                      );
                    })}
                    {(grid.students || []).length === 0 && (
                      <tr><td colSpan={3} style={{ textAlign: 'center', padding: 30, color:'var(--text-faint-2)', fontSize: 13 }}>This exam has no classes with students yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ background:'var(--tint-primary)', borderLeft: '3px solid #3498db', padding: '9px 12px', borderRadius: 6, fontSize: 11, color: '#1a5276', marginTop: 12 }}>
                Leave a cell blank for a student who did not sit the paper — it is excluded from the average.
                Enter 0 only if they sat it and scored nothing. Saving again overwrites the previous marks for this
                exam, subject and term.
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={() => setEntryOpen(false)} style={{ background:'var(--surface-page)', color:'var(--text-secondary)', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveMarks} disabled={saving} style={{ background: saving ? '#ccc' : '#27ae60', color:'var(--on-solid)', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving…' : 'Save Marks'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
