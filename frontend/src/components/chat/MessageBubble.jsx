import { useRef, useState } from 'react';
import { clockTime, roleLabel, extentColor, fileIcon } from './chatFormat';

const QUICK_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

const AttachmentBlock = ({ attachments }) => {
  if (!attachments || !attachments.length) return null;
  return (
    <div className="ck-attachments">
      {attachments.map((file) =>
        file.kind === 'image' || (file.mime || '').startsWith('image/') ? (
          <a
            key={file.url || file.name}
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="ck-attachments"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={file.url} alt={file.name} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          </a>
        ) : (
          <a key={file.url || file.name} href={file.url} target="_blank" rel="noreferrer" className="ck-file" onClick={(e) => e.stopPropagation()}>
            <i className={`fas ${fileIcon(file.kind, file.mime)}`} style={{ color: extentColor(file.kind) }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name || 'file'}</span>
            {file.size ? <span style={{ opacity: 0.7, flex: '0 0 auto' }}>{(file.size / 1024).toFixed(0)} KB</span> : null}
          </a>
        )
      )}
    </div>
  );
};

const MessageBubble = ({
  message,
  conversation,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onPin,
  onStar,
  onForward,
  onReport,
  onCopy
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const menuRef = useRef(null);

  const closeAll = () => { setMenuOpen(false); setEmojiOpen(false); };

  const isSystem = message.type === 'system' || message.type === 'announcement';
  if (message.deletedForEveryone) {
    return (
      <div className="ck-sys-msg">
        <i className="fas fa-ban" style={{ marginRight: 6 }} />
        This message was deleted.
      </div>
    );
  }
  if (message.deletedForMe) return null;

  if (isSystem) {
    return (
      <div className="ck-sys-msg">
        {message.content}
      </div>
    );
  }

  const mine = !!message.isMine;
  const showSender = conversation?.type === 'group' && !mine;
  const senderName = message.senderName || conversation?.participants.find(p => String(p.userId) === String(message.senderId))?.name || '';

  const handleMenu = (e) => {
    e.stopPropagation();
    setEmojiOpen(false);
    setMenuOpen((v) => !v);
  };

  const handleEmoji = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    setEmojiOpen((v) => !v);
  };

  const act = (fn) => (e) => { e.stopPropagation(); closeAll(); fn && fn(); };

  return (
    <div className={`ck-bubble-row ${mine ? 'mine' : ''}`}>
      <div className="ck-bubble-wrap">
        {showSender && (
          <div className="ck-bubble-meta">
            <span style={{ fontWeight: 700, color: 'var(--text, #1f2933)' }}>{senderName}</span>
            <span>{roleLabel(message.senderRole)}</span>
          </div>
        )}

        <div className="ck-bubble" onDoubleClick={() => onCopy && onCopy(message)}>
          {message.replyPreview && (
            <div className="ck-reply-preview">
              <div style={{ fontWeight: 600 }}>↩ {message.replyPreview.senderName || 'Reply'}</div>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {message.replyPreview.type === 'image' || message.replyPreview.type === 'file'
                  ? '[Attachment]'
                  : message.replyPreview.content}
              </div>
            </div>
          )}

          {message.content && <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>}
          <AttachmentBlock attachments={message.attachments} mine={mine} />

          {message.reactions.length > 0 && (
            <div className="ck-reactions">
              {message.reactions.map((r) => (
                <button
                  key={r.emoji}
                  className={`ck-react-pill ${r.mine ? 'mine' : ''}`}
                  onClick={() => onReact && onReact(message, r.emoji)}
                  title={r.mine ? 'Click to remove' : 'Toggle reaction'}
                >
                  {r.emoji} {r.count}
                </button>
              ))}
            </div>
          )}

          <div className="ck-foot">
            <span>{clockTime(message.createdAt)}</span>
            {message.isEdited && <span>(edited)</span>}
            {message.forwardedFrom && <span><i className="fas fa-forward" style={{ marginRight: 4 }} />forwarded</span>}
            {message.pinned && <span title="Pinned"><i className="fas fa-thumbtack" /></span>}
            {mine && message.status && (
              <span title={`${message.status}${message.readByCount > 1 ? ` · ${message.readByCount} seen` : ''}`} style={{ opacity: message.status === 'read' ? 1 : 0.85 }}>
                {message.status === 'read' ? <i className="fas fa-check-double" /> : message.status === 'delivered' || message.starred ? <i className="fas fa-check-double" /> : <i className="fas fa-check" />}
              </span>
            )}
            {mine && message.starred && <i className="fas fa-star" style={{ color: 'var(--warning, #b45309)' }} />}
          </div>
        </div>

        <div className="ck-actionbar">
          <button className="ck-quick" title="React" onClick={handleEmoji}><i className="fas fa-smile" /></button>
          {onReply && <button className="ck-quick" title="Reply" onClick={act(() => onReply(message))}><i className="fas fa-reply" /></button>}
          <button className="ck-quick" title="More" onClick={handleMenu}><i className="fas fa-ellipsis-h" /></button>

          {emojiOpen && (
            <div className="ck-menu" ref={menuRef} style={{ left: 0, top: 26 }}>
              <div className="ck-emoji-strip">
                {QUICK_EMOJIS.map((emoji) => (
                  <button key={emoji} className="ck-emoji" onClick={act(() => onReact && onReact(message, emoji))}>{emoji}</button>
                ))}
              </div>
            </div>
          )}

          {menuOpen && (
            <div className="ck-menu" ref={menuRef} style={{ left: 0, top: 26 }}>
              {onCopy && (
                <button className="ck-menu-item" onClick={act(() => onCopy(message))}>
                  <i className="fas fa-copy" /> Copy text
                </button>
              )}
              {onReply && (
                <button className="ck-menu-item" onClick={act(() => onReply(message))}>
                  <i className="fas fa-reply" /> Reply
                </button>
              )}
              {message.isMine && onEdit && (
                <button className="ck-menu-item" onClick={act(() => onEdit(message))}>
                  <i className="fas fa-pen" /> Edit
                </button>
              )}
              {onForward && (
                <button className="ck-menu-item" onClick={act(() => onForward(message))}>
                  <i className="fas fa-forward" /> Forward
                </button>
              )}
              {onPin && (
                <button className="ck-menu-item" onClick={act(() => onPin(message, !message.pinned))}>
                  <i className={`fas fa-thumbtack ${message.pinned ? 'active' : ''}`} /> {message.pinned ? 'Unpin' : 'Pin'}
                </button>
              )}
              {onStar && (
                <button className="ck-menu-item" onClick={act(() => onStar(message))}>
                  <i className="fas fa-star" /> {message.starred ? 'Unstar' : 'Star'}
                </button>
              )}
              {onReport && (
                <button
                  className="ck-menu-item"
                  onClick={act(() => {
                    const reason = window.prompt('Reason for reporting this message?', 'Inappropriate content');
                    if (reason && reason.trim()) onReport(message, reason.trim());
                  })}
                >
                  <i className="fas fa-flag" /> Report
                </button>
              )}
              {onDelete && (
                <>
                  {message.isMine && (
                    <button className="ck-menu-item danger" onClick={act(() => {
                      if (window.confirm('Delete this message for everyone?')) onDelete(message, 'everyone');
                    })}>
                      <i className="fas fa-trash" /> Delete for everyone
                    </button>
                  )}
                  <button className="ck-menu-item danger" onClick={act(() => onDelete(message, 'me'))}>
                    <i className="fas fa-trash" /> Delete for me
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;