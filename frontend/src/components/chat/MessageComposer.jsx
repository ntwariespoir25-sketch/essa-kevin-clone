import { useEffect, useRef, useState } from 'react';
import { chatApi } from './chatApi';
import { emitTyping, emitLegacyTyping } from './useChatSocket';
import { extentColor } from './chatFormat';

const MessageComposer = ({ conversationId, socket, peerId, replyingTo, onCancelReply, onSend }) => {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [config, setConfig] = useState(null);
  const fileRef = useRef(null);
  const typingStopRef = useRef(null);
  const typingOnRef = useRef(false);

  useEffect(() => {
    chatApi.uploadConfig().then((d) => setConfig(d?.config || null)).catch(() => {});
  }, []);

  const noteTyping = (on) => {
    if (!conversationId) return;
    const emit = () => {
      emitTyping(socket, conversationId, on);
      if (peerId) emitLegacyTyping(socket, peerId, on);
    };
    if (on && !typingOnRef.current) {
      typingOnRef.current = true;
      emit();
    }
    clearTimeout(typingStopRef.current);
    typingStopRef.current = setTimeout(() => {
      if (typingOnRef.current) {
        typingOnRef.current = false;
        emitTyping(socket, conversationId, false);
        if (peerId) emitLegacyTyping(socket, peerId, false);
      }
    }, 2200);
  };

  useEffect(() => () => {
    clearTimeout(typingStopRef.current);
    if (typingOnRef.current) emitTyping(socket, conversationId, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const pickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const max = config?.maxFiles || 5;
    if (attachments.length + files.length > max) {
      alert(`You can attach up to ${max} files.`);
      return;
    }
    setUploading(true);
    try {
      const { files: stored } = await chatApi.upload(files);
      setAttachments((prev) => [...prev, ...stored]);
    } catch (err) {
      alert(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const canSend = (text.trim() || attachments.length > 0) && !uploading;

  const send = () => {
    if (!canSend) return;
    onSend({
      content: text,
      attachments,
      replyTo: replyingTo ? replyingTo._id : null
    });
    clearTimeout(typingStopRef.current);
    typingOnRef.current = false;
    if (conversationId) emitTyping(socket, conversationId, false);
    setText('');
    setAttachments([]);
  };

  return (
    <div className="ck-composer">
      {replyingTo && (
        <div className="ck-reply-bar">
          <i className="fas fa-reply" />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Replying to <b>{replyingTo.senderName || 'yourself'}</b>: {replyingTo.content || '[Attachment]'}
          </span>
          <button className="ck-iconbtn" style={{ width: 22, height: 22, fontSize: 12 }} onClick={onCancelReply} title="Cancel reply">
            <i className="fas fa-times" />
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="ck-attach-list">
          {attachments.map((f, i) => (
            <span key={`${f.name}-${i}`} className="ck-attach-chip">
              <i className={`fas ${Number(f.size || 0) ? 'fa-file' : 'fa-image'}`} style={{ color: extentColor(f.kind) }} />
              {f.name}
              <button onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))} title="Remove">
                <i className="fas fa-times" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="ck-composer-row">
        <button
          className="ck-iconbtn"
          title={config ? `Attach files (max ${config.maxFiles})` : 'Attach files'}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ flex: '0 0 auto' }}
        >
          <i className="fas fa-paperclip" />
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={config?.extensions?.map((e) => `.${e}`).join(',') || '.*'}
          style={{ display: 'none' }}
          onChange={pickFiles}
        />
        <textarea
          rows={1}
          placeholder="Type a message…  (Enter to send)"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            noteTyping(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="ck-send" onClick={send} disabled={!canSend} title="Send">
          {uploading ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-paper-plane" />}
        </button>
      </div>
    </div>
  );
};

export default MessageComposer;