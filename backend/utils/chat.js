const crypto = require('crypto');
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const Student = require('../models/Student');
const Class = require('../models/Class');
const SubjectAllocation = require('../models/SubjectAllocation');
const { allowedClassIds, isStaff, messagingDirectory } = require('./access');

// Shared conversation logic. Both route files need membership rules and the
// "does this pair already have a thread" lookup, and a group's roster has to be
// derived the same way wherever it is touched.

const toId = (v) => String(v);

// Mongo compares an array field against the *value* you give it, so
// `{ deletedFor: someUser }` only matches when the array holds a real ObjectId.
// A raw string would never match and the filter would silently pass everything,
// which is how "deleted for me" would leak back into view. Every per-viewer
// filter therefore goes through here.
const oid = (v) => {
  try {
    return new mongoose.Types.ObjectId(toId(v));
  } catch {
    return null;
  }
};

// The pair key stored on direct conversations. Sorting makes (a,b) and (b,a)
// the same key, which is what stops a second thread appearing when the other
// person initiates first.
const directKeyFor = (a, b) => [toId(a), toId(b)].sort().join(':');

const participantOf = (conversation, userId) =>
  (conversation.participants || []).find(p => toId(p.userId) === toId(userId));

const isMember = (conversation, userId) => !!participantOf(conversation, userId);

const isGroupAdmin = (conversation, userId) => {
  if (!conversation || conversation.type !== 'group') return false;
  if (toId(conversation.createdBy) === toId(userId)) return true;
  return (conversation.admins || []).some(id => toId(id) === toId(userId));
};

const loadUsers = async (ids) => {
  const unique = [...new Set(ids.filter(Boolean).map(toId))];
  if (!unique.length) return new Map();
  const users = await User.find({ _id: { $in: unique } }).select('fullName role isActive').lean();
  return new Map(users.map(u => [toId(u._id), u]));
};

const asParticipant = (user) => ({
  userId: user._id,
  name: user.fullName,
  role: user.role,
  joinedAt: new Date()
});

// Whether the caller is permitted to open a thread with this person at all.
// Starting a conversation is a read of the target's identity through the same
// directory rules that govern who appears in the contact picker, so a user
// cannot reach someone by posting an id the UI never showed them.
const canContact = async (userId, userRole, targetId) => {
  if (toId(userId) === toId(targetId)) return false;
  const { filter } = await messagingDirectory(userId, userRole);
  return !!(await User.exists({ _id: targetId, ...filter }));
};

// Finds or creates the one-to-one thread between two people. Creation races are
// resolved by the unique directKey index rather than by a lock.
const ensureDirectConversation = async (userId, otherId) => {
  const key = directKeyFor(userId, otherId);
  const existing = await Conversation.findOne({ directKey: key });
  if (existing) return existing;

  const users = await loadUsers([userId, otherId]);
  const me = users.get(toId(userId));
  const them = users.get(toId(otherId));
  if (!me || !them) return null;

  try {
    return await Conversation.create({
      type: 'direct',
      directKey: key,
      participants: [asParticipant(me), asParticipant(them)],
      lastMessageAt: new Date()
    });
  } catch (err) {
    // 11000 = someone else created it between findOne and create.
    if (err && err.code === 11000) return Conversation.findOne({ directKey: key });
    throw err;
  }
};

// The set of user ids who belong to a class group: the class teacher, every
// subject teacher assigned to it, its pupils, and the leadership who oversee
// the school. Returned as ids so callers can decide what to do with them.
const classMemberIds = async (classDoc, allocTeacherIds = null) => {
  const staff = await User.find({ role: { $in: ['super_admin', 'academic_admin'] }, isActive: true })
    .select('_id')
    .lean();
  const staffIds = staff.map(u => toId(u._id));

  const teacherIds = [classDoc.teacherId].filter(Boolean).map(toId);
  const subjectIds = allocTeacherIds
    ? allocTeacherIds.map(toId)
    : (await SubjectAllocation.find({ classId: classDoc._id }).select('teacherId').lean())
        .map(a => toId(a.teacherId));

  const studentUserIds = (classDoc.students || []).length
    ? (await Student.find({ _id: { $in: classDoc.students } }).select('userId').lean())
        .map(s => s.userId && toId(s.userId)).filter(Boolean)
    : [];

  return [...new Set([...staffIds, ...teacherIds, ...subjectIds, ...studentUserIds])];
};

