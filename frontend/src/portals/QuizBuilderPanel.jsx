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

const TYPES = [
  { value: 'single', label: 'Single choice', hint: 'One right option' },
  { value: 'multiple', label: 'Multiple choice', hint: 'Every right option, no extras' },
  { value: 'boolean', label: 'True / False', hint: 'One statement' },
  { value: 'short', label: 'Written answer', hint: 'You mark these yourself' }
];

const blankQuestion = (type = 'single') => ({
  prompt: '',
  type,
  // True/False is a fixed pair, so it is generated rather than typed, and the
  // editor hides the options for it entirely.
  options: type === 'boolean' ? ['True', 'False'] : ['', ''],
  correctAnswers: type === 'boolean' ? ['true'] : [],
  points: type === 'short' ? 5 : 1
});

const blankQuiz = () => ({
  _id: null, title: '', description: '', subject: '', classId: '',
  timeLimitMinutes: 30, allowRetakes: false, opensAt: '', closesAt: '',
  status: 'draft', questions: [blankQuestion()]
});

// An editor state is deliberately kept separate from what is sent, because the
// blank option rows the editor shows are not real options and must not be saved.
const toPayload = (quiz) => ({
  title: quiz.title,
  description: quiz.description,
  subject: quiz.subject,
  classId: quiz.classId,
  timeLimitMinutes: Number(quiz.timeLimitMinutes) || 0,
  allowRetakes: !!quiz.allowRetakes,
  opensAt: quiz.opensAt || null,
  closesAt: quiz.closesAt || null,
  questions: quiz.questions.map((q) => ({
    prompt: q.prompt,
    type: q.type,
    options: q.type === 'boolean' ? undefined : q.options.map((o) => o.trim()).filter(Boolean),
    correctAnswers: q.type === 'short'
      ? []
      : q.correctAnswers.map((c) => String(c).trim()).filter(Boolean),
    points: Number(q.points) || 0
  }))
});

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

const Button = ({ children, onClick, tone = 'default', small, disabled, style }) => {
  const tones = {
    default: { background: 'var(--surface-page)', color: 'var(--text-secondary)' },
    primary: { background: 'var(--navy)', color: 'var(--on-solid)' },
    go: { background: '#1e8449', color: 'var(--on-solid)' },
    warn: { background: '#b9770e', color: 'var(--on-solid)' },
    danger: { background: '#c0392b', color: 'var(--on-solid)' }
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...tones[tone], border: 'none', borderRadius: 8,
      padding: small ? '6px 12px' : '9px 16px', fontSize: small ? 12 : 13, fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, ...style
    }}>
      {children}
    </button>
  );
};

