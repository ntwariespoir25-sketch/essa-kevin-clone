import { useEffect, useMemo, useRef, useState } from 'react';
import io from 'socket.io-client';
import { getToken } from './chatApi';

const API_URL = import.meta.env.VITE_API_URL;
const TYPING_TTL = 5000;

let socketSingleton = null;

export const getChatSocket = () => {
  if (!socketSingleton) {
    socketSingleton = io(API_URL, {
      auth: { token: getToken() },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 800
    });
  }
  return socketSingleton;
};

export const joinConversationRoom = (socket, conversationId) => {
  if (socket?.connected && conversationId) socket.emit('join_conversation', { conversationId });
};

export const leaveConversationRoom = (socket, conversationId) => {
  if (socket?.connected && conversationId) socket.emit('leave_conversation', { conversationId });
};

export const emitTyping = (socket, conversationId, isTyping) => {
  if (socket?.connected && conversationId) socket.emit('conversation_typing', { conversationId, isTyping });
};

export const emitLegacyTyping = (socket, recipientId, isTyping) => {
  if (socket?.connected && recipientId) socket.emit('typing', { recipientId, isTyping });
};

export const ackMessage = (socket, messageId, status) => {
  if (socket?.connected && messageId) socket.emit('ack_message', { messageId, status });
};

export const emitMarkRead = (socket, messageId, senderId) => {
  if (socket?.connected && messageId && senderId) socket.emit('mark_read', { messageId, senderId });
};

export const queryPresence = (socket, userIds) => {
  if (socket?.connected && Array.isArray(userIds) && userIds.length) {
    socket.emit('presence_query', { userIds: userIds.slice(0, 200) });
  }
};

export const useChatSocket = () => {
  const socket = useMemo(() => getChatSocket(), []);
  const [connected, setConnected] = useState(socket.connected);
  const [presence, setPresence] = useState(() => new Map());
  const typingTimers = useRef(new Map());

  const clearTypingFor = (conversationId, userId) => {
    setPresence((prev) => {
      const entry = prev.get(userId);
      if (!entry || entry.typing?.conversationId !== conversationId) return prev;
      const next = new Map(prev);
      next.set(userId, { ...entry, typing: null });
      return next;
    });
  };

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onPresenceChange = ({ userId, isOnline, lastSeenAt }) => {
      setPresence((prev) => {
        const next = new Map(prev);
        next.set(userId, { isOnline: !!(isOnline === true || isOnline === 'true'), lastSeenAt });
        return next;
      });
    };

    const onSnapshot = ({ presence: rows = [] }) => {
      if (!rows.length) return;
      setPresence((prev) => {
        const next = new Map(prev);
        for (const row of rows) {
          if (row && row.userId) next.set(row.userId, { isOnline: !!row.isOnline, lastSeenAt: row.lastSeenAt });
        }
        return next;
      });
    };

    const onTyping = ({ conversationId, userId, isTyping }) => {
      if (!conversationId || !userId) return;
      const key = `${conversationId}:${userId}`;
      const timer = typingTimers.current.get(key);
      if (timer) {
        clearTimeout(timer);
        typingTimers.current.delete(key);
      }

      if (isTyping) {
        typingTimers.current.set(
          key,
          setTimeout(() => {
            typingTimers.current.delete(key);
            clearTypingFor(conversationId, userId);
          }, TYPING_TTL)
        );
        setPresence((prev) => {
          const next = new Map(prev);
          const entry = next.get(userId) || {};
          next.set(userId, { ...entry, typing: { conversationId, at: Date.now() } });
          return next;
        });
      } else {
        clearTypingFor(conversationId, userId);
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('presence_change', onPresenceChange);
    socket.on('presence_snapshot', onSnapshot);
    socket.on('conversation_typing', onTyping);
    socket.on('user_typing', onTyping);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('presence_change', onPresenceChange);
      socket.off('presence_snapshot', onSnapshot);
      socket.off('conversation_typing', onTyping);
      socket.off('user_typing', onTyping);
    };
  }, [socket]);

  useEffect(() => () => {
    for (const timer of typingTimers.current.values()) clearTimeout(timer);
    typingTimers.current.clear();
  }, []);

  return { socket, connected, presence };
};

export const isTypingIn = (presence, conversationId) => {
  for (const entry of presence.values()) {
    if (entry?.typing?.conversationId === conversationId) return entry;
  }
  return null;
};