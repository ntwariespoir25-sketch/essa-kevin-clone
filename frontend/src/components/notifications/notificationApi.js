const API_URL = import.meta.env.VITE_API_URL;

const getToken = () => localStorage.getItem('portalToken');
const json = (opts = {}) => ({
  ...opts,
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...(opts.headers || {}) }
});

async function parseBody(res) {
  try { return await res.json(); } catch { return null; }
}

async function http(path, opts = {}) {
  const res = await fetch(`${API_URL}/api${path}`, opts);
  const data = await parseBody(res);
  if (!res.ok) {
    const err = new Error(data?.message || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data || {};
}

export const notificationApi = {
  list: (params = '') => http(`/notifications${params}`),
  unreadCount: () => http('/notifications/unread-count'),
  markRead: (id) => http(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: (type) => http('/notifications/read-all', { method: 'POST', ...json(), body: JSON.stringify(type ? { type } : {}) }),
  remove: (id) => http(`/notifications/${id}`, { method: 'DELETE' }),
  clearAll: () => http('/notifications', { method: 'DELETE', ...json(), body: JSON.stringify({ unreadOnly: true }) }),
  getPreferences: () => http('/notifications/preferences'),
  savePreferences: (payload) => http('/notifications/preferences', { method: 'PUT', ...json(), body: JSON.stringify(payload) }),
  sendTest: () => http('/notifications/test', { method: 'POST', ...json(), body: JSON.stringify({}) })
};