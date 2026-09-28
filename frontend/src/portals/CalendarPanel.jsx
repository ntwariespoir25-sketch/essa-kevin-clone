import React, { useState, useEffect, useCallback } from 'react';

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

const CATEGORIES = [
  { value: 'academic', label: 'Academic', color: '#3498db' },
  { value: 'exam', label: 'Exam', color: '#e74c3c' },
  { value: 'sports', label: 'Sports', color: '#27ae60' },
  { value: 'meeting', label: 'Meeting', color: '#9b59b6' },
  { value: 'holiday', label: 'Holiday', color: '#f39c12' },
  { value: 'event', label: 'Event', color: '#1abc9c' }
];
const AUDIENCES = ['all', 'students', 'teachers', 'parents', 'staff'];

const catColour = (c) => (CATEGORIES.find(x => x.value === c) || CATEGORIES[0]).color;

const inputStyle = {
  width: '100%', padding: '8px 11px', border: '1.5px solid #e0e0e0', borderRadius: 8,
  fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: 'white'
};
const Inp = (p) => <input {...p} style={{ ...inputStyle, ...p.style }} />;
const Sel = ({ children, ...p }) => <select {...p} style={{ ...inputStyle, ...p.style }}>{children}</select>;
const Txt = (p) => <textarea {...p} style={{ ...inputStyle, minHeight: 64, resize: 'vertical', ...p.style }} />;

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

const Lbl = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 5 }}>{children.toUpperCase()}</div>
);

const monthName = (d) => d.toLocaleDateString('en-RW', { month: 'long', year: 'numeric' });
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Six-week grid starting Monday, matching the timetable's Monday-Saturday week.
const buildGrid = (cursor) => {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
};

