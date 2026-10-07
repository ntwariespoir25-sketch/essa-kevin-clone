const PresenceDot = ({ online, lastSeenAt, size = 'sm' }) => (
  <span
    className={`ck-presence ${online ? 'online' : ''}`}
    title={online ? 'Online' : lastSeenAt ? `Last seen ${new Date(lastSeenAt).toLocaleString()}` : 'Offline'}
    style={size === 'lg' ? { width: 12, height: 12 } : undefined}
  />
);

export default PresenceDot;

export const PresenceText = ({ online, lastSeenAt }) => {
  if (online) return <span style={{ color: 'var(--success, #15803d)' }}>Online</span>;
  if (lastSeenAt) return <span>Last seen {new Date(lastSeenAt).toLocaleString()}</span>;
  return <span>Offline</span>;
};