const Pill = ({ children, tone = 'default' }) => {
  const tones = {
    default: { color: 'var(--text-secondary)', background: 'var(--surface-page)' },
    live: { color: '#1e8449', background: 'var(--tint-success)' },
    draft: { color: '#b9770e', background: 'var(--tint-warning)' },
    bad: { color: '#c0392b', background: 'var(--tint-danger)' }
  };
  return <span style={{ ...tones[tone], display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{children}</span>;
};

const inputStyle = { width: '100%', padding: '8px 11px', border: '1px solid var(--surface-sunken-2)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: 'var(--surface-card)' };
const Input = (p) => <input {...p} style={{ ...inputStyle, ...p.style }} />;
const Select = ({ children, ...p }) => <select {...p} style={{ ...inputStyle, ...p.style }}>{children}</select>;
const Textarea = (p) => <textarea {...p} style={{ ...inputStyle, resize: 'vertical', minHeight: 60, ...p.style }} />;

const Label = ({ children }) => (
  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4, letterSpacing: 0.4 }}>{children}</label>
);

// ─── one question in the editor ──────────────────────────────────────────────
const QuestionEditor = ({ question: q, index, onChange, onRemove, canRemove }) => {
  const setOption = (i, value) => {
    const options = q.options.map((o, j) => (j === i ? value : o));
    onChange({ ...q, options });
  };

  const toggleCorrect = (option) => {
    if (q.type === 'multiple') {
      const has = q.correctAnswers.includes(option);
      onChange({ ...q, correctAnswers: has ? q.correctAnswers.filter((c) => c !== option) : [...q.correctAnswers, option] });
      return;
    }
    // Single choice and true/false both hold exactly one right answer, so
    // choosing a second one replaces the first rather than adding to it.
    onChange({ ...q, correctAnswers: [option] });
  };

  const changeType = (type) => {
    onChange(type === 'boolean'
      ? { ...blankQuestion('boolean'), prompt: q.prompt, points: q.points }
      : { ...blankQuestion(type), prompt: q.prompt, points: q.points });
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 11, padding: 14, marginBottom: 12, background: 'var(--surface-card)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13, color: 'var(--navy)' }}>Question {index + 1}</strong>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Select value={q.type} onChange={(e) => changeType(e.target.value)} style={{ width: 160 }}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
          <Input type="number" min="0" value={q.points} onChange={(e) => onChange({ ...q, points: e.target.value })}
            style={{ width: 70 }} title="Marks available" />
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>marks</span>
          {canRemove && <Button tone="danger" small onClick={onRemove}>Remove</Button>}
        </div>
      </div>

      <Textarea value={q.prompt} onChange={(e) => onChange({ ...q, prompt: e.target.value })}
        placeholder="Type the question" style={{ marginBottom: 10 }} />

      {q.type === 'short' && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)', background: 'var(--surface-page)', padding: '9px 11px', borderRadius: 8 }}>
          You will mark these by hand. Until you do, the attempt stays marked as awaiting marks and the pupil is not shown the answer key.
        </p>
      )}

      {q.type !== 'short' && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
            {q.type === 'multiple' ? 'Tick every correct option. An extra tick scores zero.' : 'Tick the correct option.'}
          </div>
          {q.options.map((opt, i) => {
            const isCorrect = q.correctAnswers.some((c) => String(c).trim().toLowerCase() === String(opt).trim().toLowerCase());
            const disabled = q.type === 'boolean';
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
                <input type={q.type === 'multiple' ? 'checkbox' : 'radio'} disabled={disabled}
                  checked={isCorrect} onChange={() => toggleCorrect(opt.trim())} style={{ cursor: disabled ? 'default' : 'pointer' }} />
                <Input value={opt} disabled={disabled} onChange={(e) => setOption(i, e.target.value)} placeholder={`Option ${i + 1}`}
                  style={{ flex: 1 }} />
                {q.type !== 'boolean' && q.options.length > 2 && (
                  <Button small tone="danger" onClick={() => onChange({ ...q, options: q.options.filter((_, j) => j !== i), correctAnswers: q.correctAnswers.filter((c) => c !== opt) })}>×</Button>
                )}
              </div>
            );
          })}
          {q.type !== 'boolean' && (
            <Button small onClick={() => onChange({ ...q, options: [...q.options, ''] })}>+ Add option</Button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── manual marking for one attempt ─────────────────────────────────────────
const MarkingPanel = ({ attempt, quiz, onDone }) => {
  const [marks, setMarks] = useState({});
  const [saving, setSaving] = useState(false);

  const written = (attempt.answers || []).filter((a, i) => {
    const q = (quiz.questions || [])[i];
    return q && q.type === 'short';
  });

  const save = async () => {
    setSaving(true);
    try {
      await api(`/teacher/attempts/${attempt._id}/mark`, {
        method: 'PUT',
        body: JSON.stringify({
          marks: written.map((a) => ({
            questionId: a.questionId,
            pointsAwarded: Number(marks[a.questionId]?.pointsAwarded) || 0,
            teacherComment: marks[a.questionId]?.teacherComment || ''
          }))
        })
      });
      Swal.fire('Marks saved', 'The pupil can now see their score and the answer key.', 'success');
      onDone();
    } catch (e) {
      Swal.fire('Could not save marks', e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={`Marking ${attempt.studentName}`} style={{ marginTop: 12 }}>
      {written.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Nothing to mark by hand on this attempt.</p>}
      {written.map((a, i) => {
        const question = quiz.questions[(attempt.answers || []).indexOf(a)];
        return (
          <div key={a.questionId} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-body)', marginBottom: 6 }}>{question?.prompt}</div>
            <div style={{ background: 'var(--surface-page)', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 8, whiteSpace: 'pre-wrap' }}>
              {a.text ? a.text : <em style={{ color: 'var(--text-faint-2)' }}>No answer written</em>}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Input type="number" min="0" max={a.maxPoints} placeholder="0" style={{ width: 90 }}
                value={marks[a.questionId]?.pointsAwarded ?? ''}
                onChange={(e) => setMarks({ ...marks, [a.questionId]: { ...marks[a.questionId], pointsAwarded: e.target.value } })} />
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>of {a.maxPoints}</span>
              <Input placeholder="Comment for the pupil (optional)" style={{ flex: 1, minWidth: 180 }}
                value={marks[a.questionId]?.teacherComment ?? ''}
                onChange={(e) => setMarks({ ...marks, [a.questionId]: { ...marks[a.questionId], teacherComment: e.target.value } })} />
            </div>
            {i === written.length - 1 && null}
          </div>
        );
      })}
      <Button tone="go" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save marks'}</Button>
    </Card>
  );
};

export const QuizBuilderPanel = () => {
  const [classes, setClasses] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [results, setResults] = useState(null);
  const [marking, setMarking] = useState(null);
  const [busy, setBusy] = useState(false);
  const [classFilter, setClassFilter] = useState('');

  // The teacher already has a scoped class list; reusing it means the quiz
  // builder can never offer a form the teacher does not own.
  const loadClasses = useCallback(async () => {
    try {
      const d = await api('/teacher/progress/classes');
      setClasses(Array.isArray(d.classes) ? d.classes : []);
    } catch { setClasses([]); }
  }, []);

  const loadQuizzes = useCallback(async (classId) => {
    try {
      const q = classId ? `?classId=${encodeURIComponent(classId)}` : '';
      const d = await api(`/teacher/quizzes${q}`);
      setQuizzes(Array.isArray(d.quizzes) ? d.quizzes : []);
    } catch (e) {
      Swal.fire('Could not load quizzes', e.message, 'error');
      setQuizzes([]);
    }
  }, []);

  useEffect(() => { loadClasses(); }, [loadClasses]);
  useEffect(() => { loadQuizzes(classFilter); }, [classFilter, loadQuizzes]);

  const openResults = async (quiz) => {
    try {
      setResults(await api(`/teacher/quizzes/${quiz._id}/results`));
      setMarking(null);
    } catch (e) {
      Swal.fire('Could not load results', e.message, 'error');
    }
  };

  const startNew = () => {
    setResults(null);
    setEditing(blankQuiz());
  };

  const edit = (quiz) => {
    setResults(null);
    // Back from the server's stored shape into the editor's shape.
    setEditing({
      _id: quiz._id,
      title: quiz.title || '',
      description: quiz.description || '',
      subject: quiz.subject || '',
      classId: quiz.classId && quiz.classId._id ? quiz.classId._id : quiz.classId || '',
      timeLimitMinutes: quiz.timeLimitMinutes || 0,
      allowRetakes: !!quiz.allowRetakes,
      // A datetime-local input needs YYYY-MM-DDTHH:mm. Truncating to the date alone
    // gives the control a value it considers invalid, so the field renders blank
    // and the opening time is lost on the next save.
    opensAt: quiz.opensAt ? String(quiz.opensAt).slice(0, 16) : '',
      closesAt: quiz.closesAt ? String(quiz.closesAt).slice(0, 16) : '',
      status: quiz.status,
      questions: (quiz.questions || []).map((q) => ({
        _id: q._id,
        prompt: q.prompt,
        type: q.type,
        options: q.type === 'boolean' ? ['True', 'False'] : (q.options || []).slice(),
        correctAnswers: (q.correctAnswers || []).map(String),
        points: q.points
      }))
    });
  };

  const save = async () => {
    if (!editing.classId) { Swal.fire('Choose a class', 'A quiz has to belong to one form.', 'warning'); return; }
    setBusy(true);
    try {
      const payload = toPayload(editing);
      if (editing._id) await api(`/teacher/quizzes/${editing._id}`, { method: 'PUT', body: JSON.stringify(payload) });
      else await api('/teacher/quizzes', { method: 'POST', body: JSON.stringify(payload) });
      Swal.fire('Saved', editing._id ? 'Quiz updated.' : 'Quiz created as a draft.', 'success');
      setEditing(null);
      loadQuizzes(classFilter);
    } catch (e) {
      Swal.fire('Could not save', e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (quiz, status) => {
    try {
      await api(`/teacher/quizzes/${quiz._id}/publish`, { method: 'POST', body: JSON.stringify({ status }) });
      Swal.fire(status === 'published' ? 'Published' : 'Unpublished',
        status === 'published' ? 'Pupils in this form can now sit the quiz.' : 'Pupils can no longer open it.', 'success');
      loadQuizzes(classFilter);
    } catch (e) {
      Swal.fire('Could not change status', e.message, 'error');
    }
  };

  const remove = async (quiz) => {
    const ok = await Swal.fire({
      title: 'Delete this quiz?',
      html: `Every attempt already submitted for <b>${quiz.title}</b> is deleted with it. This cannot be undone.`,
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#c0392b', confirmButtonText: 'Delete'
    });
    if (!ok.isConfirmed) return;
    try {
      await api(`/teacher/quizzes/${quiz._id}`, { method: 'DELETE' });
      loadQuizzes(classFilter);
    } catch (e) {
      Swal.fire('Could not delete', e.message, 'error');
    }
  };

  // ── editor ──
  if (editing) {
    const e = editing;
    const totalPoints = e.questions.reduce((s, q) => s + (Number(q.points) || 0), 0);
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 17, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>
            {e._id ? 'Edit quiz' : 'New quiz'}
          </h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button tone="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save draft'}</Button>
          </div>
        </div>

        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <Label>Title</Label>
              <Input value={e.title} onChange={(ev) => setEditing({ ...e, title: ev.target.value })} placeholder="e.g. Fractions quiz" />
            </div>
            <div>
              <Label>Class</Label>
              <Select value={e.classId} onChange={(ev) => setEditing({ ...e, classId: ev.target.value })}>
                <option value="">Choose a form…</option>
                {classes.map((c) => <option key={c._id} value={c._id}>{c.label}</option>)}
              </Select>
            </div>
            <div>
              <Label>Subject</Label>
              <Input value={e.subject} onChange={(ev) => setEditing({ ...e, subject: ev.target.value })} placeholder="Mathematics" />
            </div>
            <div>
              <Label>Time limit (minutes, 0 = none)</Label>
              <Input type="number" min="0" value={e.timeLimitMinutes}
                onChange={(ev) => setEditing({ ...e, timeLimitMinutes: ev.target.value })} />
            </div>
            <div>
              <Label>Opens</Label>
              <Input type="datetime-local" value={e.opensAt} onChange={(ev) => setEditing({ ...e, opensAt: ev.target.value })} />
            </div>
            <div>
              <Label>Closes</Label>
              <Input type="datetime-local" value={e.closesAt} onChange={(ev) => setEditing({ ...e, closesAt: ev.target.value })} />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <Label>Instructions for pupils</Label>
            <Textarea value={e.description} onChange={(ev) => setEditing({ ...e, description: ev.target.value })}
              placeholder="Anything they should know before starting" />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: 'var(--text-body)' }}>
            <input type="checkbox" checked={e.allowRetakes} onChange={(ev) => setEditing({ ...e, allowRetakes: ev.target.checked })} />
            Let pupils sit this again (each attempt is kept separately)
          </label>
        </Card>

        <div style={{ margin: '18px 0 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 14, color: 'var(--navy)' }}>
            {e.questions.length} question{e.questions.length === 1 ? '' : 's'} · {totalPoints} marks
          </strong>
          <Button onClick={() => setEditing({ ...e, questions: [...e.questions, blankQuestion()] })}>+ Add question</Button>
        </div>

        {e.questions.map((q, i) => (
          <QuestionEditor
            key={q._id || i} question={q} index={i}
            canRemove={e.questions.length > 1}
            onChange={(next) => setEditing({ ...e, questions: e.questions.map((x, j) => (j === i ? next : x)) })}
            onRemove={() => setEditing({ ...e, questions: e.questions.filter((_, j) => j !== i) })}
          />
        ))}

        {e._id && e.status === 'published' && (
          <p style={{ fontSize: 12, color: '#b9770e', background: 'var(--tint-warning)', padding: '10px 13px', borderRadius: 8, marginTop: 6 }}>
            This quiz is live. Unpublish it before editing, so that pupils already working do not see the questions change underneath them.
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Button tone="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save draft'}</Button>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
        </div>
      </div>
    );
  }

  // ── results ──
  if (results) {
    const q = results.quiz;
    const s = results.summary || {};
    const attempts = results.attempts || [];
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 17, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>Results: {q.title}</h3>
          <Button onClick={() => { setResults(null); setMarking(null); }}>Back to quizzes</Button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Sat it', value: `${results.attemptedCount}/${results.rosterSize}` },
            { label: 'Class average', value: s.averageMarks === null || s.averageMarks === undefined ? '—' : `${s.averageMarks}%` },
            { label: 'Highest', value: s.highestPercent === null || s.highestPercent === undefined ? '—' : `${s.highestPercent}%` },
            { label: 'Lowest', value: s.lowestPercent === null || s.lowestPercent === undefined ? '—' : `${s.lowestPercent}%` },
            { label: 'Awaiting marks', value: s.pendingMarking || 0 }
          ].map((c) => (
            <div key={c.label} style={{ background: 'var(--surface-card)', border: '1px solid var(--surface-page)', borderRadius: 12, padding: '13px 15px' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)', fontFamily: 'Georgia, serif' }}>{c.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{c.label}</div>
            </div>
          ))}
        </div>

        <Card title="Every question" style={{ marginBottom: 16 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr>
                  {['#', 'Question', 'Answered', 'Correct', 'Awaiting marks'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', borderBottom: '1px solid var(--border)' }}>{h.toUpperCase()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(results.perQuestion || []).map((row) => (
                  <tr key={row.index} style={{ borderBottom: '1px solid var(--surface-muted)' }}>
                    <td style={{ padding: '8px 10px', fontSize: 13, color: 'var(--text-faint)' }}>{row.index + 1}</td>
                    <td style={{ padding: '8px 10px', fontSize: 13, color: 'var(--text-body)' }}>
                      {row.prompt}
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                        Key: {(row.correctAnswers || []).join(', ') || 'marked by hand'} · {row.points} marks
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px', fontSize: 13 }}>{row.answered}</td>
                    <td style={{ padding: '8px 10px', fontSize: 13 }}>
                      {row.percentCorrect === null ? '—' : `${row.percentCorrect}%`}
                    </td>
                    <td style={{ padding: '8px 10px', fontSize: 13 }}>{row.pending || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Pupil attempts">
          {attempts.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Nobody has attempted this yet.</p>}
          {attempts.map((a) => (
            <div key={a._id} style={{ borderBottom: '1px solid var(--surface-muted)', padding: '11px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ fontSize: 13, color: 'var(--navy)' }}>{a.studentName}</strong>
                  {a.studentCode && <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 8 }}>{a.studentCode}</span>}
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    Attempt {a.attemptNumber} · {fmt(a.submittedAt)}
                    {a.elapsedSeconds !== null && a.elapsedSeconds !== undefined && ` · ${Math.round(a.elapsedSeconds / 60)} min`}
                    {a.lateBySeconds > 0 && <span style={{ color: '#c0392b' }}> · {Math.round(a.lateBySeconds / 60)} min over the limit</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  {a.fullyMarked
                    ? <Pill tone={a.percentage >= 50 ? 'live' : 'bad'}>{a.score}/{a.maxScore} · {a.percentage}%</Pill>
                    : <Pill tone="draft">Awaiting marks</Pill>}
                  {!a.fullyMarked && <Button small tone="warn" onClick={() => setMarking(a._id === marking ? null : a._id)}>Mark</Button>}
                </div>
              </div>
              {marking === a._id && <MarkingPanel attempt={a} quiz={q} onDone={() => openResults(q)} />}
            </div>
          ))}
        </Card>

        {(results.notAttempted || []).length > 0 && (
          <Card title="Have not attempted it" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {results.notAttempted.map((p) => (
                <Pill key={p._id}>{p.fullName}</Pill>
              ))}
            </div>
          </Card>
        )}
      </div>
    );
  }

  // ── list ──
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 17, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>Quiz Builder</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
            Set questions, publish when you are ready, and mark the written answers by hand.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} style={{ width: 170 }}>
            <option value="">All my forms</option>
            {classes.map((c) => <option key={c._id} value={c._id}>{c.label}</option>)}
          </Select>
          <Button tone="primary" onClick={startNew}>+ New quiz</Button>
        </div>
      </div>

      {quizzes.length === 0 && (
        <Card>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
            No quizzes yet. Create one and it stays a draft until you publish it.
          </p>
        </Card>
      )}

      {quizzes.map((quiz) => (
        <Card key={quiz._id} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 15, color: 'var(--navy)' }}>{quiz.title}</strong>
                <Pill tone={quiz.status === 'published' ? 'live' : 'draft'}>{quiz.status === 'published' ? 'Live' : 'Draft'}</Pill>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>
                {quiz.classLabel || 'Unassigned'} · {quiz.questionCount} question{quiz.questionCount === 1 ? '' : 's'} · {quiz.totalPoints} marks
                {quiz.timeLimitMinutes > 0 && ` · ${quiz.timeLimitMinutes} min limit`}
                {quiz.allowRetakes && ' · retakes allowed'}
              </div>
              {quiz.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{quiz.description}</div>}
              <div style={{ fontSize: 11, color: 'var(--text-faint-2)', marginTop: 6 }}>
                {quiz.status === 'published' ? `Published ${fmt(quiz.publishedAt)}` : `Created ${fmt(quiz.createdAt)}`}
                {quiz.closesAt && ` · closes ${fmt(quiz.closesAt)}`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {quiz.status === 'draft'
                ? <Button small tone="go" onClick={() => setStatus(quiz, 'published')}>Publish</Button>
                : <Button small tone="warn" onClick={() => setStatus(quiz, 'draft')}>Unpublish</Button>}
              {quiz.status === 'draft' && <Button small onClick={() => edit(quiz)}>Edit</Button>}
              <Button small onClick={() => openResults(quiz)}>Results</Button>
              <Button small tone="danger" onClick={() => remove(quiz)}>Delete</Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};
