import { useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import { useChatSocket, isTypingIn } from './useChatSocket';
import { useChatHub } from './useChatHub';
import { getCurrentUserId, getCurrentRole } from './chatApi';
import './chat.css';
import ConversationList from './ConversationList';
import MessageBubble from './MessageBubble';
import MessageComposer from './MessageComposer';
import ContactDirectory from './ContactDirectory';
import { PresenceText } from './PresenceDot';
import { dayLabel, roleIcon } from './chatFormat';

const avatarStyle = (seed) => {
  let hash = 0;
  for (const ch of String(seed || '')) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  const colors = ['#16653f', '#2563eb', '#7c3aed', '#b45309', '#0e7490', '#be185d'];
  return { background: colors[hash % colors.length] };
};

const MessagingPanel = ({ height = 'calc(100vh - 150px)', onMessageSent, initialConversationId, recipient }) => {
  const myUserId = getCurrentUserId();
  const myRole = getCurrentRole();
  const { socket, connected, presence } = useChatSocket();
  const hub = useChatHub({ socket, myUserId, myRole, onMessageSent, isOpen: true, recipient, initialConversationId });

  const {
    conversations, activeConversation, messages, pinned, hasMore, loadingThread,
    search, setSearch, replyingTo, setReplyingTo, editingMsg, setEditingMsg, editText, setEditText,
    forwardMsg, setForwardMsg, messagesEndRef,
    openConversation, startConversation, createGroupConversation, loadOlder,
    handleSend, handleEdit, handleDelete, handleReact, handlePin, handleStar,
    handleReport, handleForward, handleCopy, handleAction, handleMute
  } = hub;

  const [showDirectory, setShowDirectory] = useState(false);

  const typingEntry = activeConversation ? isTypingIn(presence, String(activeConversation._id)) : null;
  const typingName = typingEntry?.userId
    ? (activeConversation.participants || []).find((p) => String(p.userId) === String(typingEntry.userId))?.name || 'Someone'
    : null;

  const activePeer = activeConversation?.peer || (activeConversation?.type === 'direct' ? activeConversation.participant : null) || null;
  const peerPresence = activePeer ? presence.get(String(activePeer.id)) : null;
  const headerName = activeConversation?.type === 'group'
    ? activeConversation.name
    : activePeer?.name || 'Conversation';

  const groupedThread = useMemo(() => {
    const out = [];
    let lastDay = '';
    for (const m of messages) {
      const label = dayLabel(new Date(m.createdAt));
      if (label !== lastDay) {
        lastDay = label;
        out.push({ kind: 'day', label });
      }
      out.push({ kind: 'message', message: m });
    }
    return out;
  }, [messages]);

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  const doForward = (message, ids) => handleForward(message, ids);

  return (
    <div style={{
      background: 'var(--surface, #fff)',
      borderRadius: 16,
      boxShadow: '0 2px 12px rgba(0,0,0,.06)',
      overflow: 'hidden',
      height,
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
          <i className="fas fa-comments" style={{ color: 'var(--brand)', marginRight: 8 }} />
          Messages
          {totalUnread > 0 && (
            <span style={{ marginLeft: 8, background: '#e74c3c', color: '#fff', borderRadius: 20, fontSize: 11, padding: '1px 8px' }}>
              {totalUnread} unread
            </span>
          )}
        </span>
        {!connected && <span className="ck-tag"><i className="fas fa-plug-circle-xmark" /> reconnecting…</span>}
        <span style={{ flex: 1 }} />
        <button className="ck-btn" onClick={() => setShowDirectory((v) => !v)}>
          <i className={`fas ${showDirectory ? 'fa-inbox' : 'fa-plus'}`} /> {showDirectory ? 'Inbox' : 'New message'}
        </button>
        <button className="ck-btn" onClick={() => hub.fetchConversations()}>
          <i className="fas fa-refresh" /> Refresh
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <aside style={{
          width: 300, flex: '0 0 300px', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', background: 'var(--surface-2, #f8fafb)', minWidth: 0
        }}>
          <div className="ck-sidebar-head">
            <div className="ck-sidebar-search">
              <input placeholder={showDirectory ? 'Search people…' : 'Search conversations…'} value={showDirectory ? '' : search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 8, minHeight: 0 }}>
            {showDirectory ? (
              <ContactDirectory
                activeUserId={myUserId}
                onPick={(u) => { setShowDirectory(false); startConversation(u); }}
                onCreatedGroup={(conv) => { setShowDirectory(false); createGroupConversation(conv); }}
              />
            ) : (
              <ConversationList
                conversations={conversations}
                activeId={activeConversation?._id}
                presence={presence}
                myUserId={myUserId}
                search={search}
                onSelect={openConversation}
                onAction={handleAction}
                onMute={handleMute}
              />
            )}
          </div>
        </aside>

        <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!activeConversation ? (
            <div className="ck-empty">
              <i className="fas fa-comments ck-bigicon" />
              <h3 style={{ margin: 0, color: 'var(--text)' }}>Start messaging</h3>
              <p style={{ margin: 0 }}>Pick a conversation, search the community, or open a class group.</p>
              <button className="ck-btn primary" onClick={() => setShowDirectory(true)}>
                <i className="fas fa-user-plus" /> New message
              </button>
            </div>
          ) : (
            <>
              <div className="ck-thread-head">
                <button className="ck-iconbtn" title="Leave thread" onClick={() => hub.closeThread?.()}>
                  <i className="fas fa-arrow-left" />
                </button>
                <div className="ck-avatar sm" style={avatarStyle(headerName)}>
                  <i className={`fas ${activeConversation.type === 'group' ? 'fa-people-group' : roleIcon(activePeer?.role)}`} style={{ fontSize: 12 }} />
                </div>
                <div className="ck-thread-title">
                  <div className="ck-thread-name">{headerName}</div>
                  <div className="ck-thread-sub">
                    {activeConversation.type === 'group'
                      ? `${(activeConversation.participants || []).length} members${activeConversation.autoManaged ? ' · class group' : ''}`
                      : <PresenceText online={!!peerPresence?.isOnline} lastSeenAt={peerPresence?.lastSeenAt} />}
                  </div>
                </div>
              </div>

              {pinned.length > 0 && (
                <div className="ck-pinned">
                  <i className="fas fa-thumbtack" style={{ color: 'var(--warning)' }} />
                  <span>Pinned</span>
                  <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pinned[0].content || '[Attachment]'}
                  </div>
                  {pinned.length > 1 && <span>+{pinned.length - 1}</span>}
                </div>
              )}

              <div className="ck-messages">
                {hasMore && (
                  <button className="ck-showmore" onClick={loadOlder} disabled={loadingThread}>
                    {loadingThread ? <i className="fas fa-spinner fa-spin" /> : 'Load earlier messages'}
                  </button>
                )}

                {groupedThread.map((item, i) =>
                  item.kind === 'day' ? (
                    <div className="ck-day" key={`day-${i}`}><span>{item.label}</span></div>
                  ) : (
                    <MessageBubble
                      key={`msg-${item.message._id || i}`}
                      message={item.message}
                      conversation={activeConversation}
                      myUserId={myUserId}
                      onReply={(m) => { setReplyingTo(m); setEditingMsg(null); }}
                      onEdit={(m) => { setEditingMsg(m); setEditText(m.content || ''); setReplyingTo(null); }}
                      onDelete={handleDelete}
                      onReact={handleReact}
                      onPin={handlePin}
                      onStar={handleStar}
                      onForward={(m) => setForwardMsg(m)}
                      onReport={handleReport}
                      onCopy={handleCopy}
                    />
                  )
                )}

                {typingName && (
                  <div className="ck-typing">
                    <i className="fas fa-ellipsis"></i> {typingName} is typing…
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {editingMsg ? (
                <div className="ck-composer">
                  <div className="ck-reply-bar">
                    <i className="fas fa-pen" />
                    <span style={{ flex: 1 }}>Editing your message</span>
                    <button className="ck-iconbtn" style={{ width: 22, height: 22, fontSize: 12 }} onClick={() => setEditingMsg(null)}>
                      <i className="fas fa-times" />
                    </button>
                  </div>
                  <div className="ck-composer-row">
                    <textarea
                      rows={2}
                      value={editText}
                      autoFocus
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (editText.trim()) {
                            handleEdit(editingMsg, editText.trim());
                            setEditingMsg(null);
                          }
                        }
                      }}
                    />
                    <button className="ck-send" onClick={() => {
                      if (editText.trim()) {
                        handleEdit(editingMsg, editText.trim());
                        setEditingMsg(null);
                      }
                    }}>
                      <i className="fas fa-check" />
                    </button>
                  </div>
                </div>
              ) : (
                <MessageComposer
                  conversationId={activeConversation ? String(activeConversation._id) : null}
                  socket={socket}
                  peerId={activePeer ? String(activePeer.id) : null}
                  replyingTo={replyingTo}
                  onCancelReply={() => setReplyingTo(null)}
                  onSend={handleSend}
                />
              )}
            </>
          )}
        </section>
      </div>

      {forwardMsg && (
        <ForwardPicker
          conversations={conversations}
          currentId={activeConversation ? String(activeConversation._id) : null}
          onCancel={() => setForwardMsg(null)}
          onForward={(ids) => doForward(forwardMsg, ids)}
        />
      )}
    </div>
  );
};

