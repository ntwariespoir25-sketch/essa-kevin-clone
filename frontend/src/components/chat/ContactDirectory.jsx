import { useEffect, useMemo, useState } from 'react';
import { chatApi } from './chatApi';
import { roleIcon } from './chatFormat';

const GROUP_ORDER = [
  ['super_admin', 'Head Master'],
  ['academic_admin', 'Academic Admin'],
  ['discipline_admin', 'Discipline'],
  ['accounts_admin', 'Accounts'],
  ['teachers', 'Teachers'],
  ['students', 'Students'],
  ['parents', 'Parents']
];

const avColor = (seed) =>
  ['#16653f', '#2563eb', '#7c3aed', '#b45309', '#0e7490'][(String(seed).length || 0) % 5];

const ContactDirectory = ({ onPick, onCreatedGroup, activeUserId }) => {
  const [users, setUsers] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [checked, setChecked] = useState(new Set());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    chatApi.directory()
      .then((d) => {
        setUsers(d?.users || {});
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const all = useMemo(() => {
    const list = [];
    for (const key of Object.keys(users)) {
      for (const u of users[key] || []) {
        if (String(u._id) !== String(activeUserId)) list.push({ ...u });
      }
    }
    return list;
  }, [users, activeUserId]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter((u) =>
      [u.fullName, u.email, u.studentId, u.sdmsCode, u.className, u.department, u.role]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }, [all, search]);

  const toggleCheck = (id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createGroup = async () => {
    if (!groupName.trim()) return alert('Give the group a name.');
    if (checked.size === 0) return alert('Select at least one member.');
    setCreating(true);
    try {
      const { conversation } = await chatApi.createConversation({
        name: groupName.trim(),
        description: groupDesc.trim(),
        memberIds: [...checked],
        category: 'custom'
      });
      onCreatedGroup && onCreatedGroup(conversation);
      setGroupName('');
      setGroupDesc('');
      setChecked(new Set());
      setShowCreate(false);
    } catch (err) {
      alert(err.message || 'Could not create the group.');
    } finally {
      setCreating(false);
    }
  };

  const groupedByRole = useMemo(() => {
    const map = {};
    for (const u of visible) {
      (map[u.role] = map[u.role] || []).push(u);
    }
    return map;
  }, [visible]);

  return (
    <div className="ck-dir">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <div className="ck-sidebar-search" style={{ flex: 1 }}>
          <input
            placeholder="Search staff, students, parents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="ck-btn" onClick={() => setShowCreate((v) => !v)}>
          <i className="fas fa-users" /> New group
        </button>
      </div>

      {!loaded && (
        <div className="ck-empty"><i className="fas fa-spinner fa-spin ck-bigicon" />Loading directory…</div>
      )}

      {loaded && !visible.length && (
        <div className="ck-empty">
          <i className="fas fa-search ck-bigicon" />
          Nobody matches that search.
        </div>
      )}

      {showCreate && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, marginBottom: 12, background: 'var(--surface-2)' }}>
          <input
            className="ck-sidebar-search"
            style={{ width: '100%', marginBottom: 6, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', background: 'var(--surface)' }}
            placeholder="Group name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
          <input
            className="ck-sidebar-search"
            style={{ width: '100%', marginBottom: 6, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', background: 'var(--surface)' }}
            placeholder="Description (optional)"
            value={groupDesc}
            onChange={(e) => setGroupDesc(e.target.value)}
          />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
            Tick members below, then create. {checked.size > 0 && <b>{checked.size} selected</b>}
          </div>
          <button className="ck-btn primary" onClick={createGroup} disabled={creating}>
            {creating ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />} Create group
          </button>
        </div>
      )}

      {GROUP_ORDER.map(([key, label]) => {
        const list = groupedByRole[key];
        if (!list || !list.length) return null;
        return (
          <div className="ck-dir-group" key={key}>
            <div className="ck-dir-title">{label}</div>
            {list.map((u) => (
              <div className="ck-contact" key={String(u._id)}>
                <div className="ck-avatar sm" style={{ background: avColor(u._id) }}>
                  <i className={`fas ${roleIcon(u.role)}`} style={{ fontSize: 12 }} />
                </div>
                <div className="ck-contact-label">
                  <div className="ck-contact-name">{u.fullName}</div>
                  <div className="ck-contact-sub">
                    {[u.className, u.department, u.studentId, u.email].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {showCreate ? (
                  <input
                    type="checkbox"
                    className="ck-checkbox"
                    checked={checked.has(String(u._id))}
                    onChange={() => toggleCheck(String(u._id))}
                  />
                ) : (
                  <button
                    className="ck-btn"
                    style={{ padding: '5px 10px', fontSize: 12 }}
                    onClick={() => onPick && onPick(u)}
                  >
                    <i className="fas fa-comment" /> Chat
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export default ContactDirectory;