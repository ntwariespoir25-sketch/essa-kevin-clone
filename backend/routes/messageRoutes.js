const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/auth');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Student = require('../models/Student');
const TeacherProfile = require('../models/TeacherProfile');
const Class = require('../models/Class');
const { getIO } = require('../socket');
const { messagingDirectory, isStaff } = require('../utils/access');
const { presenceMap } = require('../utils/presence');
const {
  toId,
  oid,
  participantOf,
  isMember,
  isGroupAdmin,
  canContact,
  ensureDirectConversation,
  directKeyFor,
  touchConversation,
  recomputeStatus,
  unreadCountsFor
} = require('../utils/chat');

const router = express.Router();

const fail = (res, status, message) => res.status(status).json({ success: false, message });

// Messages the viewer is still allowed to see. `deletedFor` holds ObjectIds,
// so the caller's id has to be converted before it can be compared - a string
// would never equal an ObjectId and the filter would silently match nothing.
const visibleTo = (userId) => ({
  deletedForEveryone: { $ne: true },
  deletedFor: { $ne: oid(userId) }
});

const emitToConversation = (conversation, event, payload, exceptUserId = null) => {
  try {
    const io = getIO();
    if (!io) return;
    for (const p of conversation.participants || []) {
      if (exceptUserId && toId(p.userId) === toId(exceptUserId)) continue;
      io.to(toId(p.userId)).emit(event, payload);
    }
  } catch {
    /* notification only */
  }
};

const shapeReaction = (reactions, viewerId) => {
  const byEmoji = new Map();
  for (const r of reactions || []) {
    const entry = byEmoji.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false };
    entry.count += 1;
    if (toId(r.userId) === toId(viewerId)) entry.mine = true;
    byEmoji.set(r.emoji, entry);
  }
  return [...byEmoji.values()];
};

const shapeMessage = (message, viewerId) => ({
  _id: message._id,
  conversationId: message.conversationId,
  type: message.type || 'text',
  content: message.content,
  payload: message.payload || null,
  attachments: message.attachments || [],

  // Legacy fields the original modal reads directly.
  senderId: message.senderId,
  senderName: message.senderName,
  senderRole: message.senderRole,
  recipientId: message.recipientId || null,
  subject: message.subject || null,
  createdAt: message.createdAt,

  status: message.status || 'sent',
  deliveredAt: message.deliveredAt || null,
  readAt: message.readAt || null,
  readByCount: (message.readBy || []).length,

  replyTo: message.replyTo || null,
  replyPreview: message.replyPreview || null,
  forwardedFrom: message.forwardedFrom || null,
  isEdited: !!message.editedAt,
  editedAt: message.editedAt || null,

  pinned: !!message.pinnedAt,
  pinnedAt: message.pinnedAt || null,
  starred: (message.starredBy || []).some(id => toId(id) === toId(viewerId)),
  reactions: shapeReaction(message.reactions, viewerId),
  mentions: message.mentions || [],

  deletedForEveryone: !!message.deletedForEveryone,
  deletedForMe: (message.deletedFor || []).some(id => toId(id) === toId(viewerId)),
  reportCount: (message.reports || []).filter(r => !r.resolved).length,

  isMine: toId(message.senderId) === toId(viewerId)
});

// ─── contact directory ───────────────────────────────────────────────────────
// Registered before the parameterised routes so `/messages/users` cannot be
// swallowed as an id.

