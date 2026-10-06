const express = require('express');
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/auth');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { getIO } = require('../socket');
const { isStaff } = require('../utils/access');
const {
  toId,
  participantOf,
  isMember,
  isGroupAdmin,
  ensureDirectConversation,
  canContact,
  syncClassGroups,
  addMembers,
  removeMember,
  postSystemMessage,
  unreadCountsFor,
  loadUsers,
  asParticipant,
  recomputeStatus
} = require('../utils/chat');

const router = express.Router();

const fail = (res, status, message) => res.status(status).json({ success: false, message });

// Socket delivery is best effort everywhere below: a chat has to keep working
// when the socket layer is not initialised, which it is not under the API test
// harness.
const emitToParticipants = (conversation, event, payload) => {
  try {
    const io = getIO();
    if (!io) return;
    for (const p of conversation.participants || []) {
      io.to(toId(p.userId)).emit(event, payload);
    }
  } catch {
    /* notification only */
  }
};

// The wire shape of a conversation. The `participant` and `lastMessage.content`
// fields are the shape the original one-to-one modal consumes, kept so that
// every portal still renders correctly while the rebuilt client moves over.
const shapeConversation = (conv, viewerId, unread = 0) => {
  const viewer = participantOf(conv, viewerId) || {};
  const others = (conv.participants || []).filter(p => toId(p.userId) !== toId(viewerId));
  const peer = conv.type === 'direct' ? others[0] || null : null;
  const mutedUntil = viewer.mutedUntil ? new Date(viewer.mutedUntil) : null;

  return {
    _id: conv._id,
    type: conv.type,
    name: conv.name || null,
    description: conv.description || '',
    avatar: conv.avatar || null,
    category: conv.category || 'custom',
    classId: conv.classId || null,
    subject: conv.subject || null,
    autoManaged: !!conv.autoManaged,
    createdBy: conv.createdBy || null,
    admins: (conv.admins || []).map(toId),
    messageCount: conv.messageCount || 0,

    lastMessage: {
      content: conv.lastMessage || '',
      createdAt: conv.lastMessageAt || conv.createdAt,
      senderId: conv.lastMessageSenderId || null,
      type: conv.lastMessageType || 'text'
    },
    lastMessageAt: conv.lastMessageAt || conv.createdAt,

    participants: (conv.participants || []).map(p => ({
      userId: p.userId,
      name: p.name,
      role: p.role,
      joinedAt: p.joinedAt,
      lastReadAt: p.lastReadAt || null,
      nickname: p.nickname || null
    })),
    // Legacy single-peer view for direct threads.
    peer: peer ? { id: peer.userId, name: peer.name, role: peer.role } : null,
    participant: peer ? { id: peer.userId, name: peer.name, role: peer.role } : null,

    unreadCount: unread,
    isArchived: !!viewer.isArchived,
    isPinned: !!viewer.isPinned,
    isMuted: !!(mutedUntil && mutedUntil.getTime() > Date.now()),
    mutedUntil: viewer.mutedUntil || null,
    viewerIsAdmin: conv.type === 'group' ? isGroupAdmin(conv, viewerId) : false
  };
};

const loadConversation = async (id) => {
  if (!mongoose.isValidObjectId(id)) return null;
  return Conversation.findById(id);
};

// ─── list ────────────────────────────────────────────────────────────────────

