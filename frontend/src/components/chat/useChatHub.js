import { useCallback, useEffect, useRef, useState } from 'react';
import Swal from 'sweetalert2';
import { chatApi, isValidId } from './chatApi';
import { joinConversationRoom, leaveConversationRoom, queryPresence, ackMessage, emitMarkRead } from './useChatSocket';

const THREAD_PAGE = 30;

const shapeLocalReactions = (reactions, viewerId) => {
  const map = new Map();
  for (const r of reactions || []) {
    const emoji = r.emoji || r;
    const entry = map.get(emoji) || { emoji, count: 0, mine: false };
    entry.count += 1;
    if (String(r.userId) === String(viewerId)) entry.mine = true;
    map.set(emoji, entry);
  }
  return [...map.values()];
};

export const normalizeMessage = (m, viewerId) => {
  const res = (m && m._id ? m : m?.message) || {};
  return {
    ...res,
    isMine: String(res.senderId) === String(viewerId),
    readByCount: (res.readBy || []).length,
    pending: !!res.pending,
    reactions: shapeLocalReactions(res.reactions || [], viewerId),
    pinned: !!res.pinnedAt,
    starred: (res.starredBy || []).some((id) => String(id) === String(viewerId)),
    deletedForEveryone: !!res.deletedForEveryone,
    deletedForMe: (res.deletedFor || []).some((id) => String(id) === String(viewerId)),
    isEdited: !!res.editedAt
  };
};

