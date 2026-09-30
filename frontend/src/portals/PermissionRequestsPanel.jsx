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

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-RW', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const TYPES = [
  { value: 'medical', label: 'Medical', hint: 'A doctor or clinic appointment' },
  { value: 'official', label: 'Official', hint: 'Government or bank business' },
  { value: 'family', label: 'Family', hint: 'Family matter or travel' },
  { value: 'other', label: 'Other', hint: 'Anything else' }
];

const STATUSES = {
  pending: { label: 'Waiting for review', color: '#b9770e', bg: 'var(--tint-warning)' },
  approved: { label: 'Approved', color: '#1e8449', bg: 'var(--tint-success)' },
  rejected: { label: 'Declined', color: '#c0392b', bg: 'var(--tint-danger)' }
};
const statusMeta = (s) => STATUSES[s] || { label: s || 'unknown', color: 'var(--text-secondary)', bg: 'var(--surface-page)' };

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
      ...tones[tone], border: 'none', borderRadius: 8, padding: small ? '6px 12px' : '9px 16px',
      fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.6 : 1, ...style
    }}>{children}</button>
  );
};

const Pill = ({ children, tone }) => {
  const t = tone || { color: 'var(--text-secondary)', background: 'var(--surface-page)' };
  return <span style={{ color: t.color, background: t.bg, display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{children}</span>;
};

const inputStyle = { width: '100%', padding: '8px 11px', border: '1px solid var(--surface-sunken-2)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', background: 'var(--surface-card)' };
const Input = (p) => <input {...p} style={{ ...inputStyle, ...p.style }} />;
const Select = ({ children, ...p }) => <select {...p} style={{ ...inputStyle, ...p.style }}>{children}</select>;
const Textarea = (p) => <textarea {...p} style={{ ...inputStyle, resize: 'vertical', minHeight: 80, ...p.style }} />;

const Label = ({ children }) => (
  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4, letterSpacing: 0.4 }}>{children}</label>
);

export const PermissionRequestsPanel = () => {
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState({ type: 'medical', reason: '', fromDate: '', toDate: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      // The endpoint returns only this teacher's own requests, so there is no
      // filter to get wrong here.
      const d = await api('/permissions');
      setRequests(Array.isArray(d) ? d : []);
    } catch {
      setRequests([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selected = TYPES.find((t) => t.value === form.type);

  const submit = async () => {
    if (!form.reason.trim()) {
      Swal.fire('Add a reason', 'The reason is what the office reviews the request against.', 'warning');
      return;
    }
    if (form.fromDate && form.toDate && new Date(form.toDate) < new Date(form.fromDate)) {
      Swal.fire('Check the dates', 'The last day comes before the first day.', 'warning');
      return;
    }
    setBusy(true);
    try {
      await api('/permissions', { method: 'POST', body: JSON.stringify(form) });
      await Swal.fire('Request sent', 'The office will review it and you will see the decision here.', 'success');
      setForm({ type: 'medical', reason: '', fromDate: '', toDate: '' });
      load();
    } catch (e) {
      Swal.fire('Could not send the request', e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const print = async (request) => {
    try {
      await openPrintableDocument(`/permissions/${request._id}/slip`, API_URL, `Permission slip — ${request.requesterName}`);
    } catch (e) {
      Swal.fire('Could not open the slip', e.message, 'error');
    }
  };

  const pending = requests.filter((r) => r.status === 'pending');

  return (
    <div>
      <h3 style={{ margin: '0 0 4px', fontSize: 17, fontFamily: 'Georgia, serif', color: 'var(--navy)' }}>Permission Requests</h3>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-faint)' }}>
        Ask the office for permission to be out of school. Once it is approved you can print the slip to show on return.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
        <Card title="New request">
          <div style={{ marginBottom: 12 }}>
            <Label>Reason for leaving</Label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 7 }}>
              {TYPES.map((t) => {
                const on = form.type === t.value;
                return (
                  <button key={t.value} onClick={() => setForm({ ...form, type: t.value })}
                    style={{
                      textAlign: 'left', padding: '9px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                      border: `1px solid ${on ? 'var(--navy)' : 'var(--border)'}`,
                      background: on ? 'var(--tint-primary)' : 'var(--surface-card)'
                    }}>
                    <div style={{ fontWeight: 700, color: on ? 'var(--navy)' : 'var(--text-secondary)' }}>{t.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>{t.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <Label>From</Label>
              <Input type="date" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} />
            </div>
            <div>
              <Label>Until</Label>
              <Input type="date" value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <Label>What is it for?</Label>
            <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder={`e.g. ${selected ? selected.hint.toLowerCase() : 'the reason you are leaving school'}`} />
          </div>

          <Button tone="primary" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Send request'}</Button>
        </Card>

        <Card
          title="My requests"
          action={pending.length > 0 && <Pill tone={STATUSES.pending}>{pending.length} waiting</Pill>}
        >
          {requests.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>
              You have not asked for permission yet. Anything you send appears here with its decision.
            </p>
          )}
          {requests.map((r) => {
            const meta = statusMeta(r.status);
            return (
              <div key={r._id} style={{ borderBottom: '1px solid var(--surface-muted)', padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 14, color: 'var(--navy)', textTransform: 'capitalize' }}>{r.type || 'request'}</strong>
                    <Pill tone={meta}>{meta.label}</Pill>
                  </div>
                  {r.status === 'approved' && (
                    <Button small tone="go" onClick={() => print(r)}>Print slip</Button>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-body)', margin: '5px 0' }}>{r.reason}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  {r.fromDate ? `${fmt(r.fromDate)}${r.toDate ? ` to ${fmt(r.toDate)}` : ''}` : 'No dates given'} · sent {fmt(r.createdAt)}
                </div>
                {r.status === 'rejected' && r.rejectionReason && (
                  <div style={{ marginTop: 7, padding: '8px 11px', borderRadius: 8, background: 'var(--tint-danger)', fontSize: 12, color: 'var(--text-body)' }}>
                    <strong style={{ color: '#c0392b' }}>Declined:</strong> {r.rejectionReason}
                  </div>
                )}
                {r.status === 'approved' && r.reviewedAt && (
                  <div style={{ fontSize: 11, color: 'var(--text-faint-2)', marginTop: 4 }}>
                    Approved {fmt(r.reviewedAt)}{r.slipGeneratedCount > 0 && ` · slip printed ${r.slipGeneratedCount} time${r.slipGeneratedCount === 1 ? '' : 's'}`}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
};
