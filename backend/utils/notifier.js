const Notification = require('../models/Notification');
const NotificationPreference = require('../models/NotificationPreference');
const User = require('../models/User');
const { sendNotificationEmail } = require('./emailService');
const presence = require('./presence');

// One entry point for everything that wants to tell a person something.
//
//   notify({ userId, type, title, body, link, ... })
//
// Channel policy lives here rather than at each call site: the recipient's
// preferences decide whether the notification exists at all, whether email
// goes out, and whether anything other than the in-app inbox is held back for
// quiet hours. Callers never have to remember those rules.
//
// Push and SMS are deliberately stubs. Wiring them needs provider credentials,
// so they sit behind the same interface and report "not configured" instead of
// pretending to have delivered something.

const AGGREGATION_WINDOW_MS = 30 * 60 * 1000;
const AGGREGATE_TYPES = new Set(['message', 'group_message']);

const notConfigured = (channel) => async () => ({
  skipped: true,
  channel,
  reason: 'not_configured'
});

const deliverPush = notConfigured('push');
const deliverSms = notConfigured('sms');

// When does the current quiet window close? Needed so a notification deferred
// at 23:00 knows to go out at 06:00 rather than being dropped.
const quietWindowEnd = (prefs, at = new Date()) => {
  const { start, end } = prefs.quietHours;
  const nowMinutes = at.getHours() * 60 + at.getMinutes();
  const result = new Date(at);

  if (start <= end) {
    // Window sits inside one day: it closes later today.
    result.setHours(Math.floor(end / 60), end % 60, 0, 0);
    if (result <= at) result.setDate(result.getDate() + 1);
    return result;
  }

  // Window wraps midnight. If we are past the start it closes tomorrow,
  // otherwise we are in the early part and it closes today.
  if (nowMinutes >= start) result.setDate(result.getDate() + 1);
  result.setHours(Math.floor(end / 60), end % 60, 0, 0);
  return result;
};

const channelIsOn = (prefs, channel) =>
  !!(prefs.channels && prefs.channels[channel]);

const isMutedConversation = (prefs, conversationId) => {
  if (!conversationId || !prefs.mutedConversations) return false;
  return prefs.mutedConversations.some(id => String(id) === String(conversationId));
};

// Decides whether email is appropriate for this kind of notice. Chat would
// otherwise mail somebody for every single message they are sent.
const emailWorthSending = (type, recipientIsOnline) => {
  if (['message', 'group_message', 'mention', 'reply'].includes(type)) {
    // A person with the portal open already sees the badge; mailing them too
    // is just noise.
    return !recipientIsOnline;
  }
  return true;
};

// Chat bursts collapse into one row per conversation, so the inbox does not
// fill with a line per message when somebody is talking.
const aggregate = async (fields, title, body) => {
  if (!AGGREGATE_TYPES.has(fields.type) || !fields.conversationId) return null;

  const cutoff = new Date(Date.now() - AGGREGATION_WINDOW_MS);
  const existing = await Notification.findOne({
    userId: fields.userId,
    type: fields.type,
    conversationId: fields.conversationId,
    read: false,
    createdAt: { $gte: cutoff }
  });

  if (!existing) return null;

  existing.title = title;
  existing.body = body;
  existing.count = (existing.count || 1) + 1;
  existing.createdAt = new Date();
  if (fields.messageId) existing.messageId = fields.messageId;
  await existing.save();
  return existing;
};