export const useChatHub = ({ socket, myUserId, myRole, onMessageSent, isOpen, recipient, initialConversationId }) => {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pinned, setPinned] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [search, setSearch] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [editText, setEditText] = useState('');
  const [forwardMsg, setForwardMsg] = useState(null);
  const [openTick, setOpenTick] = useState(0);
  const [openKind, setOpenKind] = useState(null);
  const [openTarget, setOpenTarget] = useState(null);

  const messagesEndRef = useRef(null);
  const stickBottomRef = useRef(true);
  const activeIdRef = useRef(null);
  const socketRef = useRef(socket);
  const openingRef = useRef(false);

  socketRef.current = socket;

  useEffect(() => {
    activeIdRef.current = activeConversation ? String(activeConversation._id) : null;
  }, [activeConversation]);

  const scrollToBottom = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    });
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const d = await chatApi.conversations();
      setConversations(Array.isArray(d?.conversations) ? d.conversations : []);
    } catch {
      /* keep the previous list */
    }
  }, []);

  const upsertMessage = useCallback((incoming) => {
    const message = normalizeMessage(incoming, myUserId);
    stickBottomRef.current = true;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => String(m._id) === String(message._id));
      const next = [...prev];
      if (message._id && idx >= 0) next[idx] = message;
      else if (message._id) next.push(message);
      return next;
    });
    if (message.pinned) {
      setPinned((prev) => {
        const idx = prev.findIndex((m) => String(m._id) === String(message._id));
        const next = [...prev];
        if (idx >= 0) next[idx] = message;
        else next.push(message);
        return next.slice(0, 20);
      });
    }
  }, [myUserId]);

  const removeMessage = useCallback((messageId, scope) => {
    setMessages((prev) =>
      scope === 'everyone'
        ? prev.map((m) => (String(m._id) === String(messageId)
          ? { ...m, deletedForEveryone: true, content: '', attachments: [], reactions: [] }
          : m))
        : prev.filter((m) => String(m._id) !== String(messageId))
    );
    setPinned((prev) => prev.filter((m) => String(m._id) !== String(messageId)));
  }, []);

  const markRead = useCallback(async (conversation, list) => {
    if (!conversation) return;
    chatApi.markRead(String(conversation._id)).catch(() => {});
    try {
      for (const m of list || []) {
        if (String(m.senderId) !== String(myUserId)) {
          ackMessage(socketRef.current, String(m._id), 'read');
          emitMarkRead(socketRef.current, String(m._id), String(m.senderId));
          break;
        }
      }
    } catch {
      /* cosmetic */
    }
  }, [myUserId]);

  const openConversation = useCallback(async (conv) => {
    stickBottomRef.current = true;
    setActiveConversation(conv);
    setMessages([]);
    setPinned([]);
    setHasMore(false);
    setReplyingTo(null);
    setEditingMsg(null);
    setForwardMsg(null);

    joinConversationRoom(socketRef.current, String(conv._id));
    queryPresence(socketRef.current, (conv.participants || []).map((p) => String(p.userId)));

    setLoadingThread(true);
    try {
      const d = await chatApi.thread(String(conv._id), `?limit=${THREAD_PAGE}`);
      const list = (d?.messages || []).map((m) => normalizeMessage(m, myUserId));
      setMessages(list);
      setPinned((d?.pinned || []).map((m) => normalizeMessage(m, myUserId)));
      setHasMore(!!d?.hasMore);
      requestAnimationFrame(() => scrollToBottom(false));
      markRead(conv, list);
    } catch {
      Swal.fire({ title: 'Could not open conversation', icon: 'error', confirmButtonColor: 'var(--navy)' });
    } finally {
      setLoadingThread(false);
    }
  }, [myUserId, markRead, scrollToBottom]);

  const loadOlder = useCallback(async () => {
    if (!activeConversation || !messages.length || !hasMore || loadingThread) return;
    const oldest = messages[0];
    setLoadingThread(true);
    try {
      const d = await chatApi.thread(String(activeConversation._id), `?limit=${THREAD_PAGE}&before=${oldest._id}`);
      const older = (d?.messages || []).map((m) => normalizeMessage(m, myUserId));
      setMessages((prev) => {
        const known = new Set(prev.map((m) => String(m._id)));
        const fresh = older.filter((m) => !known.has(String(m._id)));
        return [...fresh, ...prev];
      });
      setHasMore(!!d?.hasMore);
    } catch {
      /* ignore */
    } finally {
      setLoadingThread(false);
    }
  }, [activeConversation, messages, hasMore, loadingThread, myUserId]);

  const openDirect = useCallback(async (user) => {
    try {
      const d = await chatApi.createConversation({ participantId: String(user._id || user.id) });
      if (!d?.conversation) throw new Error('Could not start a conversation.');
      openConversation(d.conversation);
      fetchConversations();
    } catch (err) {
      Swal.fire({ title: err.message || 'Could not start a conversation.', icon: 'error', confirmButtonColor: 'var(--navy)' });
    }
  }, [openConversation, fetchConversations]);

  // The modal and the inline panel both want the same "when opened, decide which
  // thread to show" behaviour; this effect is the single source of it.
  useEffect(() => {
    if (!isOpen) return;
    if (openingRef.current) return;
    openingRef.current = true;
    (async () => {
      const resolveTarget = () => {
        if (initialConversationId && isValidId(initialConversationId)) return { kind: 'conversation', target: initialConversationId };
        if (recipient && (isValidId(recipient?._id) || isValidId(recipient?.id))) {
          return { kind: 'direct', target: { _id: recipient._id || recipient.id, fullName: recipient.name, role: recipient.role } };
        }
        if (recipient) return { kind: 'directory' };
        return { kind: 'list' };
      };
      await fetchConversations();
      const { kind, target } = resolveTarget();
      setOpenKind(kind);
      setOpenTarget(target || null);
      setOpenTick((v) => v + 1);
      openingRef.current = false;
    })();
    return () => { openingRef.current = false; };
  }, [isOpen, recipient, initialConversationId, fetchConversations]);

  useEffect(() => {
    if (!openKind) return;
    if (openKind === 'conversation') {
      chatApi.thread(String(openTarget), '?limit=1').then((d) => {
        const id = d?.conversationId || openTarget;
        chatApi.conversations().then((res) => {
          const match = (res?.conversations || []).find((c) => String(c._id) === String(id));
          if (match) openConversation(match);
        }).catch(() => {});
      }).catch(() => {});
    } else if (openKind === 'direct') {
      openDirect(openTarget);
    }
  }, [openKind, openTarget, openConversation, openDirect]);

  useEffect(() => {
    if (!isOpen || !activeConversation) return undefined;
    return () => leaveConversationRoom(socketRef.current, String(activeConversation._id));
  }, [isOpen, activeConversation]);

  useEffect(() => {
    if (!socket) return undefined;

    const onMessage = ({ message, conversationId }) => {
      const cid = String(conversationId);
      if (activeIdRef.current === cid) {
        upsertMessage(message);
        ackMessage(socketRef.current, String(message?._id || ''), 'read');
      } else {
        fetchConversations();
      }
      onMessageSent && onMessageSent();
    };

    const onUpdated = ({ message, conversationId }) => {
      if (activeIdRef.current === String(conversationId)) upsertMessage(message);
      else fetchConversations();
    };

    const onDeleted = ({ messageId, conversationId, scope }) => {
      if (activeIdRef.current === String(conversationId)) removeMessage(messageId, scope);
      else fetchConversations();
    };

    const onConvEvent = () => fetchConversations();

    socket.on('new_message', onMessage);
    socket.on('message_updated', onUpdated);
    socket.on('message_deleted', onDeleted);
    socket.on('conversation_updated', onConvEvent);
    socket.on('conversation_created', onConvEvent);
    socket.on('members_changed', onConvEvent);
    socket.on('conversation_deleted', onConvEvent);

    return () => {
      socket.off('new_message', onMessage);
      socket.off('message_updated', onUpdated);
      socket.off('message_deleted', onDeleted);
      socket.off('conversation_updated', onConvEvent);
      socket.off('conversation_created', onConvEvent);
      socket.off('members_changed', onConvEvent);
      socket.off('conversation_deleted', onConvEvent);
    };
  }, [socket, upsertMessage, removeMessage, fetchConversations, onMessageSent]);

  const handleSend = useCallback(async ({ content, attachments, replyTo }) => {
    if (!activeConversation) return;
    try {
      const optimistic = {
        _id: `pending-${Date.now()}`,
        pending: true,
        conversationId: activeConversation._id,
        type: 'text',
        content,
        attachments,
        senderId: myUserId,
        senderName: localStorage.getItem('userName') || 'You',
        senderRole: myRole,
        createdAt: new Date().toISOString(),
        status: 'sent',
        readBy: [],
        deliveredTo: [],
        reactions: [],
        starredBy: [],
        replyTo,
        replyPreview: replyingTo
          ? { senderName: replyingTo.senderName || 'You', content: (replyingTo.content || '').substring(0, 140), type: replyingTo.type }
          : null
      };
      upsertMessage(optimistic);
      scrollToBottom(true);
      setReplyingTo(null);

      const d = await chatApi.send({
        conversationId: activeConversation._id,
        content,
        attachments,
        replyTo
      });
      setMessages((prev) =>
        prev.map((m) => (String(m._id) === String(optimistic._id) ? normalizeMessage(d.message || d, myUserId) : m))
      );
      fetchConversations();
      onMessageSent && onMessageSent();
    } catch (err) {
      setMessages((prev) => prev.filter((m) => !String(m._id).startsWith('pending-')));
      Swal.fire({ title: err.message || 'Could not send.', icon: 'error', confirmButtonColor: 'var(--navy)' });
    }
  }, [activeConversation, myUserId, myRole, replyingTo, upsertMessage, scrollToBottom, fetchConversations, onMessageSent]);

  const handleEdit = useCallback(async (message, content) => {
    try {
      const d = await chatApi.edit(String(message._id), content);
      upsertMessage(d.message);
    } catch (err) {
      Swal.fire({ title: err.message || 'Could not edit.', icon: 'error', confirmButtonColor: 'var(--navy)' });
    }
  }, [upsertMessage]);

  const handleDelete = useCallback(async (message, scope) => {
    try {
      const d = await chatApi.remove(String(message._id), scope);
      removeMessage(String(message._id), d.scope);
      fetchConversations();
    } catch (err) {
      Swal.fire({ title: err.message || 'Could not delete.', icon: 'error', confirmButtonColor: 'var(--navy)' });
    }
  }, [removeMessage, fetchConversations]);

  const handleReact = useCallback(async (message, emoji) => {
    try {
      const d = await chatApi.react(String(message._id), emoji);
      setMessages((prev) =>
        prev.map((m) => (String(m._id) === String(message._id) ? { ...m, reactions: d.reactions } : m))
      );
    } catch (err) {
      Swal.fire({ title: err.message || 'Could not react.', icon: 'error', confirmButtonColor: 'var(--navy)' });
    }
  }, []);

  const handlePin = useCallback(async (message, value) => {
    try {
      const d = await chatApi.pin(String(message._id), Boolean(value));
      setMessages((prev) =>
        prev.map((m) => (String(m._id) === String(message._id) ? { ...m, pinned: d.pinned } : m))
      );
      if (d.pinned) {
        setPinned((prev) => (prev.some((m) => String(m._id) === String(message._id))
          ? prev.map((m) => (String(m._id) === String(message._id) ? { ...m, pinned: true } : m))
          : [...prev, { ...message, pinned: true }]));
      } else {
        setPinned((prev) => prev.filter((m) => String(m._id) !== String(message._id)));
      }
    } catch (err) {
      Swal.fire({ title: err.message || 'Could not pin.', icon: 'error', confirmButtonColor: 'var(--navy)' });
    }
  }, []);

  const handleStar = useCallback(async (message) => {
    try {
      const d = await chatApi.star(String(message._id));
      setMessages((prev) =>
        prev.map((m) => (String(m._id) === String(message._id) ? { ...m, starred: d.starred } : m))
      );
    } catch (err) {
      Swal.fire({ title: err.message || 'Could not star.', icon: 'error', confirmButtonColor: 'var(--navy)' });
    }
  }, []);

  const handleReport = useCallback(async (message, reason) => {
    try {
      await chatApi.report(String(message._id), reason);
      Swal.fire({ title: 'Reported', text: 'Our team will review this message.', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ title: err.message || 'Could not report.', icon: 'error', confirmButtonColor: 'var(--navy)' });
    }
  }, []);

  const handleForward = useCallback(async (message, conversationIds) => {
    try {
      await chatApi.forward(String(message._id), conversationIds);
      setForwardMsg(null);
      Swal.fire({ title: 'Forwarded', icon: 'success', timer: 1200, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ title: err.message || 'Could not forward.', icon: 'error', confirmButtonColor: 'var(--navy)' });
    }
  }, []);

  const handleCopy = useCallback(async (message) => {
    try {
      await navigator.clipboard.writeText(message.content || '');
    } catch {
      /* clipboard unavailable */
    }
  }, []);

  const handleAction = useCallback(async (conv, kind) => {
    try {
      if (kind === 'archive' || kind === 'unarchive') {
        await chatApi.archive(String(conv._id), kind === 'archive');
      } else if (kind === 'pin' || kind === 'unpin') {
        await chatApi.pinConversation(String(conv._id), kind === 'pin');
      }
      fetchConversations();
      if (String(conv._id) === activeIdRef.current) {
        setActiveConversation((prev) => (prev ? { ...prev, isArchived: kind === 'archive', isPinned: kind === 'pin' } : prev));
      }
    } catch (err) {
      Swal.fire({ title: err.message || 'Action failed.', icon: 'error', confirmButtonColor: 'var(--navy)' });
    }
  }, [fetchConversations]);

  const handleMute = useCallback(async (conv, minutes) => {
    try {
      await chatApi.muteConversation(String(conv._id), minutes);
      fetchConversations();
    } catch (err) {
      Swal.fire({ title: err.message || 'Could not update mute.', icon: 'error', confirmButtonColor: 'var(--navy)' });
    }
  }, [fetchConversations]);

  const closeThread = useCallback(() => {
    leaveConversationRoom(socketRef.current, String(activeConversation?._id || ''));
    setActiveConversation(null);
    setMessages([]);
    setPinned([]);
    setHasMore(false);
    setReplyingTo(null);
    setEditingMsg(null);
    setForwardMsg(null);
    fetchConversations();
  }, [activeConversation, fetchConversations]);

  return {
    conversations,
    activeConversation,
    messages,
    pinned,
    hasMore,
    loadingThread,
    search,
    setSearch,
    replyingTo,
    setReplyingTo,
    editingMsg,
    setEditingMsg,
    editText,
    setEditText,
    forwardMsg,
    setForwardMsg,
    messagesEndRef,
    openTick,
    fetchConversations,
    openConversation,
    openDirect,
    loadOlder,
    handleSend,
    handleEdit,
    handleDelete,
    handleReact,
    handlePin,
    handleStar,
    handleReport,
    handleForward,
    handleCopy,
    handleAction,
    handleMute,
    closeThread,
    startConversation: (user) => openDirect(user),
    createGroupConversation: (conversation) => {
      setActiveConversation(conversation);
      openConversation(conversation);
      fetchConversations();
    }
  };
};