// One-off upgrade for the messaging collections written before conversations
// became first-class. Safe to re-run: every step is keyed off the absence of
// the new fields rather than a marker, so a partially completed run resumes.
//
//   node scripts/migrate-chat.js

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { directKeyFor } = require('../utils/chat');

const toId = (v) => String(v);

const log = (...args) => console.log(...args);

const backfillConversation = async () => {
  const raw = await Conversation.collection.find({ type: { $exists: false } }).toArray();
  if (!raw.length) return { converted: 0, merged: 0 };

  let converted = 0;
  let merged = 0;
  const seen = new Map();

  for (const doc of raw) {
    const ids = (doc.participants || []).map(p => toId(p.userId)).filter(Boolean);
    if (ids.length !== 2) {
      // A conversation we cannot key (missing participant) is unusable for
      // direct threads; deactivate rather than leave it to collide later.
      // $unset rather than $set to undefined: an explicit null is still a
      // value, and a sparse unique index would count it.
      await Conversation.collection.updateOne(
        { _id: doc._id },
        {
          $set: { type: 'group', category: 'custom', isActive: false },
          $unset: { directKey: '' }
        }
      );
      converted += 1;
      continue;
    }

    const key = directKeyFor(ids[0], ids[1]);
    const holder = seen.get(key);

    if (holder) {
      // Two threads for the same pair. Keep the busier one and move the other
      // thread's messages across so nobody's history is stranded.
      const currentCount = (doc.messageCount || 0);
      const keptCount = (holder.messageCount || 0);
      const keepNew = currentCount > keptCount;
      const keep = keepNew ? doc : holder;
      const drop = keepNew ? holder : doc;

      await Message.collection.updateMany(
        { conversationId: drop._id },
        { $set: { conversationId: keep._id } }
      );
      await Conversation.collection.updateOne(
        { _id: drop._id },
        { $set: { isActive: false }, $unset: { directKey: '' } }
      );
      await Conversation.collection.updateOne(
        { _id: keep._id },
        { $set: { type: 'direct', category: 'custom', directKey: key } }
      );
      seen.set(key, keep);
      merged += 1;
      continue;
    }

    await Conversation.collection.updateOne(
      { _id: doc._id },
      { $set: { type: 'direct', category: 'custom', directKey: key } }
    );
    seen.set(key, { ...doc, directKey: key });
    converted += 1;
  }

  return { converted, merged };
};

const backfillMessages = async () => {
  const pending = await Message.collection.find({ conversationId: { $exists: false } }).toArray();
  if (!pending.length) return 0;

  let migrated = 0;

  for (const doc of pending) {
    if (!doc.senderId || !doc.recipientId) {
      // No pair to hang it on. Mark it read/deleted-shaped so it never shows
      // up as an unread badge nobody can open.
      await Message.collection.updateOne(
        { _id: doc._id },
        { $set: { type: 'text', status: 'read', deletedForEveryone: true } }
      );
      continue;
    }

    const key = directKeyFor(doc.senderId, doc.recipientId);
    let conversation = await Conversation.collection.findOne({ directKey: key });

    if (!conversation) {
      const participants = [doc.senderId, doc.recipientId].map(id => ({
        userId: new mongoose.Types.ObjectId(toId(id)),
        name: '',
        role: '',
        joinedAt: doc.createdAt || new Date()
      }));
      const created = await Conversation.collection.insertOne({
        type: 'direct',
        directKey: key,
        category: 'custom',
        participants,
        isActive: true,
        messageCount: 0,
        lastMessageAt: doc.createdAt || new Date()
      });
      conversation = { _id: created.insertedId };
    }

    const read = !!doc.isRead;
    const set = {
      conversationId: conversation._id,
      type: 'text',
      status: read ? 'read' : 'sent',
      // Older code stored attachments as bare url strings.
      attachments: Array.isArray(doc.attachments)
        ? doc.attachments.map(a =>
            typeof a === 'string'
              ? { url: a, name: a.split('/').pop() || 'attachment', mime: 'application/octet-stream', size: 0, kind: 'other', provider: 'local' }
              : a
          )
        : []
    };

    if (read) {
      set.readBy = [new mongoose.Types.ObjectId(toId(doc.recipientId))];
      set.deliveredTo = [new mongoose.Types.ObjectId(toId(doc.recipientId))];
      set.isRead = true;
      if (doc.readAt) set.readAt = doc.readAt;
      if (doc.readAt) set.deliveredAt = doc.readAt;
    }

    if (doc.isDeleted) set.deletedForEveryone = true;

    await Message.collection.updateOne({ _id: doc._id }, { $set: set });
    migrated += 1;
  }

  return migrated;
};

const refreshConversationPreviews = async () => {
  const conversations = await Conversation.collection.find({ isActive: { $ne: false } }).toArray();

  for (const conv of conversations) {
    const count = await Message.collection.countDocuments({
      conversationId: conv._id,
      deletedForEveryone: { $ne: true }
    });
    const last = await Message.collection.find({ conversationId: conv._id })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    await Conversation.collection.updateOne(
      { _id: conv._id },
      {
        $set: {
          messageCount: count,
          lastMessage: last.length ? (last[0].content || '').substring(0, 100) : '',
          lastMessageAt: last.length ? last[0].createdAt : new Date(),
          lastMessageSenderId: last.length ? last[0].senderId : undefined,
          lastMessageType: last.length ? last[0].type : 'text'
        }
      }
    );
  }
  return conversations.length;
};

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  log('connected');

  // Indexes first: the unique directKey index is what guarantees a pair never
  // gets a second thread, and it has to exist before new writes begin.
  await Conversation.syncIndexes();
  await Message.syncIndexes();
  log('indexes synced');

  const a = await backfillConversation();
  log(`conversations: ${a.converted} converted, ${a.merged} merged`);

  const b = await backfillMessages();
  log(`messages: ${b} backfilled`);

  const c = await refreshConversationPreviews();
  log(`previews recomputed for ${c} conversations`);

  const remaining = await Message.countDocuments({ conversationId: { $exists: false } });
  const unkeyed = await Conversation.countDocuments({ type: { $exists: false } });
  log(`residual unkeyed messages: ${remaining}, conversations: ${unkeyed}`);

  await mongoose.disconnect();
  log('done');
};

main().catch(err => {
  console.error('MIGRATION FAILED:', err);
  process.exit(1);
});