export const CalendarPanel = () => {
  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ title: '', date: '', time: '', endDate: '', location: '', category: 'academic', description: '', audience: ['all'], permissionRequired: false });
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    const grid = buildGrid(cursor);
    const from = grid[0];
    const to = grid[41];
    return api(`/events?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then(d => setEvents(d.events || []))
      .catch(() => setEvents([]));
  }, [cursor]);

  useEffect(() => { load(); }, [load]);

  const eventsOn = (day) => events.filter(e => sameDay(new Date(e.date), day));
  const today = new Date();
  const upcoming = events
    .filter(e => new Date(e.date) >= new Date(today.getFullYear(), today.getMonth(), today.getDate()))
    .slice(0, 8);

  const create = async () => {
    if (!form.title.trim() || !form.date) { alert('Title and date are required'); return; }
    try {
      await api('/events', { method: 'POST', body: JSON.stringify(form) });
      setOpen(false);
      setForm({ ...form, title: '', description: '', time: '', location: '' });
      load();
    } catch (e) { alert(e.message); }
  };

  const remove = async (id) => {
    if (!confirm('Remove this event from the calendar?')) return;
    await api(`/events/${id}`, { method: 'DELETE' });
    if (selected?._id === id) setSelected(null);
    load();
  };

  const shift = (months) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + months, 1));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>School Calendar</h2>
          <p style={{ margin: '5px 0 0', fontSize: 12.5, color: '#888', maxWidth: 620, lineHeight: 1.5 }}>
            Exams, holidays, meetings and sports in one place. Everything here is visible to the whole school.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Btn small icon="fas fa-chevron-left" color="#6c757d" onClick={() => shift(-1)} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1a3a5c', minWidth: 160, textAlign: 'center' }}>{monthName(cursor)}</span>
          <Btn small icon="fas fa-chevron-right" color="#6c757d" onClick={() => shift(1)} />
          <Btn small icon="fas fa-calendar-day" onClick={() => setCursor(new Date())}>Today</Btn>
          <Btn small icon="fas fa-plus" color="#27ae60" onClick={() => setOpen(true)}>Add event</Btn>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(240px,1fr)', gap: 18, alignItems: 'start' }}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: '#f7f9fb', borderBottom: '1px solid #eee' }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <div key={d} style={{ padding: '8px', fontSize: 10, fontWeight: 700, color: '#888', textAlign: 'center', letterSpacing: .5 }}>{d.toUpperCase()}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
            {buildGrid(cursor).map((day, i) => {
              const inMonth = day.getMonth() === cursor.getMonth();
              const isToday = sameDay(day, today);
              const list = eventsOn(day);
              return (
                <button
                  key={i}
                  onClick={() => { setSelected(day); setForm(f => ({ ...f, date: dayKey(day) })); }}
                  style={{
                    minHeight: 86, padding: 5, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                    background: isToday ? '#fffdf5' : inMonth ? 'white' : '#fafbfc',
                    border: 'none', borderRight: '1px solid #f2f4f6', borderBottom: '1px solid #f2f4f6'
                  }}
                >
                  <div style={{
                    fontSize: 11, fontWeight: 700, marginBottom: 3,
                    color: isToday ? '#fff' : inMonth ? '#555' : '#ccc'
                  }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 20, height: 20, borderRadius: '50%', background: isToday ? '#ffc107' : 'transparent',
                      color: isToday ? '#1a3a5c' : 'inherit'
                    }}>{day.getDate()}</span>
                  </div>
                  {list.slice(0, 2).map(e => (
                    <div key={e._id} style={{ fontSize: 9.5, color: catColour(e.category), fontWeight: 700, background: `${catColour(e.category)}14`, borderLeft: `2px solid ${catColour(e.category)}`, padding: '2px 4px', borderRadius: 3, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.time ? `${e.time} ` : ''}{e.title}
                    </div>
                  ))}
                  {list.length > 2 && <div style={{ fontSize: 9, color: '#999', paddingLeft: 4 }}>+{list.length - 2} more</div>}
                </button>
              );
            })}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card>
            <h3 style={{ margin: '0 0 10px', fontSize: 13, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>Coming up</h3>
            {upcoming.length === 0
              ? <p style={{ fontSize: 12, color: '#bbb', margin: 0 }}>Nothing scheduled.</p>
              : upcoming.map(e => (
                <div key={e._id} style={{ display: 'flex', gap: 9, padding: '7px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <div style={{ width: 4, borderRadius: 2, background: catColour(e.category), flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#333' }}>{e.title}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>
                      {new Date(e.date).toLocaleDateString('en-RW', { day: '2-digit', month: 'short' })}
                      {e.time ? ` · ${e.time}` : ''}
                    </div>
                  </div>
                  <button onClick={() => remove(e._id)} title="Remove" style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 11, height: 20 }}><i className="fas fa-times" /></button>
                </div>
              ))}
          </Card>

          <Card>
            <h3 style={{ margin: '0 0 8px', fontSize: 13, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>Categories</h3>
            {CATEGORIES.map(c => (
              <div key={c.value} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#666', padding: '3px 0' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color }} />
                {c.label}
                <span style={{ marginLeft: 'auto', color: '#bbb' }}>{events.filter(e => e.category === c.value).length}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 480, padding: 22, maxHeight: '90vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>
              {selected ? `Add event — ${selected.toLocaleDateString('en-RW', { day: '2-digit', month: 'long' })}` : 'Add event'}
            </h3>
            <div style={{ marginBottom: 12 }}><Lbl>Title</Lbl><Inp value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Term 2 examinations begin" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div><Lbl>Date</Lbl><Inp type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div><Lbl>Time</Lbl><Inp value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} placeholder="e.g. 08:00" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div><Lbl>Ends</Lbl><Inp type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></div>
              <div><Lbl>Location</Lbl><Inp value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Main hall" /></div>
            </div>
            <div style={{ marginBottom: 12 }}><Lbl>Category</Lbl>
              <Sel value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Sel>
            </div>
            <div style={{ marginBottom: 12 }}><Lbl>Audience</Lbl>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {AUDIENCES.map(a => {
                  const on = form.audience.includes(a);
                  return (
                    <button key={a} onClick={() => setForm({ ...form, audience: on ? form.audience.filter(x => x !== a) : [...form.audience, a] })} style={{
                      padding: '5px 11px', borderRadius: 20, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1.5px solid ${on ? '#1a3a5c' : '#e0e0e0'}`, background: on ? '#1a3a5c' : 'white', color: on ? 'white' : '#666'
                    }}>{a === 'all' ? 'Everyone' : a[0].toUpperCase() + a.slice(1)}</button>
                  );
                })}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}><Lbl>Description</Lbl><Txt value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#555', marginBottom: 16 }}>
              <input type="checkbox" checked={form.permissionRequired} onChange={e => setForm({ ...form, permissionRequired: e.target.checked })} />
              Needs parent permission to attend
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Btn color="#6c757d" onClick={() => setOpen(false)}>Cancel</Btn>
              <Btn icon="fas fa-check" color="#27ae60" onClick={create}>Add to calendar</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
