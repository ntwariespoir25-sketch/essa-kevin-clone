import { useCallback, useEffect, useState } from 'react';
import { notificationApi } from './notificationApi';
import { timeAgo } from '../chat/chatFormat';
import './notifications.css';

const TYPE_STYLE = {
  message:        { icon: 'fa-envelope',        color: '#2563eb', label: 'Message' },
  group_message:  { icon: 'fa-users',           color: '#7c3aed', label: 'Group' },
  mention:        { icon: 'fa-at',              color: '#be185d', label: 'Mention' },
  reply:          { icon: 'fa-reply',           color: '#0e7490', label: 'Reply' },
  announcement:   { icon: 'fa-bullhorn',        color: '#16653f', label: 'Announcement' },
  assignment:     { icon: 'fa-book-open',       color: '#b45309', label: 'Assignment' },
  exam:           { icon: 'fa-file-lines',      color: '#b91c1c', label: 'Exam' },
  fee:            { icon: 'fa-coins',           color: '#15803d', label: 'Fee' },
  attendance:     { icon: 'fa-clipboard-check', color: '#4b5563', label: 'Attendance' },
  system:         { icon: 'fa-shield-halved',   color: '#374151', label: 'System' }
};

const DEFAULT_STYLE = { icon: 'fa-bell', color: '#5f6b76', label: 'Notice' };

const NotificationCentre = ({ onNavigate, onUnreadChange, refreshSignal = 0, maxHeight = 420, header }) => {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [unreadByType, setUnreadByType] = useState({});
  const [hasMore, setHasMore] = useState(false);
  const [type, setType] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (before = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '30');
      if (before) params.set('before', before);
      if (unreadOnly) params.set('unread', 'true');
      if (type) params.set('type', type);
      const d = await notificationApi.list(`?${params.toString()}`);
      setItems((prev) => {
        const known = before ? new Set(prev.map((n) => String(n._id))) : new Set();
        const fresh = (d.notifications || []).filter((n) => !known.has(String(n._id)));
        return before ? [...prev, ...fresh] : fresh;
      });
      setHasMore(!!d.hasMore);
      setUnread((u) => (d.unread != null ? d.unread : u));
      setUnreadByType(d.unreadByType || {});
    } catch {
      /* keep the previous list */
    } finally {
      setLoading(false);
    }
  }, [unreadOnly, type]);

  useEffect(() => {
    if (loading) return undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    notificationApi.unreadCount().then((d) => setUnread(d?.count ?? 0)).catch(() => {});
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, unreadOnly, refreshSignal]);

  useEffect(() => {
    onUnreadChange && onUnreadChange(unread);
  }, [unread, onUnreadChange]);

  const refresh = () => { setItems([]); load(); };

  const markRead = async (n) => {
    if (n.read) return;
    setBusyId(String(n._id));
    try {
      await notificationApi.markRead(String(n._id));
      setItems((prev) => prev.map((x) => (String(x._id) === String(n._id) ? { ...x, read: true } : x)));
      setUnread((v) => Math.max(0, v - 1));
      notificationApi.unreadCount().then((d) => setUnread(d?.count ?? 0)).catch(() => {});
      if (n.link) onNavigate && onNavigate(n.link);
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  };

  const markAllRead = async () => {
    try {
      await notificationApi.markAllRead(type || undefined);
      setItems((prev) => prev.map((x) => ({ ...x, read: true })));
      setUnread(0);
      setUnreadByType(type ? { ...unreadByType, [type]: 0 } : {});
    } catch {
      /* ignore */
    }
  };

  const deleteItem = async (id, e) => {
    e.stopPropagation();
    try {
      await notificationApi.remove(String(id));
      setItems((prev) => prev.filter((n) => String(n._id) !== String(id)));
      notificationApi.unreadCount().then((d) => setUnread(d?.count ?? 0)).catch(() => {});
    } catch {
      /* ignore */
    }
  };

  const types = Object.keys(unreadByType);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {header !== false && (
        <div className="nx-head">
          <i className="fas fa-bell" style={{ color: 'var(--brand)' }} />
          <span style={{ fontWeight: 700, flex: 1 }}>Notifications</span>
          {unread > 0 && (
            <button className="ck-btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={markAllRead}>
              <i className="fas fa-check-double" /> Mark all read
            </button>
          )}
          {items.length > 0 && (
            <button className="ck-iconbtn" title="Clear read items" onClick={() => refresh()}>
              <i className="fas fa-refresh" />
            </button>
          )}
        </div>
      )}

      <div style={{ padding: '8px 10px', display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
        <button className={`nx-chip ${type === '' ? 'active' : ''}`} onClick={() => setType('')}>
          All {unread > 0 && `(${unread})`}
        </button>
        {types.slice(0, 6).map((t) => (
          <button
            key={t}
            className={`nx-chip ${type === t ? 'active' : ''}`}
            onClick={() => setType(type === t ? '' : t)}
          >
            {(TYPE_STYLE[t] || DEFAULT_STYLE).label} ({unreadByType[t]})
          </button>
        ))}
        <button
          className={`nx-chip ${unreadOnly ? 'active' : ''}`}
          onClick={() => setUnreadOnly((v) => !v)}
          title="Only unread"
        >
          <i className="fas fa-envelope-open" /> Unread
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, maxHeight }}>
        {loading && !items.length && (
          <div className="ck-empty" style={{ padding: 30 }}>
            <i className="fas fa-spinner fa-spin ck-bigicon" />
          </div>
        )}

        {!loading && !items.length && (
          <div className="ck-empty" style={{ padding: 30, fontSize: 13 }}>
            <i className="fas fa-bell-slash ck-bigicon" />
            No notifications {unreadOnly ? 'unread' : ''}.
          </div>
        )}

        {items.map((n) => {
          const style = TYPE_STYLE[n.type] || DEFAULT_STYLE;
          return (
            <button key={String(n._id)} className={`nx-row ${n.read ? '' : 'unread'}`} onClick={() => markRead(n)}>
              <div className="nx-icon" style={{ background: style.color }}>
                <i className={`fas ${style.icon}`} />
              </div>
              <div className="nx-row-body">
                <div className="nx-row-title">
                  <span className={`nx-dot ${n.read ? 'hidden' : ''}`} />
                  <span style={{ flex: 1 }}>{n.title}</span>
                </div>
                {n.body && <div className="nx-row-body-text">{n.body}</div>}
                <div className="nx-row-meta">
                  <span>{timeAgo(n.createdAt)}</span>
                  <span className="nx-tag">{style.label}</span>
                  {n.count > 1 && <span className="nx-tag">×{n.count}</span>}
                  {n.delivery?.email?.error === 'send_failed' && (
                    <span title="Email delivery failed">⚠️</span>
                  )}
                </div>
              </div>
              <span
                className="ck-iconbtn"
                style={{ width: 26, height: 26, fontSize: 13 }}
                onClick={(e) => deleteItem(n._id, e)}
                title="Delete"
              >
                <i className={`fas ${busyId === String(n._id) ? 'fa-spinner fa-spin' : 'fa-trash'}`} />
              </span>
            </button>
          );
        })}

        {hasMore && (
          <div style={{ padding: 10, textAlign: 'center' }}>
            <button className="ck-btn" onClick={() => load(items[items.length - 1]?._id)} disabled={loading}>
              {loading ? <i className="fas fa-spinner fa-spin" /> : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationCentre;