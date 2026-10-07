const mongoose = require('mongoose');

// One document per thing that happened to one person. Delivery per channel is
// recorded on the row itself rather than in separate collections, so the
// notifier can be retried without forking the write path.
const NOTIFICATION_TYPES = [
  'message',        // new direct message
  'group_message',  // new message in a group the user is in
  'mention',        // @mention inside a group
  'reply',          // reply to the user's own message
  'announcement',
  'assignment',
  'exam',
  'fee',
  'attendance',
  'system'
];

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },

    title: { type: String, required: true },
    body: { type: String },
    // Route the notification centre should jump to when clicked.
    link: String,
    // Rolling tally for aggregated message notifications, so a burst of chat
    // messages becomes "12 new messages" rather than twelve rows.
    count: { type: Number, default: 1 },

    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    announcementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Announcement' },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorName: String,

    read: { type: Boolean, default: false },
    readAt: Date,

    // Quiet hours defer rather than drop: the row is created immediately with
    // deferred set, and the flush job sends it when the window closes.
    deferred: { type: Boolean, default: false },
    deferredUntil: Date,

    delivery: {
      inApp: { at: Date },
      email: { at: Date, error: String },
      // Stubs until credentials exist. The notifier writes whatever it knows;
      // these stay empty rather than being faked as delivered.
      push: { at: Date, error: String },
      sms: { at: Date, error: String }
    },

    createdAt: { type: Date, default: Date.now }
  },
  { minimize: false }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, type: 1, createdAt: -1 });
// Deliberately not a TTL index: a deferred notification must be *sent* when the
// quiet window closes, not expired away. The notifier's flush loop scans this.
notificationSchema.index({ deferredUntil: 1, deferred: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