const rosterFingerprint = (classDoc, allocTeacherIds = []) =>
  crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        students: (classDoc.students || []).map(toId).sort(),
        teacher: toId(classDoc.teacherId || ''),
        allocs: [...new Set(allocTeacherIds.map(toId))].sort()
      })
    )
    .digest('hex');

// Creates the class group if it is missing and rewrites its membership if the
// roster moved. Returns the class groups the caller can see.
//
// Fingerprint-first: when nothing changed this is one read of the group and no
// writes at all, which is what makes running it on every conversation listing
// affordable.
const syncClassGroups = async (userId, userRole) => {
  // A parent has a class association (through their child) but is deliberately
  // not a member of the class group - section 10 scopes that space to the class
  // teacher, subject teachers, pupils and leadership. Letting them run the sync
  // would create groups they are not in, so there is nothing to do here.
  if (userRole === 'parent') return [];

  const ids = await allowedClassIds(userId, userRole);
  const filter = ids === null ? {} : { _id: { $in: ids } };

  const classes = await Class.find(filter)
    .select('className grade teacherId students')
    .lean();
  if (!classes.length) return [];

  const classIds = classes.map(c => c._id);
  const existing = await Conversation.find({ type: 'group', classId: { $in: classIds } }).lean();
  const byClass = new Map(existing.map(g => [toId(g.classId), g]));

  // One query for every class's allocations, regardless of how many groups end
  // up needing repair - the result is only used when a fingerprint moved.
  const allocs = await SubjectAllocation.find({ classId: { $in: classIds } })
    .select('classId teacherId')
    .lean();

  const allocsByClass = new Map();
  for (const a of allocs) {
    const list = allocsByClass.get(toId(a.classId)) || [];
    list.push(a.teacherId);
    allocsByClass.set(toId(a.classId), list);
  }

  const touched = [];

  for (const classDoc of classes) {
    const classKey = toId(classDoc._id);
    const allocTeacherIds = allocsByClass.get(classKey) || [];
    const fingerprint = rosterFingerprint(classDoc, allocTeacherIds);
    const group = byClass.get(classKey);

    if (group && group.rosterFingerprint === fingerprint) {
      touched.push(group);
      continue;
    }

    const memberIds = await classMemberIds(classDoc, allocTeacherIds);
    const users = await loadUsers(memberIds);
    const participants = memberIds
      .map(id => users.get(id))
      .filter(Boolean)
      .map(asParticipant);

    const className = `${classDoc.className} ${classDoc.grade}`.trim();

    if (!group) {
      const created = await Conversation.create({
        type: 'group',
        name: className,
        description: `Class space for ${className}. Automatically maintained from the class roster.`,
        category: 'class',
        classId: classDoc._id,
        autoManaged: true,
        createdBy: classDoc.teacherId || userId,
        admins: classDoc.teacherId ? [classDoc.teacherId] : [],
        participants,
        rosterFingerprint: fingerprint,
        lastMessageAt: new Date()
      });
      touched.push(created);
      continue;
    }

    // Repair membership in place so per-person state (lastReadAt, pins, mutes,
    // archived flags) survives a roster change.
    const previous = new Map((group.participants || []).map(p => [toId(p.userId), p]));
    const merged = participants.map(p => {
      const kept = previous.get(toId(p.userId));
      return kept
        ? { ...p, lastReadAt: kept.lastReadAt, isArchived: kept.isArchived, isPinned: kept.isPinned, mutedUntil: kept.mutedUntil, nickname: kept.nickname }
        : p;
    });

    const updated = await Conversation.findOneAndUpdate(
      { _id: group._id },
      { $set: { participants: merged, rosterFingerprint: fingerprint, name: group.name || className } },
      { new: true }
    ).lean();
    touched.push(updated);
  }

  return touched;
};

