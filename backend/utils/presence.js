const User = require('../models/User');

// Live presence, kept in memory because it is derived from open sockets and
// has no durable truth: a process restart loses it, and `lastSeenAt` on the
// user document is what covers that gap.
//
// One entry per user holding the socket ids currently attached, so a person
// with the portal open in two tabs only goes "away" when both close.

const sessions = new Map();

const toId = (v) => String(v);

const markOnline = (userId, socketId) => {
  const key = toId(userId);
  const sockets = sessions.get(key) || new Set();
  sockets.add(socketId);
  sessions.set(key, sockets);
  return sockets.size;
};

const markOffline = (userId, socketId) => {
  const key = toId(userId);
  const sockets = sessions.get(key);
  if (!sockets) return 0;
  sockets.delete(socketId);
  if (!sockets.size) sessions.delete(key);
  return sockets.size;
};

const isOnline = (userId) => sessions.has(toId(userId));

// The presence values for a batch of people in one pass, so a contact list
// does not become N queries.
const presenceMap = (userIds) => {
  const out = new Map();
  for (const id of userIds) out.set(toId(id), sessions.has(toId(id)));
  return out;
};

// Fires at most once per WRITE_INTERVAL per user. Socket disconnects happen
// constantly (page reloads, tab closes) and writing the same timestamp each
// time would turn a cosmetic field into a write amplifier.
const WRITE_INTERVAL_MS = 30 * 1000;
const lastWrite = new Map();

const touchLastSeen = async (userId, at = new Date()) => {
  const key = toId(userId);
  const previous = lastWrite.get(key) || 0;
  if (at.getTime() - previous < WRITE_INTERVAL_MS) return false;
  lastWrite.set(key, at.getTime());
  try {
    await User.updateOne({ _id: key }, { $set: { lastSeenAt: at, isOnline: sessions.has(key) } });
    return true;
  } catch {
    // Presence is never worth failing a request over.
    return false;
  }
};

// Bulk read of who is online right now.
const onlineIds = () => new Set([...sessions.keys()]);

const sessionCount = () => sessions.size;

module.exports = {
  markOnline,
  markOffline,
  isOnline,
  presenceMap,
  touchLastSeen,
  onlineIds,
  sessionCount
};
