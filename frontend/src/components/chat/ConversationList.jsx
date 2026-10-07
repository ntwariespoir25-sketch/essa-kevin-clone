import React, { useState } from 'react';
import { roleIcon, timeAgo } from './chatFormat';

const AVATAR_COLORS = ['#16653f', '#2563eb', '#7c3aed', '#b45309', '#0e7490', '#be185d'];

const avatarStyle = (seed) => {
  let hash = 0;
  for (const ch of String(seed || '')) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return { background: AVATAR_COLORS[hash % AVATAR_COLORS.length] };
};

const ConversationRow = ({ conv, active, presence, myUserId, onSelect, onAction, onMute }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const peer = conv.peer || conv.participant || null;
  const displayName = conv.type === 'group' ? conv.name : peer?.name || 'Conversation';
  const isAuto = conv.autoManaged;
  const last = conv.lastMessage || {};
  const preview =
    last.type === 'attachment' || last.type === 'file' || last.type === 'image'
      ? 'Attachment'
      : last.content || (conv.messageCount ? '' : 'Say hello');
  const otherId = peer ? String(peer.id) : null;
  const online = otherId ? !!(presence.get(otherId) || {}).isOnline : false;

  const peekIcon = otherId ? roleIcon(peer.role) : 'fa-people-group';

  return (
    <div className="ck-row-body">
      <button
        className={`ck-row ${active ? 'active' : ''}`}
        onClick={() => { onSelect(conv); setMenuOpen(false); }}
      >
        <div className="ck-avatar" style={avatarStyle(displayName)}>
          <i className={`fas ${peekIcon}`} style={{ fontSize: 14 }} />
          {otherId && <span className={`ck-presence ${online ? 'online' : ''}`} />}
        </div>
        <span className="ck-row-body">
          <span className="ck-row-top">
            <span className="ck-row-name">{displayName}</span>
            <span className="ck-row-time">{conv.lastMessageAt ? timeAgo(conv.lastMessageAt) : ''}</span>
          </span>
          <span className="ck-row-bottom">
            <span className={`ck-row-preview ${conv.unreadCount > 0 ? 'unread' : ''}`}>
              {conv.type === 'group' && last.senderId && String(last.senderId) !== String(myUserId)
                ? `${(conv.participants.find(p => String(p.userId) === String(last.senderId))?.name || '').split(' ')[0]}: `
                : ''}
              {preview}
            </span>
            {conv.unreadCount > 0 && <span className="ck-badge">{conv.unreadCount}</span>}
            {conv.type === 'group' && <span className="ck-tag">{conv.category || 'group'}</span>}
          </span>
        </span>
      </button>

      <div style={{ position: 'relative' }}>
        {menuOpen && (
          <div className="ck-menu" style={{ right: 8, top: 0 }}>
            {!isAuto && [
              <button key="pin" className="ck-menu-item" onClick={() => { onAction(conv, 'pin', !conv.isPinned); setMenuOpen(false); }}>
                <i className={`fas fa-thumbtack ${conv.isPinned ? 'active' : ''}`} />
                {conv.isPinned ? 'Unpin' : 'Pin'}
              </button>,
              <button key="archive" className="ck-menu-item" onClick={() => { onAction(conv, conv.isArchived ? 'unarchive' : 'archive'); setMenuOpen(false); }}>
                <i className="fas fa-archive" />
                {conv.isArchived ? 'Unarchive' : 'Archive'}
              </button>
            ]}
            <button
              className="ck-menu-item"
              onClick={() => {
                const minutes = window.prompt('Mute for how many minutes? (0 to unmute)', conv.isMuted ? '0' : '60');
                if (minutes === null || minutes === '') return;
                onMute(conv, Math.max(0, parseInt(minutes, 10) || 0));
                setMenuOpen(false);
              }}
            >
              <i className="fas fa-bell-slash" />
              {conv.isMuted ? 'Unmute' : 'Mute'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const ConversationList = ({
  conversations,
  activeId,
  presence,
  myUserId,
  search,
  onSelect,
  onAction,
  onMute,
  pinnedOnly = false
}) => {
  const visible = conversations.filter((c) => {
    if (pinnedOnly && !c.isPinned) return false;
    if (!search.trim()) return true;
    const peer = c.peer || c.participant || {};
    const hay = [c.name, c.type === 'group' ? c.name : peer.name, peer.role].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(search.trim().toLowerCase());
  });

  if (!visible.length) {
    return (
      <div className="ck-empty" style={{ padding: 40, fontSize: 13 }}>
        <i className="fas fa-inbox ck-bigicon" />
        {search ? 'No conversations match your search.' : 'No conversations yet.'}
      </div>
    );
  }

  const pinned = visible.filter((c) => c.isPinned);
  const rest = visible.filter((c) => !c.isPinned);

  const renderBlock = (list, label) =>
    list.length ? (
      <React.Fragment>
        {label && <div className="ck-group-cap">{label}</div>}
        {list.map((c) => (
          <ConversationRow
            key={String(c._id)}
            conv={c}
            active={String(c._id) === String(activeId)}
            presence={presence}
            myUserId={myUserId}
            onSelect={onSelect}
            onAction={onAction}
            onMute={onMute}
          />
        ))}
      </React.Fragment>
    ) : null;

  return (
    <React.Fragment>
      {renderBlock(pinned, 'Pinned')}
      {renderBlock(rest, 'All')}
    </React.Fragment>
  );
};

export default ConversationList;