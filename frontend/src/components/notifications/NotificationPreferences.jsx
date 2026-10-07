import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { notificationApi } from './notificationApi';
import './notifications.css';

const CHANNEL_LABELS = {
  inApp: { icon: 'fa-bell', label: 'In-app' },
  email: { icon: 'fa-envelope', label: 'Email' },
  push: { icon: 'fa-mobile-screen', label: 'Push' },
  sms: { icon: 'fa-message', label: 'SMS' }
};

const TYPE_LABELS = {
  message: 'Direct messages',
  group_message: 'Group messages',
  mention: 'Mentions',
  reply: 'Replies',
  announcement: 'Announcements',
  assignment: 'Assignments',
  exam: 'Exams',
  fee: 'Fee reminders',
  attendance: 'Attendance',
  system: 'System alerts'
};

const minutesToTime = (m) => {
  const h = Math.floor((Number(m) || 0) / 60) % 24;
  const min = (Number(m) || 0) % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

const timeToMinutes = (t) => {
  const [h, m] = String(t || '').split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return (h % 24) * 60 + m;
};

const toggle = (obj, key) => ({ ...obj, [key]: !obj[key] });

const NotificationPreferences = ({ onSaved }) => {
  const [prefs, setPrefs] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    notificationApi.getPreferences().then((d) => {
      setPrefs(d.prefs || d.preferences || d);
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const d = await notificationApi.savePreferences({
        channels: prefs?.channels,
        types: prefs?.types,
        quietHours: prefs?.quietHours,
        mutedConversations: prefs?.mutedConversations || []
      });
      setPrefs(d.prefs || d.preferences || d);
      setDirty(false);
      onSaved && onSaved();
      Swal.fire({ title: 'Saved', text: 'Your notification settings were updated.', icon: 'success', timer: 1400, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ title: err.message || 'Could not save settings.', icon: 'error', confirmButtonColor: 'var(--navy)' });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    try {
      const d = await notificationApi.sendTest();
      Swal.fire({
        title: 'Test sent',
        text: d?.message || 'A test notification was added to your inbox.',
        icon: 'success',
        timer: 1600,
        showConfirmButton: false
      });
    } catch (err) {
      Swal.fire({ title: err.message || 'Could not send a test.', icon: 'error', confirmButtonColor: 'var(--navy)' });
    }
  };

  if (!prefs) {
    return (
      <div className="ck-empty" style={{ padding: 40 }}>
        <i className="fas fa-spinner fa-spin ck-bigicon" />
        Loading preferences…
      </div>
    );
  }

  const channels = Object.keys(CHANNEL_LABELS);
  const types = Object.keys(TYPE_LABELS);
  const qh = prefs.quietHours || { enabled: false, start: 1320, end: 360 };

  return (
    <div style={{ padding: '14px 16px', maxWidth: 760, overflowY: 'auto' }}>
      <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 18, color: 'var(--text)' }}>
        <i className="fas fa-bell" style={{ color: 'var(--brand)', marginRight: 8 }} />
        Notification settings
      </h3>
      <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 13 }}>
        Choose which channels carry your alerts, mute noisy types, and set quiet hours.
      </p>

      <div style={{ display: 'flex', gap: '6px 14px', flexWrap: 'wrap', marginBottom: 16 }}>
        {channels.map((key) => {
          const c = CHANNEL_LABELS[key];
          const locked = key === 'inApp';
          return (
            <button
              key={key}
              onClick={() => { if (!locked) { setPrefs({ ...prefs, channels: toggle(prefs.channels, key) }); setDirty(true); } }}
              className={`nx-chip ${prefs.channels[key] ? 'active' : ''}`}
              title={key === 'push' || key === 'sms' ? 'Requires a provider to be configured' : undefined}
              style={locked ? { cursor: 'not-allowed' } : undefined}
            >
              <i className={`fas ${c.icon}`} style={{ marginRight: 5 }} />
              {c.label} {prefs.channels[key] ? '· on' : '· off'}
            </button>
          );
        })}
        <span style={{ fontSize: 11, color: 'var(--text-faint)', alignSelf: 'center' }}>
          In-app is always on · Push/SMS are stubs until a provider is set up
        </span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Message types</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: '6px 10px', marginBottom: 18 }}>
        {types.map((key) => {
          const locked = key === 'system';
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="nx-switch">
                <input
                  type="checkbox"
                  checked={!!prefs.types[key]}
                  disabled={locked}
                  onChange={() => { setPrefs({ ...prefs, types: toggle(prefs.types, key) }); setDirty(true); }}
                />
                <span className="nx-knob" />
              </span>
              <label style={{ fontSize: 13, cursor: locked ? 'not-allowed' : 'pointer', color: 'var(--text)' }}>
                {TYPE_LABELS[key]} {locked && '(always)'}
              </label>
            </div>
          );
        })}
      </div>

      <div className="nx-field" style={{ marginBottom: 18 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="nx-switch">
            <input
              type="checkbox"
              checked={!!qh.enabled}
              onChange={() => { setPrefs({ ...prefs, quietHours: { ...qh, enabled: !qh.enabled } }); setDirty(true); }}
            />
            <span className="nx-knob" />
          </span>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>Quiet hours</span>
          <span style={{ fontWeight: 400, color: 'var(--text-faint)', fontSize: 12 }}>
            messages are deferred, never dropped
          </span>
        </label>
        {qh.enabled && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <div className="nx-field">
              <label>Start</label>
              <input
                type="time"
                className="nx-input"
                defaultValue={minutesToTime(qh.start)}
                onBlur={(e) => {
                  const s = timeToMinutes(e.target.value);
                  setPrefs({ ...prefs, quietHours: { ...qh, start: s } });
                  setDirty(true);
                }}
              />
            </div>
            <div className="nx-field">
              <label>End</label>
              <input
                type="time"
                className="nx-input"
                defaultValue={minutesToTime(qh.end)}
                onBlur={(e) => {
                  const s = timeToMinutes(e.target.value);
                  setPrefs({ ...prefs, quietHours: { ...qh, end: s } });
                  setDirty(true);
                }}
              />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {minutesToTime(qh.start)} – {minutesToTime(qh.end)} local time
            </span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="ck-btn primary" onClick={save} disabled={saving || !dirty}>
          {saving ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-save" />} Save settings
        </button>
        <button className="ck-btn" onClick={sendTest}>
          <i className="fas fa-paper-plane" /> Send test notification
        </button>
      </div>
    </div>
  );
};

export default NotificationPreferences;