router.get('/messages/conversations', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    // Rebuilds class groups whose roster moved before the list is assembled, so
    // a pupil who just changed class sees the change on their next load.
    await syncClassGroups(userId, req.userRole);

    const wantArchived = ['true', '1'].includes(String(req.query.archived));
    const convs = await Conversation.find({ 'participants.userId': userId, isActive: true }).lean();

    let archivedCount = 0;
    let totalUnread = 0;
    const visible = [];

    for (const conv of convs) {
      const p = participantOf(conv, userId);
      const archived = !!(p && p.isArchived);
      if (archived) archivedCount += 1;
      if (archived === wantArchived) visible.push(conv);
    }

    const unread = await unreadCountsFor(userId, visible.map(c => c._id));
    const shaped = visible.map(conv => {
      const count = unread.get(toId(conv._id)) || 0;
      if (!participantOf(conv, userId)?.isArchived) totalUnread += count;
      return shapeConversation(conv, userId, count);
    });

    // Pinned first, then most recent. isPinned is per viewer, so this cannot be
    // pushed down into the query.
    shaped.sort((a, b) =>
      (Number(b.isPinned) - Number(a.isPinned)) ||
      (new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
    );

    res.json({
      success: true,
      conversations: shaped,
      counts: { total: convs.length, archived: archivedCount, unread: totalUnread }
    });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── create ──────────────────────────────────────────────────────────────────

router.post('/messages/conversations', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { participantId, name, description, memberIds, category, classId } = req.body || {};

    // Direct thread
    if (participantId) {
      const allowed = await canContact(userId, req.userRole, participantId);
      if (!allowed) return fail(res, 403, 'You cannot start a conversation with this person.');

      const conversation = await ensureDirectConversation(userId, participantId);
      if (!conversation) return fail(res, 404, 'That person could not be found.');

      const unread = await unreadCountsFor(userId, [conversation._id]);
      return res.json({
        success: true,
        conversation: shapeConversation(conversation, userId, unread.get(toId(conversation._id)) || 0)
      });
    }

    // Group thread
    const trimmedName = String(name || '').trim();
    if (!trimmedName) return fail(res, 400, 'A group needs a name.');
    if (trimmedName.length > 60) return fail(res, 400, 'Group names are limited to 60 characters.');

    const requested = Array.isArray(memberIds) ? memberIds : [];
    const me = await User.findById(userId).lean();
    if (!me) return fail(res, 404, 'Account not found.');

    const memberSet = [...new Set([userId, ...requested.filter(Boolean).map(toId)])];
    const users = await loadUsers(memberSet);
    const participants = memberSet.map(id => users.get(id)).filter(Boolean).map(asParticipant);

    if (participants.length < 2) {
      return fail(res, 400, 'A group needs at least one other member.');
    }

    const conversation = await Conversation.create({
      type: 'group',
      name: trimmedName,
      description: description ? String(description).substring(0, 500) : '',
      category: ['class', 'subject', 'department', 'staff', 'custom'].includes(category) ? category : 'custom',
      classId: mongoose.isValidObjectId(classId) ? classId : undefined,
      createdBy: userId,
      admins: [userId],
      participants,
      lastMessageAt: new Date()
    });

    await postSystemMessage(conversation, {
      kind: 'group_created',
      content: `${me.fullName} created "${trimmedName}".`,
      actor: me
    });

    const fresh = await Conversation.findById(conversation._id).lean();
    emitToParticipants(fresh, 'conversation_created', { conversation: shapeConversation(fresh, userId, 0) });
    res.json({ success: true, conversation: shapeConversation(fresh, userId, 0) });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── detail ──────────────────────────────────────────────────────────────────

router.get('/messages/conversations/:id', authMiddleware, async (req, res) => {
  try {
    const conversation = await loadConversation(req.params.id);
    if (!conversation) return fail(res, 404, 'Conversation not found.');
    if (!isMember(conversation, req.userId)) return fail(res, 403, 'You are not part of this conversation.');

    const unread = await unreadCountsFor(req.userId, [conversation._id]);
    res.json({
      success: true,
      conversation: shapeConversation(conversation, req.userId, unread.get(toId(conversation._id)) || 0)
    });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── rename / describe ───────────────────────────────────────────────────────

router.put('/messages/conversations/:id', authMiddleware, async (req, res) => {
  try {
    const conversation = await loadConversation(req.params.id);
    if (!conversation) return fail(res, 404, 'Conversation not found.');
    if (conversation.type !== 'group') return fail(res, 400, 'Direct conversations have no editable profile.');
    if (!isMember(conversation, req.userId)) return fail(res, 403, 'You are not part of this conversation.');

    const mayEdit = isGroupAdmin(conversation, req.userId) || isStaff(req.userRole);
    if (!mayEdit) return fail(res, 403, 'Only a group owner or administrator can do this.');

    // The name is derived from the class roster for class groups; renaming it
    // would be undone by the next sync anyway.
    if (conversation.autoManaged) return fail(res, 400, 'Class groups are managed automatically.');

    const { name, description, avatar } = req.body || {};
    const updates = {};
    const actor = await User.findById(req.userId).lean();

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return fail(res, 400, 'A group needs a name.');
      if (trimmed.length > 60) return fail(res, 400, 'Group names are limited to 60 characters.');
      if (trimmed !== conversation.name) {
        updates.name = trimmed;
        await postSystemMessage(conversation, {
          kind: 'renamed',
          content: `${actor.fullName} renamed the group to "${trimmed}".`,
          payload: { from: conversation.name, to: trimmed },
          actor
        });
      }
    }
    if (description !== undefined) updates.description = String(description).substring(0, 500);
    if (avatar !== undefined) updates.avatar = avatar ? String(avatar) : null;

    if (!Object.keys(updates).length) return res.json({ success: true, conversation: shapeConversation(conversation, req.userId, 0) });

    const updated = await Conversation.findByIdAndUpdate(conversation._id, updates, { new: true }).lean();
    emitToParticipants(updated, 'conversation_updated', { conversation: shapeConversation(updated, req.userId, 0) });
    res.json({ success: true, conversation: shapeConversation(updated, req.userId, 0) });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── membership ──────────────────────────────────────────────────────────────

router.post('/messages/conversations/:id/members', authMiddleware, async (req, res) => {
  try {
    const conversation = await loadConversation(req.params.id);
    if (!conversation) return fail(res, 404, 'Conversation not found.');
    if (conversation.type !== 'group') return fail(res, 400, 'Direct conversations have a fixed membership.');
    if (!isMember(conversation, req.userId)) return fail(res, 403, 'You are not part of this conversation.');

    const mayManage = isGroupAdmin(conversation, req.userId) || isStaff(req.userRole);
    if (!mayManage) return fail(res, 403, 'Only a group owner or administrator can add members.');

    const requested = Array.isArray(req.body?.memberIds) ? req.body.memberIds : [];
    const targets = requested.filter(Boolean).map(toId);
    if (!targets.length) return fail(res, 400, 'Nobody was selected.');

    const added = await addMembers(conversation, targets, req.userId);
    if (!added.length) return res.json({ success: true, added: [] });

    const actor = await User.findById(req.userId).lean();
    await postSystemMessage(conversation, {
      kind: 'members_added',
      content: `${actor.fullName} added ${added.map(a => a.name).join(', ')}.`,
      payload: { members: added.map(a => toId(a.userId)) },
      actor
    });

    const fresh = await Conversation.findById(conversation._id).lean();
    emitToParticipants(fresh, 'members_changed', { conversationId: toId(fresh._id) });
    res.json({ success: true, added });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.delete('/messages/conversations/:id/members/:memberId', authMiddleware, async (req, res) => {
  try {
    const conversation = await loadConversation(req.params.id);
    if (!conversation) return fail(res, 404, 'Conversation not found.');
    if (conversation.type !== 'group') return fail(res, 400, 'Direct conversations have a fixed membership.');
    if (!isMember(conversation, req.userId)) return fail(res, 403, 'You are not part of this conversation.');

    const target = toId(req.params.memberId);
    const isSelf = target === toId(req.userId);
    const mayManage = isGroupAdmin(conversation, req.userId) || isStaff(req.userRole);

    if (!isSelf && !mayManage) return fail(res, 403, 'Only a group owner or administrator can remove members.');
    if (isSelf) return fail(res, 400, 'Use "leave group" to remove yourself.');

    const removed = await removeMember(conversation, target);
    if (!removed) return fail(res, 404, 'That person is not in this group.');

    const actor = await User.findById(req.userId).lean();
    const gone = (conversation.participants || []).find(p => toId(p.userId) === target);
    await postSystemMessage(conversation, {
      kind: 'member_removed',
      content: `${actor.fullName} removed ${gone ? gone.name : 'a member'}.`,
      payload: { member: target },
      actor
    });

    const fresh = await Conversation.findById(conversation._id).lean();
    emitToParticipants(fresh, 'members_changed', { conversationId: toId(fresh._id) });
    res.json({ success: true });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.post('/messages/conversations/:id/leave', authMiddleware, async (req, res) => {
  try {
    const conversation = await loadConversation(req.params.id);
    if (!conversation) return fail(res, 404, 'Conversation not found.');
    if (conversation.type !== 'group') return fail(res, 400, 'You cannot leave a direct conversation.');
    if (!isMember(conversation, req.userId)) return fail(res, 403, 'You are not part of this conversation.');
    if (conversation.autoManaged) {
      return fail(res, 400, 'Class groups cannot be left. Archive it instead.');
    }

    const actor = await User.findById(req.userId).lean();
    await removeMember(conversation, req.userId);
    await postSystemMessage(conversation, {
      kind: 'member_left',
      content: `${actor.fullName} left the group.`,
      payload: { member: toId(req.userId) },
      actor
    });

    // An empty group has nothing left to show anybody.
    const remaining = await Conversation.findById(conversation._id).select('participants').lean();
    if (!remaining.participants.length) {
      await Conversation.updateOne({ _id: conversation._id }, { $set: { isActive: false } });
    } else {
      emitToParticipants(remaining, 'members_changed', { conversationId: toId(conversation._id) });
    }

    res.json({ success: true });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.delete('/messages/conversations/:id', authMiddleware, async (req, res) => {
  try {
    const conversation = await loadConversation(req.params.id);
    if (!conversation) return fail(res, 404, 'Conversation not found.');
    if (conversation.type !== 'group') return fail(res, 400, 'Direct conversations are archived, not deleted.');
    if (conversation.autoManaged) return fail(res, 400, 'Class groups cannot be deleted.');

    const mayDelete = toId(conversation.createdBy) === toId(req.userId) || isStaff(req.userRole);
    if (!mayDelete) return fail(res, 403, 'Only the owner or an administrator can delete this group.');

    emitToParticipants(conversation, 'conversation_deleted', { conversationId: toId(conversation._id) });
    await Conversation.updateOne({ _id: conversation._id }, { $set: { isActive: false } });
    res.json({ success: true });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── per-viewer state: archive, pin, mute, read ──────────────────────────────

const setViewerFlag = (field, value) => ({ $set: { [`participants.$.${field}`]: value } });

router.put('/messages/conversations/:id/archive', authMiddleware, async (req, res) => {
  try {
    const conversation = await loadConversation(req.params.id);
    if (!conversation) return fail(res, 404, 'Conversation not found.');
    const viewer = participantOf(conversation, req.userId);
    if (!viewer) return fail(res, 403, 'You are not part of this conversation.');

    const next = req.body?.value !== undefined ? !!req.body.value : !viewer.isArchived;
    await Conversation.updateOne(
      { _id: conversation._id, 'participants.userId': req.userId },
      setViewerFlag('isArchived', next)
    );
    res.json({ success: true, isArchived: next });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.put('/messages/conversations/:id/pin', authMiddleware, async (req, res) => {
  try {
    const conversation = await loadConversation(req.params.id);
    if (!conversation) return fail(res, 404, 'Conversation not found.');
    const viewer = participantOf(conversation, req.userId);
    if (!viewer) return fail(res, 403, 'You are not part of this conversation.');

    const next = req.body?.value !== undefined ? !!req.body.value : !viewer.isPinned;
    await Conversation.updateOne(
      { _id: conversation._id, 'participants.userId': req.userId },
      setViewerFlag('isPinned', next)
    );
    res.json({ success: true, isPinned: next });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.put('/messages/conversations/:id/mute', authMiddleware, async (req, res) => {
  try {
    const conversation = await loadConversation(req.params.id);
    if (!conversation) return fail(res, 404, 'Conversation not found.');
    const viewer = participantOf(conversation, req.userId);
    if (!viewer) return fail(res, 403, 'You are not part of this conversation.');

    // null or a past date unmutes; a future date silences until then.
    const raw = req.body?.until;
    let until = null;
    if (raw) {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) return fail(res, 400, 'That is not a valid date.');
      until = parsed.getTime() > Date.now() ? parsed : null;
    }

    await Conversation.updateOne(
      { _id: conversation._id, 'participants.userId': req.userId },
      { $set: { 'participants.$.mutedUntil': until } }
    );
    res.json({ success: true, mutedUntil: until, isMuted: !!until });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.put('/messages/conversations/:id/read', authMiddleware, async (req, res) => {
  try {
    const conversation = await loadConversation(req.params.id);
    if (!conversation) return fail(res, 404, 'Conversation not found.');
    if (!isMember(conversation, req.userId)) return fail(res, 403, 'You are not part of this conversation.');

    const now = new Date();
    await Message.updateMany(
      { conversationId: conversation._id, senderId: { $ne: req.userId }, readBy: { $ne: req.userId } },
      { $addToSet: { readBy: req.userId }, $set: { isRead: true, readAt: now } }
    );

    const reader = participantOf(conversation, req.userId);
    reader.lastReadAt = now;
    await conversation.save();

    // Status has to be recomputed rather than set, because a group message is
    // only "read" once everybody has read it.
    const pending = await Message.find({
      conversationId: conversation._id,
      senderId: { $ne: req.userId },
      status: { $in: ['sent', 'delivered'] }
    });

    for (const message of pending) {
      await recomputeStatus(message, conversation);
    }

    try {
      const io = getIO();
      if (io) {
        const others = (conversation.participants || []).filter(p => toId(p.userId) !== toId(req.userId));
        for (const other of others) {
          io.to(toId(other.userId)).emit('messages_read', {
            conversationId: toId(conversation._id),
            readBy: req.userId,
            at: now
          });
        }
      }
    } catch {
      /* notification only */
    }

    res.json({ success: true, lastReadAt: now });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

module.exports = router;