const ForwardPicker = ({ conversations, currentId, onCancel, onForward }) => {
  const [selected, setSelected] = useState(new Set());
  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 90, background: 'rgba(15,23,42,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCancel}>
      <div className="ck-menu" style={{ width: 360, maxHeight: 420, overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '10px 12px', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>Forward message</div>
        {conversations.filter((c) => String(c._id) !== String(currentId)).length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No other conversations to forward to.</div>
        )}
        {conversations.filter((c) => String(c._id) !== String(currentId)).map((c) => {
          const peer = c.peer || c.participant || {};
          const name = c.type === 'group' ? c.name : peer.name || 'Conversation';
          return (
            <label key={String(c._id)} className="ck-menu-item" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={selected.has(String(c._id))} onChange={() => toggle(String(c._id))} style={{ marginRight: 8 }} />
              <i className={`fas ${c.type === 'group' ? 'fa-people-group' : roleIcon(peer.role)}`} style={{ width: 16 }} />
              <span style={{ flex: 1 }}>{name}</span>
            </label>
          );
        })}
        <div style={{ padding: 10, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="ck-btn" onClick={onCancel}>Cancel</button>
          <button className="ck-btn primary" disabled={!selected.size} onClick={() => onForward([...selected])}>Forward</button>
        </div>
      </div>
    </div>
  );
};

export default MessagingPanel;