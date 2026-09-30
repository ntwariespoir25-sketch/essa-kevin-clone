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
    go: { background: '#1e8449', color: 'var(--on-solid)' }
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...tones[tone], border: 'none', borderRadius: 8, padding: small ? '6px 12px' : '9px 18px',
      fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1, ...style
    }}>{children}</button>
  );
};

const Pill = ({ children, tone = 'default' }) => {
  const tones = {
    default: { color: 'var(--text-secondary)', background: 'var(--surface-page)' },
    good: { color: '#1e8449', background: 'var(--tint-success)' },
    warn: { color: '#b9770e', background: 'var(--tint-warning)' },
    bad: { color: '#c0392b', background: 'var(--tint-danger)' }
  };
  return <span style={{ ...tones[tone], display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{children}</span>;
};

const textInput = { width: '100%', padding: '10px 12px', border: '1px solid var(--surface-sunken-2)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'var(--surface-card)', boxSizing: 'border-box' };

// ─── taking one quiz ────────────────────────────────────────────────────────
const QuizRunner = ({ quizId, onFinished }) => {
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
 

  // The clock is the server's. Opening the quiz creates a server-stamped start,
  // and the seconds returned are what count down here, so reloading or editing
  // the page cannot buy extra time.
  const [deadline, setDeadline] = useState(null);
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api(`/student/quizzes/${quizId}`), api(`/student/quizzes/${quizId}/start`, { method: 'POST' })])
      .then(([detail, started]) => {
        if (!alive) return;
        setQuiz(detail.quiz);
        setDeadline(Date.now() + (started.remainingSeconds || 0) * 1000);
      })
      .catch((e) => {
        if (!alive) return;
        Swal.fire('Cannot open this quiz', e.message, 'warning').then(() => onFinished());
      });
    return () => { alive = false; };
  }, [quizId, onFinished]);

  const minutes = quiz && quiz.timeLimitMinutes;

  // Purely a courtesy to the pupil. The limit that counts is the one the server
  // applied to its own start stamp when the answers came back.
  useEffect(() => {
    if (!minutes || !deadline || receipt) return undefined;
    const tick = () => setRemaining(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [minutes, deadline, receipt]);

  const select = (questionId, option, multiple) => {
    setAnswers((prev) => {
      const current = prev[questionId] || { selectedOptions: [], text: '' };
      const selected = multiple
        ? (current.selectedOptions.includes(option)
          ? current.selectedOptions.filter((o) => o !== option)
          : [...current.selectedOptions, option])
        : [option];
      return { ...prev, [questionId]: { ...current, selectedOptions: selected } };
    });
  };

  const writeText = (questionId, text) => {
    setAnswers((prev) => ({ ...prev, [questionId]: { ...(prev[questionId] || {}), text } }));
  };

  const submit = async () => {
    const blanks = (quiz.questions || []).filter((q) => {
      if (q.type === 'short') return !String((answers[q._id] || {}).text || '').trim();
      return !(answers[q._id] && answers[q._id].selectedOptions.length);
    });
    if (blanks.length) {
      const go = await Swal.fire({
        title: `${blanks.length} question${blanks.length === 1 ? '' : 's'} left blank`,
        text: 'You can still hand it in, but a blank answer scores nothing.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Hand it in anyway',
        cancelButtonText: 'Go back'
      });
      if (!go.isConfirmed) return;
    }
    setBusy(true);
    try {
      const d = await api(`/student/quizzes/${quizId}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          answers: Object.entries(answers).map(([questionId, a]) => ({
            questionId,
            selectedOptions: a.selectedOptions || [],
            text: a.text || ''
          }))
        })
      });
      setReceipt(d.attempt);
    } catch (e) {
      Swal.fire('Could not hand it in', e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!quiz) return <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Loading the quiz…</p>;

  if (receipt) {
    return (
      <Card title="Handed in">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'Georgia, serif', color: receipt.percentage >= 50 ? '#1e8449' : '#c0392b' }}>
            {receipt.percentage}%
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {receipt.score} of {receipt.maxScore} marks
            {receipt.pendingManualMarking && (
              <div style={{ color: '#b9770e' }}>Your teacher still has to mark the written answers.</div>
            )}
          </div>
        </div>

        {(quiz.questions || []).map((q, i) => {
          const given = (receipt.answers || [])[i];
          const written = given && (((given.selectedOptions || []).join(', ')) || given.text);
          return (
            <div key={q._id} style={{ borderTop: '1px solid var(--surface-muted)', padding: '12px 0' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-body)' }}>{i + 1}. {q.prompt}</div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', margin: '4px 0 6px' }}>
                Your answer: {written || <em>left blank</em>}
              </div>
              {given && given.autoMarked && (
                <Pill tone={given.isCorrect ? 'good' : 'bad'}>
                  {given.isCorrect
                    ? `Correct · ${given.pointsAwarded}/${given.maxPoints}`
                    : `Not correct · 0/${given.maxPoints}`}
                </Pill>
              )}
              {given && !given.autoMarked && <Pill tone="warn">Awaiting marks</Pill>}
            </div>
          );
        })}

        <div style={{ marginTop: 16 }}>
          <Button tone="primary" onClick={onFinished}>Back to my quizzes</Button>
        </div>
      </Card>
    );
  }

  const clock = remaining === null
    ? null
    : `${Math.floor(remaining / 60)}:${String(Math.floor(remaining % 60)).padStart(2, '0')}`;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 17, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>{quiz.title}</h3>
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {quiz.subject ? `${quiz.subject} · ` : ''}{quiz.questionCount} questions · {quiz.totalPoints} marks
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {clock && <Pill tone={remaining < 60 ? 'bad' : 'warn'}>Time left {clock}</Pill>}
          <Button small onClick={onFinished}>Leave</Button>
        </div>
      </div>

      {quiz.description && (
        <div style={{ background: 'var(--surface-page)', padding: '11px 14px', borderRadius: 9, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          {quiz.description}
        </div>
      )}

      {(quiz.questions || []).map((q, i) => (
        <Card key={q._id} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-body)', marginBottom: 10 }}>
            {i + 1}. {q.prompt}{' '}
            <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>({q.points} marks)</span>
          </div>

          {q.type === 'short' ? (
            <textarea
              value={(answers[q._id] || {}).text || ''}
              onChange={(e) => writeText(q._id, e.target.value)}
              placeholder="Type your answer"
              style={{ ...textInput, minHeight: 90, resize: 'vertical' }}
            />
          ) : (q.options || []).map((opt) => {
            const chosen = ((answers[q._id] || {}).selectedOptions || []).includes(opt);
            return (
              <label key={opt} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', marginBottom: 6,
                borderRadius: 8, cursor: 'pointer', fontSize: 13,
                border: `1px solid ${chosen ? 'var(--navy)' : 'var(--border)'}`,
                background: chosen ? 'var(--tint-primary)' : 'var(--surface-card)',
                color: chosen ? 'var(--navy)' : 'var(--text-body)'
              }}>
                <input
                  type={q.type === 'multiple' ? 'checkbox' : 'radio'}
                  name={`q_${q._id}`}
                  checked={chosen}
                  onChange={() => select(q._id, opt, q.type === 'multiple')}
                />
                {opt}
              </label>
            );
          })}

          {q.type === 'multiple' && (
            <div style={{ fontSize: 11, color: 'var(--text-faint-2)', marginTop: 4 }}>
              Tick every one that is correct. One extra tick makes the whole question wrong.
            </div>
          )}
        </Card>
      ))}

      <Button tone="go" onClick={submit} disabled={busy}>{busy ? 'Handing in…' : 'Hand it in'}</Button>
    </div>
  );
};

// ─── attempts already handed in ─────────────────────────────────────────────
const AttemptRow = ({ attempt, quiz }) => {
  const [open, setOpen] = useState(false);
  const mine = (attempt.answers || []);
  const theirQuestions = (quiz && quiz.questions) || [];

  return (
    <div style={{ borderTop: '1px solid var(--surface-muted)', padding: '12px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--text-body)' }}>
          <strong>Attempt {attempt.attemptNumber}</strong>
          <span style={{ color: 'var(--text-faint)' }}> · handed in {fmt(attempt.submittedAt)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Pill tone={attempt.percentage >= 50 ? 'good' : 'bad'}>
            {attempt.percentage}% · {attempt.score}/{attempt.maxScore}
          </Pill>
          {attempt.pendingManualMarking
            ? <Pill tone="warn">Still being marked</Pill>
            : <Button small onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Review'}</Button>}
        </div>
      </div>

      {attempt.late && (
        <div style={{ fontSize: 11, color: '#c0392b', marginTop: 4 }}>Handed in after the time limit.</div>
      )}

      {open && !attempt.pendingManualMarking && (
        <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: '2px solid var(--surface-muted)' }}>
          {theirQuestions.map((q, i) => {
            const given = mine[i];
            const written = given && (((given.selectedOptions || []).join(', ')) || given.text);
            const key = (q.correctAnswers || []).join(', ');
            return (
              <div key={q._id} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-body)' }}>{i + 1}. {q.prompt}</div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>You wrote: {written || <em>nothing</em>}</div>
                {q.type === 'short'
                  ? <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Your teacher wrote: <em>{given && given.text ? given.text : '—'}</em></div>
                  : <div style={{ fontSize: 12, color: given && given.isCorrect ? '#1e8449' : '#c0392b' }}>Answer: {key}</div>}
                {given && given.teacherComment && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Comment: {given.teacherComment}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── the whole panel ────────────────────────────────────────────────────────
export default function StudentQuizzesPanel() {
  const [quizzes, setQuizzes] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [list, mine] = await Promise.all([
        api('/student/quizzes'),
        api('/student/quizzes/attempts/mine')
      ]);
      setQuizzes(list.quizzes);
      setAttempts(mine.attempts);
    } catch (e) {
      setQuizzes([]);
      Swal.fire('Could not load your quizzes', e.message, 'error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (openId) return <QuizRunner quizId={openId} onFinished={() => { setOpenId(null); load(); }} />;

  if (!quizzes) return <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Loading your quizzes…</p>;

  const quizzesWithHistory = quizzes.filter((q) => attempts.some((a) => String(a.quiz) === String(q._id)));
  const others = quizzes.filter((q) => !quizzesWithHistory.includes(q));

  const card = (quiz, mine) => {
    const result = mine || quiz.myResult;
    const closed = quiz.windowState === 'closed';
    const done = result && !result.pendingManualMarking;

    return (
      <Card key={quiz._id} style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h4 style={{ margin: '0 0 4px', fontSize: 15, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>{quiz.title}</h4>
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              {quiz.subject ? `${quiz.subject} · ` : ''}{quiz.questionCount} questions · {quiz.totalPoints} marks
              {quiz.closesAt && ` · closes ${fmt(quiz.closesAt)}`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {closed && <Pill tone="bad">Closed</Pill>}
            {!closed && quiz.canAttempt && <Pill tone="good">Open</Pill>}
            {!closed && !quiz.canAttempt && <Pill>Only one try</Pill>}
            {result && <Pill tone={done ? (result.percentage >= 50 ? 'good' : 'bad') : 'warn'}>
              {result.pendingManualMarking ? 'Being marked' : `${result.percentage}%`}
            </Pill>}
            {quiz.canAttempt && <Button small tone="primary" onClick={() => setOpenId(quiz._id)}>
              {result ? 'Sit again' : 'Start'}
            </Button>}
          </div>
        </div>

        {mine && <AttemptRow attempt={mine} quiz={quiz} />}
      </Card>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          Quizzes your teacher sets appear here. Marks for multiple choice come back straight away;
          written answers are marked by hand, and you can review the answers once that is done.
        </p>
      </Card>

      <div>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>Quizzes</h3>
        {!quizzes.length && (
          <Card><p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>No quizzes have been set for you yet.</p></Card>
        )}
        {others.map((q) => card(q, null))}
      </div>

      {quizzesWithHistory.length > 0 && (
        <div>
          <h3 style={{ margin: '0 0 12px', fontSize: 16, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>What you have already handed in</h3>
          {quizzesWithHistory.map((q) => card(q, attempts.filter((a) => String(a.quiz) === String(q._id)).pop()))}
        </div>
      )}
    </div>
  );
}
