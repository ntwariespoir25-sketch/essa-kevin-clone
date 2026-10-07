const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

const { getJWTSecret } = require('../utils/jwt');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { isMember, recomputeStatus, toId, oid } = require('../utils/chat');
const presence = require('../utils/presence');

let io = null;

// Presence has to reach the people this user actually talks to rather than
// everybody online, so it is broadcast into the rooms they share.
const broadcastPresence = (userId, isOnline, lastSeenAt = null) => {
  if (!io) return;
  Conversation.find({ 'participants.userId': userId, isActive: true })
    .select('_id')
    .lean()
    .then(convs => {
      for (const conv of convs) {
        io.to(`conv:${toId(conv._id)}`).emit('presence_change', {
          userId: toId(userId),
          isOnline,
          lastSeenAt
        });
      }
    })
    .catch(() => { /* presence never breaks a socket */ });
};

const initSocket = (server) => {
  io = socketIo(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5174',
      credentials: true
    }
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication error'));
      const decoded = jwt.verify(token, getJWTSecret());
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      next();
    } catch {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    const userId = toId(socket.userId);
    // Every account joins its own room, which is how a targeted emit reaches a
    // person regardless of how many tabs they have open.
    socket.join(userId);

    const wasOnline = presence.isOnline(userId);
    presence.markOnline(userId, socket.id);

    // Conversation rooms give typing indicators and presence somewhere to go
    // without the sender having to enumerate recipients.
    Conversation.find({ 'participants.userId': userId, isActive: true })
      .select('_id')
      .lean()
      .then(convs => {
        for (const conv of convs) socket.join(`conv:${toId(conv._id)}`);
      })
      .catch(() => { /* a failed room join only costs live updates */ });

    if (!wasOnline) {
      // Scoped to shared conversations rather than io.emit(): a global frame
      // would tell every signed-in socket about a person they may have no
      // relationship with.
      broadcastPresence(userId, true);
    }

    // Client asks who among a set of people is currently around. The reply is
    // scoped to the asking socket rather than broadcast.
    socket.on('presence_query', (payload) => {
      const ids = Array.isArray(payload?.userIds) ? payload.userIds.slice(0, 200).map(toId) : [];
      socket.emit('presence_snapshot', {
        presence: ids.map(id => ({ userId: id, isOnline: presence.isOnline(id) }))
      });
    });

    socket.on('join_conversation', async (payload) => {
      try {
        const conversationId = payload?.conversationId;
        if (!conversationId) return;
        const conversation = await Conversation.findById(conversationId).select('participants').lean();
        if (conversation && isMember(conversation, userId)) {
          socket.join(`conv:${toId(conversationId)}`);
          socket.emit('joined_conversation', { conversationId: toId(conversationId) });
        }
      } catch {
        /* ignore */
      }
    });

    socket.on('leave_conversation', (payload) => {
      if (payload?.conversationId) socket.leave(`conv:${toId(payload.conversationId)}`);
    });

    // Legacy direct-chat typing event, kept because the original modal posts it
    // under this name.
    socket.on('typing', ({ recipientId, isTyping }) => {
      if (!recipientId) return;
      io.to(toId(recipientId)).emit('user_typing', {
        userId,
        isTyping: !!isTyping
      });
    });

    socket.on('conversation_typing', ({ conversationId, isTyping }) => {
      if (!conversationId) return;
      socket.to(`conv:${toId(conversationId)}`).emit('conversation_typing', {
        conversationId: toId(conversationId),
        userId,
        isTyping: !!isTyping
      });
    });

    // Legacy read-receipt relay.
    socket.on('mark_read', ({ messageId, senderId }) => {
      if (!senderId) return;
      io.to(toId(senderId)).emit('message_read', { messageId });
    });

    // Delivery and read acknowledgement without waiting for the REST call that
    // follows on refresh. This is what turns the ticks immediately.
    socket.on('ack_message', async (payload) => {
      try {
        const { messageId, status } = payload || {};
        if (!messageId || !['delivered', 'read'].includes(status)) return;

        const message = await Message.findById(messageId);
        if (!message || !message.conversationId) return;
        if (toId(message.senderId) === userId) return;

        const conversation = await Conversation.findById(message.conversationId);
        if (!conversation || !isMember(conversation, userId)) return;

        const bucket = status === 'read' ? 'readBy' : 'deliveredTo';
        const already = (message[bucket] || []).some(id => toId(id) === userId);
        if (!already) message[bucket].push(oid(userId));
        if (status === 'read') {
          message.isRead = true;
          message.readAt = message.readAt || new Date();
        }
        await message.save();

        const updated = await recomputeStatus(message, conversation);
        io.to(toId(message.senderId)).emit('message_updated', {
          message: { _id: updated._id, status: updated.status, readByCount: (updated.readBy || []).length },
          conversationId: toId(conversation._id)
        });
      } catch {
        /* an unacknowledged tick is cosmetic, never worth an error frame */
      }
    });

    socket.on('disconnect', async () => {
      const stillOpen = presence.markOffline(userId, socket.id);
      if (stillOpen === 0) {
        const lastSeenAt = new Date();
        await presence.touchLastSeen(userId, lastSeenAt);
        broadcastPresence(userId, false, lastSeenAt);
      }
    });
  });

  return io;
};

const getIO = () => io;

module.exports = { initSocket, getIO };