const notify = async (input) => {
  const {
    userId,
    type,
    title,
    body = '',
    link = null,
    conversationId = null,
    messageId = null,
    announcementId = null,
    actorId = null,
    actorName = null
  } = input || {};

  if (!userId || !type || !title) return { skipped: true, reason: 'incomplete' };
  if (!Notification.NOTIFICATION_TYPES.includes(type)) {
    return { skipped: true, reason: 'unknown_type' };
  }
  // Never notify someone about their own action.
  if (actorId && String(actorId) === String(userId)) return { skipped: true, reason: 'self' };

  try {
    const [prefs, user] = await Promise.all([
      NotificationPreference.getFor(userId),
      User.findById(userId).select('fullName email isActive').lean()
    ]);

    if (!user || !user.isActive) return { skipped: true, reason: 'no_recipient' };
    if (!prefs.types[type]) return { skipped: true, reason: 'type_muted' };
    if (isMutedConversation(prefs, conversationId)) return { skipped: true, reason: 'conversation_muted' };

    const now = new Date();
    const quietNow = NotificationPreference.isQuietNow(prefs, now);
    const online = presence.isOnline(userId);

    const notification = await aggregate(
      { userId, type, conversationId, messageId },
      title,
      body
    );

    const row = notification || (await Notification.create({
      userId,
      type,
      title,
      body,
      link,
      conversationId,
      messageId,
      announcementId,
      actorId,
      actorName,
      // The in-app inbox is written immediately either way, so opening the
      // portal always shows a complete history; quiet hours suppress the
      // channels that would reach out and touch somebody.
      delivery: { inApp: { at: now } },
      deferred: quietNow,
      deferredUntil: quietNow ? quietWindowEnd(prefs, now) : null
    }));

    if (quietNow) {
      return { notification: row, deferred: true, channels: ['inApp'] };
    }

    const delivered = ['inApp'];

    if (channelIsOn(prefs, 'email') && emailWorthSending(type, online)) {
      try {
        const sent = await sendNotificationEmail(user, { title, body, link });
        if (sent) {
          row.delivery.email = { at: new Date() };
          await row.save();
          delivered.push('email');
        }
      } catch {
        // A mail failure must never fail the action that triggered the
        // notification; the in-app copy has already been written.
        row.delivery.email = { error: 'send_failed' };
        await row.save();
      }
    }

    if (channelIsOn(prefs, 'push') && prefs.pushEnabled) {
      const outcome = await deliverPush(user, row);
      row.delivery.push = { error: outcome.reason };
      await row.save();
    }

    if (channelIsOn(prefs, 'sms') && prefs.smsEnabled) {
      const outcome = await deliverSms(user, row);
      row.delivery.sms = { error: outcome.reason };
      await row.save();
    }

    return { notification: row, deferred: false, channels: delivered };
  } catch (error) {
    return { skipped: true, reason: 'error', error: error.message };
  }
};

// Convenience for fan-out: one call per recipient, each resolved independently
// so one bad address cannot stop the rest.
const notifyMany = async (userIds, input) => {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [])
    .filter(Boolean)
    .map(String)
    .filter(id => String(id) !== String(input.actorId)))];

  const results = await Promise.all(ids.map(userId => notify({ ...input, userId })));
  return {
    attempted: ids.length,
    delivered: results.filter(r => !r.skipped).length,
    results
  };
};

// Sends anything held back by quiet hours whose window has now closed.
const flushDeferred = async () => {
  const now = new Date();
  const pending = await Notification.find({
    deferred: true,
    deferredUntil: { $lte: now }
  }).limit(200);

  let flushed = 0;

  for (const row of pending) {
    try {
      const [prefs, user] = await Promise.all([
        NotificationPreference.getFor(row.userId),
        User.findById(row.userId).select('fullName email isActive').lean()
      ]);

      // A window can have started again since this was queued (short gap
      // between two quiet periods); push it forward rather than send it.
      if (NotificationPreference.isQuietNow(prefs, now)) {
        row.deferredUntil = quietWindowEnd(prefs, now);
        await row.save();
        continue;
      }

      if (!user || !user.isActive) {
        row.deferred = false;
        await row.save();
        continue;
      }

      if (channelIsOn(prefs, 'email') && !row.delivery.email?.at && !row.delivery.email?.error) {
        try {
          const sent = await sendNotificationEmail(user, {
            title: row.title,
            body: row.body,
            link: row.link
          });
          row.delivery.email = sent ? { at: new Date() } : { error: 'not_configured' };
        } catch {
          row.delivery.email = { error: 'send_failed' };
        }
      }

      row.deferred = false;
      row.deferredUntil = null;
      await row.save();
      flushed += 1;
    } catch {
      // Skip this row rather than aborting the whole batch.
    }
  }

  return flushed;
};

// Started by server.js. Kept short so it never dominates a test run.
let flushTimer = null;
const startFlushLoop = (intervalMs = 60 * 1000) => {
  if (flushTimer) return flushTimer;
  flushTimer = setInterval(() => {
    flushDeferred().catch(() => {});
  }, intervalMs);
  // Do not hold the process open just for this.
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
  return flushTimer;
};

const stopFlushLoop = () => {
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
};

module.exports = {
  notify,
  notifyMany,
  flushDeferred,
  startFlushLoop,
  stopFlushLoop,
  deliverPush,
  deliverSms,
  quietWindowEnd
};
