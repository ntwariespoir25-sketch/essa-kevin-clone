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

// What the notice reaches. The class is always included, so this list is only
// about who else to copy.
const COPIES = [
  { value: 'students', label: 'Pupils in the class' },
  { value: 'parents', label: 'Their parents' },
  { value: 'teachers', label: 'Other teachers' },
  { value: 'staff', label: 'All staff' }
];

const PRIORITIES = [
  { value: 'low', label: 'Low', color: 'var(--text-secondary)', bg: 'var(--surface-page)' },
  { value: 'normal', label: 'Normal', color: 'var(--navy-mid)', bg: 'var(--tint-primary)' },
  { value: 'high', label: 'High', color: '#c0392b', bg: 'var(--tint-danger)' }
];

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
    danger: { background: '#c0392b', color: 'var(--on-solid)' }
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...tones[tone], border: 'none', borderRadius: 8, padding: small ? '6px 12px' : '9px 16px',
      fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1, ...style
    }}>{children}</button>
  );
};

const inputStyle = { width: '100%', padding: '8px 11px', border: '1px solid var(--surface-sunken-2)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: 'var(--surface-card)' };
const Input = (p) => <input {...p} style={{ ...inputStyle, ...p.style }} />;
const Textarea = (p) => <textarea {...p} style={{ ...inputStyle, resize: 'vertical', minHeight: 110, ...p.style }} />;

const Label = ({ children }) => (
  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4, letterSpacing: 0.4 }}>{children}</label>
);

