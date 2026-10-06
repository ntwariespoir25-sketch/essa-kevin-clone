const mongoose = require('mongoose');

// Per-person delivery settings. One document per user, created lazily on first
// read so the defaults apply to everybody who has never opened settings.
const notificationPreferenceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true },

    channels: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: false },
      sms: { type: Boolean, default: false }
    },

    // Per-type switches so an assignment reminder can be muted without losing
    // direct messages.
    types: {
      message: { type: Boolean, default: true },
      group_message: { type: Boolean, default: true },
      mention: { type: Boolean, default: true },
      reply: { type: Boolean, default: true },
      announcement: { type: Boolean, default: true },
      assignment: { type: Boolean, default: true },
      exam: { type: Boolean, default: true },
      fee: { type: Boolean, default: true },
      attendance: { type: Boolean, default: true },
      system: { type: Boolean, default: true }
    },

    quietHours: {
      enabled: { type: Boolean, default: false },
      // Stored as minutes past midnight so comparing them does not depend on
      // parsing "22:00" at every call site. 22:00 -> 1320, 06:00 -> 360.
      start: { type: Number, default: 1320, min: 0, max: 1439 },
      end: { type: Number, default: 360, min: 0, max: 1439 }
    },

    // Overrides `channels.inApp` for particular threads. Per-type switches are
    // the coarse control; this is the "mute this one group" control.
    mutedConversations: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' }],
      default: []
    },

    // Push/SMS stay stubbed until credentials are configured, so a user who
    // switches them on gets a clear reason rather than silent no-ops.
    pushEnabled: { type: Boolean, default: false },
    smsEnabled: { type: Boolean, default: false },

    updatedAt: { type: Date, default: Date.now }
  },
  { minimize: false }
);

// "Is the window quiet right now, for this preference?" Shared by the notifier
// and the settings preview so both agree on the boundary.
notificationPreferenceSchema.statics.isQuietNow = function (prefs, at = new Date()) {
  if (!prefs || !prefs.quietHours || !prefs.quietHours.enabled) return false;
  const now = at.getHours() * 60 + at.getMinutes();
  const { start, end } = prefs.quietHours;
  // Windows that wrap midnight (22:00 -> 06:00) need the disjunction form.
  return start <= end ? now >= start && now < end : now >= start || now < end;
};

notificationPreferenceSchema.statics.getFor = async function (userId) {
  let prefs = await this.findOne({ userId });
  if (!prefs) prefs = await this.create({ userId });
  return prefs;
};

module.exports = mongoose.model('NotificationPreference', notificationPreferenceSchema);
