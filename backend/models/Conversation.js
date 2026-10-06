const mongoose = require('mongoose');

// Direct and group chats share one collection so a single query can list every
// conversation a person is in. `type` is what separates them: a direct chat has
// exactly two participants, a group has many and carries the metadata below.
const participantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: String,
    role: String,
    joinedAt: { type: Date, default: Date.now },
    lastReadAt: Date,
    // Per-participant state lives here rather than in a side collection so the
    // conversation list needs one read instead of three joins.
    isArchived: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },
    mutedUntil: Date,
    nickname: String
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['direct', 'group'], default: 'direct' },
    // Sorted "idA:idB" pair, set only on direct conversations. See the index
    // note below for why this exists.
    directKey: { type: String },
    participants: { type: [participantSchema], default: [] },

    // Group metadata. `category` drives permissions: class groups are derived
    // from the Class roster and cannot be deleted or abandoned by members.
    name: { type: String, trim: true },
    description: { type: String, trim: true, maxlength: 500 },
    avatar: String,
    category: {
      type: String,
      enum: ['class', 'subject', 'department', 'staff', 'custom'],
      default: 'custom'
    },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    subject: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    admins: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
    autoManaged: { type: Boolean, default: false },
    // Hash of the class roster the membership was derived from. Conversation
    // listings compare it before doing any rewrite work, so a stale group is
    // repaired on sight while an up-to-date one costs one read.
    rosterFingerprint: String,

    lastMessage: String,
    lastMessageAt: { type: Date, default: Date.now },
    lastMessageSenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lastMessageType: { type: String, default: 'text' },
    messageCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true, minimize: false }
);

conversationSchema.index({ 'participants.userId': 1, isActive: 1 });
conversationSchema.index({ 'participants.userId': 1, lastMessageAt: -1 });
conversationSchema.index({ classId: 1, type: 1 });

// Two people should never end up with two parallel direct threads. Uniqueness
// over a pair cannot be expressed with an index on an array field (a plain
// {participants.userId, type} unique index would allow each person only one
// direct conversation in total), so the sorted pair is denormalised into one
// key that the unique index can see. Groups have no directKey and are exempt.
conversationSchema.index({ directKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Conversation', conversationSchema);