export const ClassAnnouncementsPanel = () => {
  const [classes, setClasses] = useState([]);
  const [classIds, setClassIds] = useState([]);
  const [audience, setAudience] = useState(['students', 'parents']);
  const [priority, setPriority] = useState('normal');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [notices, setNotices] = useState([]);
  const [busy, setBusy] = useState(false);

  // The same scoped class list the progress page uses, so a teacher is never
  // offered a form they cannot post to.
  const loadClasses = useCallback(async () => {
    try {
      const d = await api('/teacher/progress/classes');
      setClasses(Array.isArray(d.classes) ? d.classes : []);
    } catch { setClasses([]); }
  }, []);

  // GET /announcements returns whole-school notices too. Only the ones carrying
  // classIds are this teacher's class notices; the rest belong to the admin
  // posts in the school-wide feed above.
  const loadNotices = useCallback(async () => {
    try {
      const d = await api('/announcements');
      const list = Array.isArray(d) ? d : [];
      setNotices(list.filter((a) => Array.isArray(a.classIds) && a.classIds.length));
    } catch { setNotices([]); }
  }, []);

  useEffect(() => { loadClasses(); loadNotices(); }, [loadClasses, loadNotices]);

  const labelFor = (ids) => (ids || [])
    .map((id) => classes.find((c) => c._id === id)?.label)
    .filter(Boolean)
    .join(', ') || 'a form';

  // The composer only offers extra copies, because pupils and parents are
  // included whatever is ticked. Anything else in the stored audience is an
  // extra copy worth showing on the record.
  const BASE_RECIPIENTS = ['students', 'parents'];
  const extraCopies = (audienceList) => (audienceList || []).filter((a) => !BASE_RECIPIENTS.includes(a));

  const toggleClass = (id) => setClassIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleCopy = (value) => setAudience((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]));

  const post = async () => {
    if (!title.trim() || !content.trim()) {
      Swal.fire('Missing details', 'A notice needs a title and a message.', 'warning');
      return;
    }
    if (!classIds.length) {
      Swal.fire('Choose a form', 'A class notice has to say which form it is for.', 'warning');
      return;
    }
    setBusy(true);
    try {
      const d = await api('/teacher/announcements', {
        method: 'POST',
        body: JSON.stringify({ title, content, classIds, audience, priority })
      });
      // The server drops any class the teacher does not own rather than posting
      // to it, so say so instead of letting them assume everyone got it.
      if (d.skippedClasses > 0) {
        await Swal.fire('Posted to some forms only',
          `${d.skippedClasses} of the forms you chose are not yours, so the notice was not sent to them.`,
          'warning');
      } else {
        await Swal.fire('Notice posted', `Pupils and parents in ${labelFor(d.announcement.classIds)} can see it now.`, 'success');
      }
      setTitle('');
      setContent('');
      loadNotices();
    } catch (e) {
      Swal.fire('Could not post the notice', e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 4px', fontSize: 17, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>Class Announcements</h3>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-faint)' }}>
        A notice goes only to the forms you pick. Nobody else in the school sees it.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
        <Card title="Post a notice to your forms">
          <div style={{ marginBottom: 12 }}>
            <Label>Which forms?</Label>
            {classes.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>
                You are not assigned to any forms yet, so there is nothing to post to.
              </p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 6 }}>
              {classes.map((c) => {
                const on = classIds.includes(c._id);
                return (
                  <button key={c._id} onClick={() => toggleClass(c._id)}
                    style={{
                      padding: '7px 13px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', border: `1px solid ${on ? 'var(--navy)' : 'var(--border)'}`,
                      background: on ? 'var(--navy)' : 'var(--surface-card)',
                      color: on ? 'var(--on-solid)' : 'var(--text-secondary)'
                    }}>{c.label}</button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Bring your reading book on Friday" />
          </div>

          <div style={{ marginBottom: 12 }}>
            <Label>Message</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)}
              placeholder="What the class needs to know" />
          </div>

          <div style={{ marginBottom: 12 }}>
            <Label>Who should receive it</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 6 }}>
              {COPIES.map((c) => {
                const on = audience.includes(c.value);
                return (
                  <button key={c.value} onClick={() => toggleCopy(c.value)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${on ? 'var(--navy)' : 'var(--border)'}`,
                      background: on ? 'var(--tint-primary)' : 'var(--surface-card)',
                      color: on ? 'var(--navy)' : 'var(--text-faint)'
                    }}>{on ? '✓ ' : ''}{c.label}</button>
                );
              })}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-faint-2)', margin: '6px 0 0' }}>
              Pupils and parents of the forms you chose are included automatically. The buttons above only copy anyone extra.
            </p>
          </div>

          <div style={{ marginBottom: 14 }}>
            <Label>Priority</Label>
            <div style={{ display: 'flex', gap: 7, marginTop: 6 }}>
              {PRIORITIES.map((p) => {
                const on = priority === p.value;
                return (
                  <button key={p.value} onClick={() => setPriority(p.value)}
                    style={{
                      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      border: `1px solid ${on ? p.color : 'var(--border)'}`,
                      background: on ? p.bg : 'var(--surface-card)',
                      color: on ? p.color : 'var(--text-faint)'
                    }}>{p.label}</button>
                );
              })}
            </div>
          </div>

          <Button tone="primary" onClick={post} disabled={busy || !classIds.length}>
            {busy ? 'Posting…' : 'Post notice'}
          </Button>
        </Card>

        <Card title="Your class notices">
          {notices.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>You have not posted a class notice yet.</p>}
          {notices.map((n) => {
            const meta = PRIORITIES.find((p) => p.value === n.priority) || PRIORITIES[1];
            return (
              <div key={n._id} style={{ borderBottom: '1px solid var(--surface-muted)', padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong style={{ fontSize: 14, color: 'var(--navy)' }}>{n.title}</strong>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, color: meta.color, background: meta.bg }}>{meta.label}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-body)', margin: '5px 0', whiteSpace: 'pre-wrap' }}>{n.content}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  {labelFor(n.classIds)} · {fmt(n.createdAt)}
                  {/* Pupils and their parents always receive these, so the audit line names only
                    the extra copies on top of that. */}
                  {extraCopies(n.audienceList).length > 0 && ` · also copied to ${extraCopies(n.audienceList).join(', ')}`}
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
};