// Writes a system message ("X added Y") and advances the conversation preview
// in the same step. Marking it read for everyone who is already present keeps
// membership bookkeeping from showing up as an unread badge.
const postSystemMessage = async (conversation, { kind, content, payload = {}, actor }) => {
  const actorDoc = actor && actor._id ? actor : null;
  const message = await Message.create({
    conversationId: conversation._id,
    senderId: actorDoc ? actorDoc._id : conversation.createdBy,
    senderName: actorDoc ? actorDoc.fullName : 'System',
    senderRole: actorDoc ? actorDoc.role : 'system',
    type: 'system',
    content,
    payload: { kind, ...payload },
    status: 'read',
    readBy: (conversation.participants || []).map(p => p.userId)
  });

  await touchConversation(conversation._id, message);
  return message;
};

// Rolls a message's status up from the per-recipient arrays. One rule covers
// both shapes: the status never runs ahead of the least-progressed recipient,
// so a group message only reads "read" once everybody has read it. The sender
// is excluded because nobody waits for their own acknowledgement.
const recomputeStatus = async (message, conversation) => {
  const recipients = (conversation.participants || [])
    .map(p => toId(p.userId))
    .filter(id => id !== toId(message.senderId));
  if (!recipients.length) return message;

  const readBy = new Set((message.readBy || []).map(toId));
  const deliveredTo = new Set((message.deliveredTo || []).map(toId));
  const everyoneRead = recipients.every(id => readBy.has(id));
  const everyoneDelivered = recipients.every(id => readBy.has(id) || deliveredTo.has(id));

  const next = everyoneRead ? 'read' : everyoneDelivered ? 'delivered' : 'sent';
  if (message.status === next) return message;

  message.status = next;
  if (next === 'delivered' && !message.deliveredAt) message.deliveredAt = new Date();
  if (next === 'read' && !message.readAt) message.readAt = new Date();
  message.isRead = next === 'read';
  await message.save();
  return message;
};

// Adds members to a group. Returns the participant entries that were new so the
// caller can announce them with a system message.
const addMembers = async (conversation, memberIds, actorId) => {
  const current = new Set((conversation.participants || []).map(p => toId(p.userId)));
  const incoming = [...new Set(memberIds.map(toId))].filter(id => !current.has(id));
  if (!incoming.length) return [];

  const users = await loadUsers(incoming);
  const fresh = incoming.map(id => users.get(id)).filter(Boolean).map(asParticipant);
  if (!fresh.length) return [];

  await Conversation.updateOne(
    { _id: conversation._id },
    { $push: { participants: { $each: fresh } } }
  );
  return fresh;
};

const removeMember = async (conversation, targetUserId) => {
  const result = await Conversation.updateOne(
    { _id: conversation._id },
    { $pull: { participants: { userId: targetUserId }, admins: targetUserId } }
  );
  return result.modifiedCount > 0;
};

// Keeps the denormalised preview fields current. Callers pass the message that
// was just written.
const touchConversation = async (conversationId, message) => {
  const preview = (message.content || '').substring(0, 100);
  return Conversation.updateOne(
    { _id: conversationId },
    {
      $set: {
        lastMessage: preview,
        lastMessageAt: message.createdAt || new Date(),
        lastMessageSenderId: message.senderId,
        lastMessageType: message.type || 'text'
      },
      $inc: { messageCount: 1 }
    }
  );
};

// Unread totals for a batch of conversations. A message counts as unread when
// the viewer is not in readBy and has not deleted it for themselves.
const unreadCountsFor = async (userId, conversationIds) => {
  if (!conversationIds.length) return new Map();
  const rows = await Message.aggregate([
    {
      $match: {
        conversationId: { $in: conversationIds },
        senderId: { $ne: new mongoose.Types.ObjectId(toId(userId)) },
        deletedForEveryone: { $ne: true },
        deletedFor: { $ne: new mongoose.Types.ObjectId(toId(userId)) },
        readBy: { $ne: new mongoose.Types.ObjectId(toId(userId)) }
      }
    },
    { $group: { _id: '$conversationId', count: { $sum: 1 } } }
  ]);
  return new Map(rows.map(r => [toId(r._id), r.count]));
};

module.exports = {
  toId,
  oid,
  directKeyFor,
  participantOf,
  isMember,
  isGroupAdmin,
  loadUsers,
  asParticipant,
  canContact,
  ensureDirectConversation,
  classMemberIds,
  rosterFingerprint,
  syncClassGroups,
  addMembers,
  removeMember,
  postSystemMessage,
  recomputeStatus,
  touchConversation,
  unreadCountsFor,
  isStaff
};
