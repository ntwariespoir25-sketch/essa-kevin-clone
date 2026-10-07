export const timeAgo = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  const now = new Date();
  const diffMs = now - date;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};

export const clockTime = (dateValue) => {
  if (!dateValue) return '';
  return new Date(dateValue).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const dayLabel = (dateValue) => {
  const date = new Date(dateValue);
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

export const roleIcon = (role) => {
  switch (role) {
    case 'teacher': return 'fa-chalkboard-user';
    case 'student': return 'fa-user-graduate';
    case 'parent': return 'fa-house-user';
    case 'super_admin': return 'fa-user-tie';
    case 'academic_admin': return 'fa-file-signature';
    case 'accounts_admin': return 'fa-coins';
    case 'discipline_admin': return 'fa-shield-halved';
    default: return 'fa-user';
  }
};

export const roleLabel = (role) => {
  const map = {
    super_admin: 'Head Master',
    academic_admin: 'Academic Admin',
    accounts_admin: 'Accounts',
    discipline_admin: 'Discipline',
    teacher: 'Teacher',
    student: 'Student',
    parent: 'Parent'
  };
  return map[role] || 'Member';
};

export const extentColor = (kind) => {
  switch (kind) {
    case 'image': return '#2563eb';
    case 'pdf': return '#b91c1c';
    case 'doc': return '#0e7490';
    case 'sheet': return '#15803d';
    case 'audio': return '#b45309';
    case 'video': return '#7c3aed';
    case 'archive': return '#5f6b76';
    default: return '#5f6b76';
  }
};

export const statusIcon = (status) => {
  switch (status) {
    case 'read': return <i className="fas fa-check-double" />;
    case 'delivered': return <i className="fas fa-check-double" />;
    default: return <i className="fas fa-check" />;
  }
};

export const fileIcon = (kind, mime) => {
  const m = (mime || '').toLowerCase();
  if (kind === 'image' || m.startsWith('image/')) return 'fa-image';
  if (m === 'application/pdf') return 'fa-file-pdf';
  if (m.includes('word') || kind === 'doc') return 'fa-file-word';
  if (m.includes('sheet') || m.includes('excel') || kind === 'sheet') return 'fa-file-excel';
  if (m.startsWith('audio/')) return 'fa-file-audio';
  if (m.startsWith('video/')) return 'fa-file-video';
  if (m.includes('zip') || m.includes('compressed')) return 'fa-file-zipper';
  return 'fa-file';
};