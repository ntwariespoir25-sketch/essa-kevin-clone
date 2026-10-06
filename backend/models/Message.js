const mongoose = require('mongoose');

const MESSAGE_TYPES = [
  'text',        // plain message
  'image',       // attachments carry the file
  'file',        // pdf/doc/xls/ppt/zip
  'voice',       // recorded audio
  'link',        // url with unfurled metadata in payload
  'location',    // lat/lng in payload
  'contact',     // shared person in payload
  'announcement',// system-created, points at an Announcement
  'system'       // membership changes, renames, deletions
];

const MESSAGE_STATUS = ['sending', 'sent', 'delivered', 'read', 'failed'];

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    name: { type: String, required: true },
    mime: { type: String, required: true },
    size: { type: Number, default: 0 },
    // Broad bucket so the client can pick an icon and a renderer without
    // sniffing the mime: image, pdf, doc, sheet, slides, archive, audio,
    // video, other.
    kind: { type: String, default: 'other' },
    // Which backend wrote the file (local | s3 | cloudinary) so a later
    // migration knows what it is dealing with.
    provider: { type: String, default: 'local' },
    key: String,
    width: Number,
    height: Number
  },
  { _id: false }
);

const reactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true },
    at: { type: Date, default: Date.now }
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },

    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true },
    senderRole: { type: String, required: true },

    type: { type: String, enum: MESSAGE_TYPES, default: 'text' },
    content: { type: String, default: '' },
    // Structured companion to `content` for link/location/contact payloads and
    // for system messages. Mixed on purpose: the three subtypes have nothing in
    // common and are only ever read, never queried.
    payload: { type: mongoose.Schema.Types.Mixed },
    attachments: { type: [attachmentSchema], default: [] },

    status: { type: String, enum: MESSAGE_STATUS, default: 'sent' },
    deliveredAt: Date,
    readAt: Date,
    readBy: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    deliveredTo: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },

    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    // Denormalised excerpt of the replied-to message. Without it, rendering a
    // thread would need a lookup per message just to draw the quote bubble.
    replyPreview: {
      senderName: String,
      content: { type: String, maxlength: 140 },
      type: String
    },
    forwardedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    editedAt: Date,

    deletedForEveryone: { type: Boolean, default: false },
    deletedAt: Date,
    // "Delete for you" must not remove the message for the other people in the
    // group, so it is a per-viewer list rather than a flag.
    deletedFor: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },

    pinnedAt: Date,
    pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    starredBy: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    reactions: { type: [reactionSchema], default: [] },
    reports: {
      type: [
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          reason: String,
          at: { type: Date, default: Date.now },
          resolved: { type: Boolean, default: false }
        }
      ],
      default: []
    },
    mentions: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },

    // Legacy 1:1 fields. Kept (and no longer required) so records written
    // before conversations became first-class still hydrate and any older
    // query still matches. New writes only set conversationId.
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    recipientName: String,
    recipientRole: String,
    subject: String,
    isRead: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    parentMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },

    createdAt: { type: Date, default: Date.now }
  },
  { minimize: false }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, pinnedAt: -1 });
messageSchema.index({ conversationId: 1, type: 1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ recipientId: 1, isRead: 1 });
// Case-insensitive partial matching is what the message search box needs, and
// a $text index only matches whole tokens, so the search route escapes the
// user's input and uses a regex against this index-adjacent field instead.
messageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
module.exports.MESSAGE_TYPES = MESSAGE_TYPES;
module.exports.MESSAGE_STATUS = MESSAGE_STATUS;