router.get('/messages/users', authMiddleware, async (req, res) => {
  try {
    // Scoped to who the caller may legitimately contact - see
    // messagingDirectory. Email is only returned to staff.
    const { includeEmail, filter } = await messagingDirectory(req.userId, req.userRole);
    const projection = includeEmail
      ? 'fullName email role profileImage isOnline lastSeenAt'
      : 'fullName role profileImage isOnline lastSeenAt';

    const users = await User.find(filter, projection).sort('fullName').lean();

    // Enrich with the identifiers section 1 wants to search by: admission
    // number, class and subject/department.
    const userIds = users.map(u => u._id);
    const [students, profiles] = await Promise.all([
      Student.find({ userId: { $in: userIds } }).select('userId studentId classId sdmsCode').lean(),
      TeacherProfile.find({ userId: { $in: userIds } }).select('userId subject').lean()
    ]);

    const studentByUser = new Map(students.map(s => [toId(s.userId), s]));
    const profileByUser = new Map(profiles.map(p => [toId(p.userId), p]));
    const classIds = [...new Set(students.map(s => s.classId).filter(Boolean).map(toId))];
    const classes = classIds.length
      ? await Class.find({ _id: { $in: classIds } }).select('className grade').lean()
      : [];
    const classById = new Map(classes.map(c => [toId(c._id), c]));

    const online = presenceMap(userIds);

    const enriched = users.map(u => {
      const student = studentByUser.get(toId(u._id));
      const profile = profileByUser.get(toId(u._id));
      const classDoc = student && student.classId ? classById.get(toId(student.classId)) : null;
      const className = classDoc ? `${classDoc.className} ${classDoc.grade}`.trim() : null;

      return {
        ...u,
        fullName: u.fullName,
        // Null rather than absent so the client can render a stable row.
        studentId: student ? student.studentId || null : null,
        sdmsCode: student ? student.sdmsCode || null : null,
        classId: student && student.classId ? student.classId : null,
        className,
        department: profile ? profile.subject || null : null,
        isOnline: online.get(toId(u._id)) || false,
        lastSeenAt: u.lastSeenAt || null
      };
    });

    // Free-text search over name, id, class and department.
    const term = String(req.query.search || req.query.q || '').trim().toLowerCase();
    const searched = term
      ? enriched.filter(u =>
          [u.fullName, u.email, u.studentId, u.sdmsCode, u.className, u.department, u.role]
            .filter(Boolean)
            .some(v => String(v).toLowerCase().includes(term))
        )
      : enriched;

    const grouped = {
      super_admin:      searched.filter(u => u.role === 'super_admin'),
      academic_admin:   searched.filter(u => u.role === 'academic_admin'),
      discipline_admin: searched.filter(u => u.role === 'discipline_admin'),
      accounts_admin:   searched.filter(u => u.role === 'accounts_admin'),
      teachers:         searched.filter(u => u.role === 'teacher'),
      students:         searched.filter(u => u.role === 'student'),
      parents:          searched.filter(u => u.role === 'parent')
    };

    res.json({ success: true, users: grouped, total: searched.length });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── unread totals ───────────────────────────────────────────────────────────

router.get('/messages/unread-count', authMiddleware, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      'participants.userId': req.userId,
      isActive: true
    }).select('_id participants').lean();

    const visible = conversations.filter(c => {
      const p = participantOf(c, req.userId);
      return p && !p.isArchived;
    });

    const unread = await unreadCountsFor(req.userId, visible.map(c => c._id));
    let total = 0;
    for (const count of unread.values()) total += count;

    res.json({ success: true, count: total });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── legacy one-to-one thread ────────────────────────────────────────────────

const markConversationRead = async (conversationId, userId) => {
  const now = new Date();
  await Message.updateMany(
    { conversationId, senderId: { $ne: oid(userId) }, readBy: { $ne: oid(userId) } },
    { $addToSet: { readBy: oid(userId) }, $set: { isRead: true, readAt: now } }
  );

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) return null;

  const viewer = participantOf(conversation, userId);
  if (viewer) {
    viewer.lastReadAt = now;
    await conversation.save();
  }

  const pending = await Message.find({
    conversationId,
    senderId: { $ne: oid(userId) },
    status: { $in: ['sent', 'delivered'] }
  });
  for (const message of pending) await recomputeStatus(message, conversation);

  emitToConversation(conversation, 'messages_read', {
    conversationId: toId(conversationId),
    readBy: userId,
    at: now
  }, userId);

  return conversation;
};

router.get('/messages/conversation/:userId', authMiddleware, async (req, res) => {
  try {
    const otherId = req.params.userId;
    if (!mongoose.isValidObjectId(otherId)) return fail(res, 400, 'Invalid recipient.');

    const key = directKeyFor(req.userId, otherId);
    const conversation = await Conversation.findOne({ directKey: key, isActive: true });

    if (!conversation) {
      // Nothing has been written between these two yet; an empty thread is a
      // valid answer rather than an error, because the modal opens it on select.
      return res.json({ success: true, messages: [], conversationId: null });
    }
    if (!isMember(conversation, req.userId)) return fail(res, 403, 'Not a participant.');

    const messages = await Message.find({
      conversationId: conversation._id,
      ...visibleTo(req.userId)
    }).sort({ createdAt: 1 }).limit(100).lean();

    await markConversationRead(conversation._id, req.userId);

    res.json({ success: true, messages, conversationId: conversation._id });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.put('/messages/mark-read/:userId', authMiddleware, async (req, res) => {
  try {
    const otherId = req.params.userId;
    if (!mongoose.isValidObjectId(otherId)) return fail(res, 400, 'Invalid recipient.');

    const conversation = await Conversation.findOne({
      directKey: directKeyFor(req.userId, otherId),
      isActive: true
    });
    if (!conversation) return res.json({ success: true, updated: 0 });

    const before = await Message.countDocuments({
      conversationId: conversation._id,
      senderId: oid(otherId),
      readBy: { $ne: oid(req.userId) },
      ...visibleTo(req.userId)
    });

    await markConversationRead(conversation._id, req.userId);
    res.json({ success: true, updated: before });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── send ────────────────────────────────────────────────────────────────────

const MESSAGE_LIMITS = {
  content: 4000,
  attachments: 6,
  mentions: 50
};

router.post('/messages/send', authMiddleware, async (req, res) => {
  try {
    const body = req.body || {};

    // The original modal posts `receiverId`; earlier code read `recipientId`,
    // so neither spelling ever reached a saved message. Accept both, and a
    // conversationId when the new client has one.
    const targetId = body.recipientId || body.receiverId || body.to;
    const {
      content = '',
      subject,
      type = 'text',
      attachments = [],
      replyTo = null,
      mentions = [],
      conversationId = null
    } = body;

    const trimmed = String(content || '').trim();
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

    if (!trimmed && !hasAttachments) return fail(res, 400, 'Write something first.');
    if (trimmed.length > MESSAGE_LIMITS.content) {
      return fail(res, 400, `Messages are limited to ${MESSAGE_LIMITS.content} characters.`);
    }

    let conversation = null;

    if (conversationId) {
      if (!mongoose.isValidObjectId(conversationId)) return fail(res, 400, 'Invalid conversation.');
      conversation = await Conversation.findById(conversationId);
      if (!conversation) return fail(res, 404, 'Conversation not found.');
      if (!isMember(conversation, req.userId)) return fail(res, 403, 'You are not part of this conversation.');
      if (conversation.type === 'direct') {
        // A direct thread may only be addressed by its two participants, which
        // membership already guarantees; nothing extra to do.
      }
    } else if (targetId) {
      if (!mongoose.isValidObjectId(targetId)) return fail(res, 400, 'Invalid recipient.');
      if (toId(targetId) === toId(req.userId)) return fail(res, 400, 'You cannot message yourself.');

      const allowed = await canContact(req.userId, req.userRole, targetId);
      if (!allowed) return fail(res, 403, 'You cannot message this person.');

      conversation = await ensureDirectConversation(req.userId, targetId);
      if (!conversation) return fail(res, 404, 'That person could not be found.');
    } else {
      return fail(res, 400, 'A recipient or conversation is required.');
    }

    const sender = await User.findById(req.userId).lean();
    if (!sender) return fail(res, 404, 'Account not found.');

    // Fetched before the insert so the reply preview travels with a single
    // write instead of costing a second round trip.
    let replyPreview;
    if (replyTo && mongoose.isValidObjectId(replyTo)) {
      const parent = await Message.findById(replyTo).select('conversationId senderName content type').lean();
      if (!parent || toId(parent.conversationId) !== toId(conversation._id)) {
        return fail(res, 400, 'The message you are replying to is not in this conversation.');
      }
      replyPreview = {
        senderName: parent.senderName,
        content: (parent.content || '').substring(0, 140),
        type: parent.type
      };
    }

    const safeType = ['text', 'image', 'file', 'voice', 'link', 'contact', 'location'].includes(type)
      ? type
      : 'text';

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: req.userId,
      senderName: sender.fullName,
      senderRole: sender.role,
      type: safeType,
      content: trimmed,
      attachments: (Array.isArray(attachments) ? attachments : []).slice(0, MESSAGE_LIMITS.attachments),
      replyTo: replyPreview ? replyTo : undefined,
      replyPreview,
      mentions: (Array.isArray(mentions) ? mentions : [])
        .filter(id => mongoose.isValidObjectId(id))
        .slice(0, MESSAGE_LIMITS.mentions),
      // Kept for the original modal, which still threads on subject.
      subject: subject ? String(subject).substring(0, 200) : undefined,
      // Also recorded on the legacy columns so any older reader keeps working.
      recipientId: conversation.type === 'direct'
        ? (conversation.participants.find(p => toId(p.userId) !== toId(req.userId)) || {}).userId
        : undefined,
      status: 'sent',
      readBy: [],
      deliveredTo: []
    });

    await touchConversation(conversation._id, message);

    const payload = { message: shapeMessage(message, req.userId), conversationId: toId(conversation._id) };
    emitToConversation(conversation, 'new_message', payload, req.userId);

    res.json({ success: true, message, conversationId: conversation._id });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── thread, paginated ───────────────────────────────────────────────────────

router.get('/messages/thread/:conversationId', authMiddleware, async (req, res) => {
  try {
    const { conversationId } = req.params;
    if (!mongoose.isValidObjectId(conversationId)) return fail(res, 400, 'Invalid conversation.');

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return fail(res, 404, 'Conversation not found.');
    if (!isMember(conversation, req.userId)) return fail(res, 403, 'You are not part of this conversation.');

    const limit = [10, 20, 30, 50, 100].includes(Number(req.query.limit)) ? Number(req.query.limit) : 50;
    const filter = { conversationId: conversation._id, ...visibleTo(req.userId) };

    // Cursor pagination: everything older than `before`, newest first in the
    // query and reversed on the way out so the thread reads oldest-first.
    if (req.query.before && mongoose.isValidObjectId(req.query.before)) {
      const anchor = await Message.findById(req.query.before).select('createdAt').lean();
      if (anchor) filter.createdAt = { $lt: anchor.createdAt };
    }

    const [raw, pinned] = await Promise.all([
      Message.find(filter).sort({ createdAt: -1 }).limit(limit + 1).lean(),
      Message.find({ conversationId: conversation._id, pinnedAt: { $ne: null }, ...visibleTo(req.userId) })
        .sort({ pinnedAt: -1 })
        .limit(20)
        .lean()
    ]);

    const hasMore = raw.length > limit;
    const page = (hasMore ? raw.slice(0, limit) : raw).reverse();

    // Resolve reply previews in one extra read rather than per message.
    const replyIds = [...new Set(page.map(m => m.replyTo).filter(Boolean).map(toId))];
    const parents = replyIds.length
      ? await Message.find({ _id: { $in: replyIds } }).select('senderName content type').lean()
      : [];
    const parentById = new Map(parents.map(p => [toId(p._id), p]));

    const messages = page.map(m => {
      const shaped = shapeMessage(m, req.userId);
      if (!shaped.replyPreview && m.replyTo && parentById.get(toId(m.replyTo))) {
        const parent = parentById.get(toId(m.replyTo));
        shaped.replyPreview = {
          senderName: parent.senderName,
          content: (parent.content || '').substring(0, 140),
          type: parent.type
        };
      }
      return shaped;
    });

    await markConversationRead(conversation._id, req.userId);

    res.json({
      success: true,
      messages,
      pinned: pinned.map(m => shapeMessage(m, req.userId)),
      hasMore,
      conversationId: conversation._id
    });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── loading a single message with its authorisation context ────────────────

const loadOwnMessage = async (req, res) => {
  const { messageId } = req.params;
  if (!mongoose.isValidObjectId(messageId)) {
    fail(res, 400, 'Invalid message.');
    return null;
  }
  const message = await Message.findById(messageId);
  if (!message) {
    fail(res, 404, 'Message not found.');
    return null;
  }
  if (!message.conversationId) {
    fail(res, 400, 'That message is not part of a conversation.');
    return null;
  }
  const conversation = await Conversation.findById(message.conversationId);
  if (!conversation || !isMember(conversation, req.userId)) {
    fail(res, 403, 'You are not part of this conversation.');
    return null;
  }
  return { message, conversation };
};

// ─── edit ────────────────────────────────────────────────────────────────────

router.put('/messages/:messageId', authMiddleware, async (req, res) => {
  try {
    const loaded = await loadOwnMessage(req, res);
    if (!loaded) return;
    const { message, conversation } = loaded;

    if (toId(message.senderId) !== toId(req.userId)) return fail(res, 403, 'Only the sender can edit a message.');
    if (message.type === 'system' || message.type === 'announcement') {
      return fail(res, 400, 'System messages cannot be edited.');
    }
    if (message.deletedForEveryone) return fail(res, 400, 'That message has been deleted.');

    const content = String(req.body?.content || '').trim();
    if (!content) return fail(res, 400, 'Write something first.');
    if (content.length > MESSAGE_LIMITS.content) {
      return fail(res, 400, `Messages are limited to ${MESSAGE_LIMITS.content} characters.`);
    }

    message.content = content;
    message.editedAt = new Date();
    await message.save();

    emitToConversation(conversation, 'message_updated', {
      message: shapeMessage(message, req.userId),
      conversationId: toId(conversation._id)
    }, req.userId);

    res.json({ success: true, message: shapeMessage(message, req.userId) });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── delete: for everyone, or just for me ────────────────────────────────────

router.delete('/messages/:messageId', authMiddleware, async (req, res) => {
  try {
    const loaded = await loadOwnMessage(req, res);
    if (!loaded) return;
    const { message, conversation } = loaded;

    // scope=me is the default for anyone who is not the sender; the original
    // endpoint only ever soft-deleted for everybody, which let a recipient
    // erase the other person's message.
    const requested = String(req.query.scope || '').toLowerCase();
    const isSender = toId(message.senderId) === toId(req.userId);
    const scope = requested === 'everyone' || requested === 'me'
      ? requested
      : (isSender ? 'everyone' : 'me');

    if (scope === 'everyone') {
      if (!isSender) return fail(res, 403, 'Only the sender can delete a message for everyone.');
      message.deletedForEveryone = true;
      message.deletedAt = new Date();
      message.isDeleted = true;
      message.content = '';
      message.attachments = [];
      message.reactions = [];
      await message.save();

      emitToConversation(conversation, 'message_deleted', {
        messageId: message._id,
        conversationId: toId(conversation._id),
        scope: 'everyone'
      });
      return res.json({ success: true, scope });
    }

    if ((message.deletedFor || []).some(id => toId(id) === toId(req.userId))) {
      return res.json({ success: true, scope: 'me' });
    }
    message.deletedFor.push(req.userId);
    await message.save();

    emitToConversation(conversation, 'message_deleted', {
      messageId: message._id,
      conversationId: toId(conversation._id),
      scope: 'me'
    }, req.userId);

    res.json({ success: true, scope: 'me' });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── reply / forward ─────────────────────────────────────────────────────────

router.post('/messages/:messageId/forward', authMiddleware, async (req, res) => {
  try {
    const loaded = await loadOwnMessage(req, res);
    if (!loaded) return;
    const { message } = loaded;

    if (message.deletedForEveryone) return fail(res, 400, 'That message has been deleted.');

    const targets = Array.isArray(req.body?.conversationIds) ? req.body.conversationIds : [];
    if (!targets.length) return fail(res, 400, 'Choose where to forward it.');

    const sender = await User.findById(req.userId).lean();
    const sent = [];

    for (const targetId of targets.slice(0, 10)) {
      if (!mongoose.isValidObjectId(targetId)) continue;
      const conversation = await Conversation.findById(targetId);
      if (!conversation || !isMember(conversation, req.userId)) continue;

      const copy = await Message.create({
        conversationId: conversation._id,
        senderId: req.userId,
        senderName: sender.fullName,
        senderRole: sender.role,
        type: message.type,
        content: message.content,
        payload: message.payload,
        attachments: message.attachments,
        forwardedFrom: message._id,
        status: 'sent',
        readBy: [],
        deliveredTo: []
      });

      await touchConversation(conversation._id, copy);
      emitToConversation(conversation, 'new_message', {
        message: shapeMessage(copy, req.userId),
        conversationId: toId(conversation._id)
      }, req.userId);
      sent.push(toId(conversation._id));
    }

    if (!sent.length) return fail(res, 403, 'You cannot forward to any of those conversations.');
    res.json({ success: true, forwardedTo: sent });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── react / pin / star ──────────────────────────────────────────────────────

router.post('/messages/:messageId/react', authMiddleware, async (req, res) => {
  try {
    const loaded = await loadOwnMessage(req, res);
    if (!loaded) return;
    const { message, conversation } = loaded;

    const emoji = String(req.body?.emoji || '').trim();
    if (!emoji) return fail(res, 400, 'An emoji is required.');
    if (emoji.length > 8) return fail(res, 400, 'That is not a reaction.');

    const existing = (message.reactions || []).findIndex(
      r => r.emoji === emoji && toId(r.userId) === toId(req.userId)
    );

    let added;
    if (existing >= 0) {
      message.reactions.splice(existing, 1);
      added = false;
    } else {
      message.reactions.push({ userId: req.userId, emoji });
      added = true;
    }
    await message.save();

    emitToConversation(conversation, 'message_updated', {
      message: shapeMessage(message, req.userId),
      conversationId: toId(conversation._id)
    });

    res.json({ success: true, added, reactions: shapeReaction(message.reactions, req.userId) });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.put('/messages/:messageId/pin', authMiddleware, async (req, res) => {
  try {
    const loaded = await loadOwnMessage(req, res);
    if (!loaded) return;
    const { message, conversation } = loaded;

    const mayPin = toId(message.senderId) === toId(req.userId) ||
      isGroupAdmin(conversation, req.userId) ||
      isStaff(req.userRole);
    if (!mayPin) return fail(res, 403, 'Only the sender or a group owner can pin a message.');

    const next = req.body?.value !== undefined ? !!req.body.value : !message.pinnedAt;
    message.pinnedAt = next ? new Date() : null;
    if (next) message.pinnedBy = req.userId;
    await message.save();

    emitToConversation(conversation, 'message_updated', {
      message: shapeMessage(message, req.userId),
      conversationId: toId(conversation._id)
    });

    res.json({ success: true, pinned: next });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

router.post('/messages/:messageId/star', authMiddleware, async (req, res) => {
  try {
    const loaded = await loadOwnMessage(req, res);
    if (!loaded) return;
    const { message } = loaded;

    const has = (message.starredBy || []).some(id => toId(id) === toId(req.userId));
    if (has) message.starredBy = message.starredBy.filter(id => toId(id) !== toId(req.userId));
    else message.starredBy.push(req.userId);
    await message.save();

    // Saving is personal, so it is deliberately not broadcast.
    res.json({ success: true, starred: !has });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── report ──────────────────────────────────────────────────────────────────

router.post('/messages/:messageId/report', authMiddleware, async (req, res) => {
  try {
    const loaded = await loadOwnMessage(req, res);
    if (!loaded) return;
    const { message } = loaded;

    const already = (message.reports || []).some(r => toId(r.userId) === toId(req.userId) && !r.resolved);
    if (already) return fail(res, 400, 'You have already reported this message.');

    message.reports.push({
      userId: req.userId,
      reason: String(req.body?.reason || '').substring(0, 500)
    });
    await message.save();

    res.json({ success: true, reportCount: message.reports.filter(r => !r.resolved).length });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── delivery acknowledgement ────────────────────────────────────────────────

router.put('/messages/:messageId/status', authMiddleware, async (req, res) => {
  try {
    const loaded = await loadOwnMessage(req, res);
    if (!loaded) return;
    const { message, conversation } = loaded;

    if (toId(message.senderId) === toId(req.userId)) {
      return fail(res, 400, 'The sender does not acknowledge their own message.');
    }

    const status = String(req.body?.status || '');
    if (!['delivered', 'read'].includes(status)) return fail(res, 400, 'Unsupported status.');

    if (status === 'delivered') {
      if (!(message.deliveredTo || []).some(id => toId(id) === toId(req.userId))) {
        message.deliveredTo.push(req.userId);
      }
    } else {
      if (!(message.readBy || []).some(id => toId(id) === toId(req.userId))) {
        message.readBy.push(req.userId);
      }
      message.isRead = true;
      message.readAt = message.readAt || new Date();
    }

    await message.save();
    const updated = await recomputeStatus(message, conversation);

    emitToConversation(conversation, 'message_updated', {
      message: shapeMessage(updated, req.userId),
      conversationId: toId(conversation._id)
    }, req.userId);

    res.json({ success: true, status: updated.status });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── bulk actions ────────────────────────────────────────────────────────────

router.post('/messages/bulk', authMiddleware, async (req, res) => {
  try {
    const { action, messageIds } = req.body || {};
    const ids = (Array.isArray(messageIds) ? messageIds : [])
      .filter(id => mongoose.isValidObjectId(id))
      .slice(0, 100);
    if (!ids.length) return fail(res, 400, 'No messages selected.');

    const messages = await Message.find({ _id: { $in: ids } });
    const mine = [];
    for (const message of messages) {
      if (!message.conversationId) continue;
      const conversation = await Conversation.findById(message.conversationId).select('participants').lean();
      if (conversation && isMember(conversation, req.userId)) mine.push({ message, conversation });
    }
    if (!mine.length) return fail(res, 403, 'None of those messages are in your conversations.');

    const touchedConversations = new Map();

    if (action === 'read' || action === 'unread') {
      for (const { message, conversation } of mine) {
        const has = (message.readBy || []).some(id => toId(id) === toId(req.userId));
        if (action === 'read') {
          if (!has) message.readBy.push(req.userId);
          message.isRead = true;
          message.readAt = new Date();
        } else if (has) {
          message.readBy = message.readBy.filter(id => toId(id) !== toId(req.userId));
          message.isRead = false;
          message.readAt = null;
          message.status = 'sent';
        }
        await message.save();
        touchedConversations.set(toId(conversation._id), conversation);
      }
      for (const conversation of touchedConversations.values()) {
        const pending = await Message.find({
          conversationId: conversation._id,
          senderId: { $ne: oid(req.userId) },
          status: { $in: ['sent', 'delivered'] }
        });
        for (const message of pending) await recomputeStatus(message, conversation);
      }
      return res.json({ success: true, action, updated: mine.length });
    }

    if (action === 'delete') {
      const scope = String(req.body.scope || '') === 'me' ? 'me' : 'everyone';
      let updated = 0;
      for (const { message } of mine) {
        if (scope === 'everyone') {
          if (toId(message.senderId) !== toId(req.userId)) continue;
          message.deletedForEveryone = true;
          message.deletedAt = new Date();
          message.isDeleted = true;
          message.content = '';
          message.attachments = [];
        } else if (!(message.deletedFor || []).some(id => toId(id) === toId(req.userId))) {
          message.deletedFor.push(req.userId);
        }
        await message.save();
        updated += 1;
      }
      if (!updated) return fail(res, 403, 'You cannot delete those messages.');
      return res.json({ success: true, action, updated });
    }

    if (action === 'star' || action === 'unstar') {
      let updated = 0;
      for (const { message } of mine) {
        const has = (message.starredBy || []).some(id => toId(id) === toId(req.userId));
        if (action === 'star' && !has) { message.starredBy.push(req.userId); updated += 1; }
        if (action === 'unstar' && has) {
          message.starredBy = message.starredBy.filter(id => toId(id) !== toId(req.userId));
          updated += 1;
        }
        if (updated) await message.save();
      }
      return res.json({ success: true, action, updated });
    }

    fail(res, 400, 'Unsupported bulk action.');
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── search ──────────────────────────────────────────────────────────────────

router.get('/messages/search', authMiddleware, async (req, res) => {
  try {
    const term = String(req.query.q || '').trim();
    if (term.length < 2) return fail(res, 400, 'Enter at least two characters.');

    const conversations = await Conversation.find({
      'participants.userId': req.userId,
      isActive: true
    }).select('_id').lean();
    const conversationIds = conversations.map(c => c._id);

    if (!conversationIds.length) return res.json({ success: true, results: [], total: 0 });

    // Escape the term: this is a user-supplied regular expression, and an
    // unescaped "(" would either throw or match more than intended.
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter = {
      conversationId: { $in: conversationIds },
      $or: [
        { content: { $regex: escaped, $options: 'i' } },
        { 'attachments.name': { $regex: escaped, $options: 'i' } },
        { senderName: { $regex: escaped, $options: 'i' } }
      ],
      ...visibleTo(req.userId)
    };

    if (req.query.conversationId && mongoose.isValidObjectId(req.query.conversationId)) {
      // Narrowing to one conversation must not widen access to it: the id is
      // only honoured when it is already in the caller's own set.
      const wanted = String(req.query.conversationId);
      if (!conversationIds.some(id => toId(id) === wanted)) {
        return fail(res, 403, 'You are not part of that conversation.');
      }
      filter.conversationId = new mongoose.Types.ObjectId(wanted);
    }
    if (req.query.type) filter.type = String(req.query.type);
    if (req.query.senderId && mongoose.isValidObjectId(req.query.senderId)) {
      filter.senderId = new mongoose.Types.ObjectId(req.query.senderId);
    }
    if (req.query.unread === 'true') filter.readBy = { $ne: oid(req.userId) };
    if (req.query.starred === 'true') filter.starredBy = oid(req.userId);
    if (req.query.hasAttachment === 'true') filter.attachments = { $exists: true, $ne: [] };

    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) {
        const from = new Date(req.query.from);
        if (!Number.isNaN(from.getTime())) filter.createdAt.$gte = from;
      }
      if (req.query.to) {
        const to = new Date(req.query.to);
        if (!Number.isNaN(to.getTime())) {
          // An end date given as "2026-10-06" should cover that whole day.
          to.setHours(23, 59, 59, 999);
          filter.createdAt.$lte = to;
        }
      }
      if (!Object.keys(filter.createdAt).length) delete filter.createdAt;
    }

    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const [results, total] = await Promise.all([
      Message.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      Message.countDocuments(filter)
    ]);

    // Attach enough conversation context for the client to jump to the hit.
    const convIds = [...new Set(results.map(m => toId(m.conversationId)))];
    const convs = await Conversation.find({ _id: { $in: convIds } })
      .select('type name category participants')
      .lean();
    const convById = new Map(convs.map(c => [toId(c._id), c]));

    res.json({
      success: true,
      results: results.map(m => ({
        ...shapeMessage(m, req.userId),
        conversation: convById.get(toId(m.conversationId)) || null
      })),
      total
    });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

// ─── saved (starred) and pinned ──────────────────────────────────────────────

router.get('/messages/starred', authMiddleware, async (req, res) => {
  try {
    const results = await Message.find({
      starredBy: oid(req.userId),
      ...visibleTo(req.userId)
    }).sort({ createdAt: -1 }).limit(100).lean();

    res.json({ success: true, results });
  } catch (error) {
    fail(res, 500, error.message);
  }
});

module.exports = router;
