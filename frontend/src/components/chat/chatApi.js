const API_URL = import.meta.env.VITE_API_URL;

export const getToken = () => localStorage.getItem('portalToken');
export const getCurrentUserId = () => localStorage.getItem('userId');
export const getCurrentRole = () => localStorage.getItem('userRole');

const auth = (opts = {}) => ({
  ...opts,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
    ...(opts.headers || {})
  }
});

async function parseBody(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
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

export const chatApi = {
  conversations: (params = '') => http(`/messages/conversations${params}`),
  thread: (id, params = '') => http(`/messages/thread/${id}${params}`),
  send: (payload) => http('/messages/send', { method: 'POST', ...auth(), body: JSON.stringify(payload) }),
  createConversation: (payload) => http('/messages/conversations', { method: 'POST', ...auth(), body: JSON.stringify(payload) }),
  markRead: (conversationId) => http(`/messages/conversations/${conversationId}/read`, { method: 'PUT' }),
  edit: (messageId, content) => http(`/messages/${messageId}`, { method: 'PUT', ...auth(), body: JSON.stringify({ content }) }),
  remove: (messageId, scope = 'me') => http(`/messages/${messageId}?scope=${scope}`, { method: 'DELETE' }),
  react: (messageId, emoji) => http(`/messages/${messageId}/react`, { method: 'POST', ...auth(), body: JSON.stringify({ emoji }) }),
  pin: (messageId, value) => http(`/messages/${messageId}/pin`, { method: 'PUT', ...auth(), body: JSON.stringify({ value }) }),
  star: (messageId) => http(`/messages/${messageId}/star`, { method: 'POST' }),
  forward: (messageId, conversationIds) => http(`/messages/${messageId}/forward`, { method: 'POST', ...auth(), body: JSON.stringify({ conversationIds }) }),
  report: (messageId, reason) => http(`/messages/${messageId}/report`, { method: 'POST', ...auth(), body: JSON.stringify({ reason }) }),
  archive: (conversationId, archived) => http(`/messages/conversations/${conversationId}/archive`, { method: 'PUT', ...auth(), body: JSON.stringify({ archived }) }),
  pinConversation: (conversationId, pinned) => http(`/messages/conversations/${conversationId}/pin`, { method: 'PUT', ...auth(), body: JSON.stringify({ pinned }) }),
  muteConversation: (conversationId, minutes) => http(`/messages/conversations/${conversationId}/mute`, { method: 'PUT', ...auth(), body: JSON.stringify({ minutes }) }),
  directory: () => http('/messages/users'),
  search: (params = '') => http(`/messages/search${params}`),
  starred: () => http('/messages/starred'),
  uploadConfig: () => http('/files/config'),

  upload: async (files) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    const res = await fetch(`${API_URL}/api/files/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: fd
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || 'Upload failed');
    return data;
  }
};

export const isValidId = (value) =>
  typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value);