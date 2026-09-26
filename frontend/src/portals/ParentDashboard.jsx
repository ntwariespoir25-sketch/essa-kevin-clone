import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import io from 'socket.io-client';
import ChatModal from '../components/ChatModal';

const API_URL = import.meta.env.VITE_API_URL;
const SOCKET_URL = API_URL;
const getToken = () => localStorage.getItem('portalToken');
const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` });

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-RW', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-RW', { hour: '2-digit', minute: '2-digit' }) : '';

const roleBadge = (role) => {
  const map = {
    super_admin: { label: 'Super Admin', color: '#ffc107', bg: '#fff8e1' },
    academic_admin: { label: 'Academic Admin', color: '#27ae60', bg: '#e8f5e9' },
    discipline_admin: { label: 'Discipline Admin', color: '#e74c3c', bg: '#fdecea' },
    accounts_admin: { label: 'Accounts Admin', color: '#3498db', bg: '#e3f2fd' },
    teacher: { label: 'Teacher', color: '#9b59b6', bg: '#f3e5f5' },
    student: { label: 'Student', color: '#1abc9c', bg: '#e0f7fa' },
    parent: { label: 'Parent', color: '#e67e22', bg: '#fff3e0' },
  };
  return map[role] || { label: role || '—', color: '#666', bg: '#f0f0f0' };
};

// ─── shared UI atoms ────────────────────────────────────────────────────────
const Badge = ({ text, color, bg, size = 11 }) => (
  <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: size, fontWeight: 700, color, background: bg, whiteSpace: 'nowrap' }}>
    {typeof text === 'string' ? text.replace(/_/g, ' ').toUpperCase() : text}
  </span>
);

const Avatar = ({ name = '?', size = 36, bg = '#1a3a5c', color = '#ffc107', img }) => {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return img
    ? <img src={img} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
    : <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.38, flexShrink: 0, letterSpacing: 1 }}>{initials}</div>;
};

const Modal = ({ open, onClose, title, children, width = 520 }) => {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: width, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'white', zIndex: 1, borderRadius: '16px 16px 0 0' }}>
          <h3 style={{ margin: 0, fontSize: 16, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#999', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '20px 22px' }}>{children}</div>
      </div>
    </div>
  );
};

const Field = ({ label, children, required }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 5, letterSpacing: 0.5 }}>
      {label?.toUpperCase()}{required && <span style={{ color: '#e74c3c' }}> *</span>}
    </label>
    {children}
  </div>
);

const inputStyle = { width: '100%', padding: '9px 12px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', transition: 'border-color .2s' };
const Inp = (props) => <input {...props} style={{ ...inputStyle, ...props.style }}
  onFocus={e => e.target.style.borderColor = '#1a3a5c'} onBlur={e => e.target.style.borderColor = '#e0e0e0'} />;
const Sel = ({ children, ...props }) => <select {...props} style={{ ...inputStyle, background: 'white', ...props.style }}>{children}</select>;
const Txt = (props) => <textarea {...props} style={{ ...inputStyle, resize: 'vertical', minHeight: 80, ...props.style }}
  onFocus={e => e.target.style.borderColor = '#1a3a5c'} onBlur={e => e.target.style.borderColor = '#e0e0e0'} />;

const Btn = ({ children, onClick, icon, color = '#1a3a5c', textColor = 'white', small, danger, disabled, style: s }) => {
  const bg = danger ? '#e74c3c' : disabled ? '#ccc' : color;
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: bg, color: textColor, border: 'none', borderRadius: 8, padding: small ? '6px 13px' : '9px 18px', fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'filter .2s, transform .2s', whiteSpace: 'nowrap', ...s }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)'; } }}
      onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; }}>
      {icon && <i className={icon} style={{ fontSize: 13 }} />}{children}
    </button>
  );
};

const StatCard = ({ icon, label, value, sub, accent = '#27ae60', bg = '#e8f5e9', onClick }) => (
  <div onClick={onClick} style={{ background: 'white', borderRadius: 16, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 12px rgba(0,0,0,.06)', cursor: onClick ? 'pointer' : 'default', transition: 'transform .2s, box-shadow .2s', border: '1px solid #f0f0f0' }}
    onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(0,0,0,.12)'; } }}
    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,.06)'; }}>
    <div style={{ width: 50, height: 50, borderRadius: 14, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <i className={icon} style={{ fontSize: 20, color: accent }} />
    </div>
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#1a3a5c', lineHeight: 1, fontFamily: 'Georgia, serif' }}>{value ?? '—'}</div>
      <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: accent, marginTop: 3, fontWeight: 600 }}>{sub}</div>}
    </div>
  </div>
);

const Table = ({ cols, rows, emptyMsg = 'No data found' }) => (
  <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #f0f0f0' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
      <thead>
        <tr style={{ background: '#f7f9fb' }}>
          {cols.map((c, i) => <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: .8, borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>{c.toUpperCase()}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0
          ? <tr><td colSpan={cols.length} style={{ textAlign: 'center', padding: 36, color: '#bbb', fontSize: 13 }}>{emptyMsg}</td></tr>
          : rows.map((row, i) => <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }} onMouseEnter={e => e.currentTarget.style.background = '#fafbff'} onMouseLeave={e => e.currentTarget.style.background = ''}>{row}</tr>)}
      </tbody>
    </table>
  </div>
);
const TD = ({ children, style }) => <td style={{ padding: '10px 14px', fontSize: 13, color: '#333', ...style }}>{children}</td>;

// ═══════════════════════════════════════════════════════════════════
const ParentDashboard = () => {
  const navigate = useNavigate();
  const msgEndRef = useRef(null);

  // layout
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // child
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [showChildSelector, setShowChildSelector] = useState(false);

  // data
  const [dashboardData, setDashboardData] = useState(null);
  const [grades, setGrades] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [feeStatus, setFeeStatus] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [events, setEvents] = useState([]);
  const [disciplineRecords, setDisciplineRecords] = useState([]);
  const [documents, setDocuments] = useState([]);

  // chat
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [selectedChatUser, setSelectedChatUser] = useState(null);
  const [unread, setUnread] = useState(0);
  const [socket, setSocket] = useState(null);

  const userName = localStorage.getItem('userName') || 'Parent';
  const userId = localStorage.getItem('userId');

  // ─── API helper ──────────────────────────────────────────────────────────
  const api = async (endpoint, options = {}) => {
    const res = await fetch(`${API_URL}/api${endpoint}`, { headers: { ...authHeaders(), ...options.headers }, ...options });
    let data;
    try { data = await res.json(); } catch { data = { message: `HTTP ${res.status}` }; }
    if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
    return data;
  };

  // ─── responsive ─────────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => { setIsMobile(window.innerWidth <= 1024); if (window.innerWidth > 1024) setMobileOpen(false); };
    check(); window.addEventListener('resize', check); return () => window.removeEventListener('resize', check);
  }, []);

  // ─── socket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = getToken(); if (!token) return;
    const sock = io(SOCKET_URL, { auth: { token } });
    setSocket(sock);
    if (userId) sock.emit('join', userId);
    sock.on('new_message', () => fetchUnread());
    sock.on('newMessage', () => fetchUnread());
    return () => sock.disconnect();
  }, [userId]);

  // ─── auth + initial load ────────────────────────────────────────────────
  useEffect(() => {
    const token = getToken(); const role = localStorage.getItem('userRole');
    if (!token || role !== 'parent') { navigate('/portal/login'); return; }
    fetchChildren();
    fetchUnread();
  }, [navigate]);

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, []);

  // ─── fetchers ───────────────────────────────────────────────────────────
  const fetchChildren = async () => {
    try {
      const data = await api('/parent/children');
      const list = Array.isArray(data) ? data : (Array.isArray(data?.children) ? data.children : []);
      setChildren(list);
      if (list.length > 0) {
        setSelectedChild(list[0]);
        fetchChildData(list[0]._id);
      } else {
        setLoading(false);
      }
    } catch (e) {
      console.error('Error fetching children:', e);
      setChildren([]);
      setLoading(false);
    }
  };

  const fetchChildData = async (childId) => {
    if (!childId) { setLoading(false); return; }
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        api(`/parent/children/${childId}/dashboard`),
        api(`/parent/children/${childId}/grades`),
        api(`/parent/children/${childId}/attendance`),
        api(`/parent/children/${childId}/fees`),
        api(`/parent/children/${childId}/assignments`),
        api(`/parent/children/${childId}/announcements`),
        api(`/parent/children/${childId}/events`),
        api(`/parent/children/${childId}/discipline`),
        api(`/parent/children/${childId}/documents`),
      ]);
      const val = (r, fb) => (r.status === 'fulfilled' ? r.value : fb);
      const [d, g, a, f, hw, an, ev, dc, docs] = results;

      setDashboardData(val(d, null));
      setGrades(Array.isArray(val(g, [])) ? val(g, []) : []);
      setAttendance(Array.isArray(val(a, [])) ? val(a, []) : []);
      setFeeStatus(val(f, null));
      setAssignments(Array.isArray(val(hw, [])) ? val(hw, []) : []);
      setAnnouncements(Array.isArray(val(an, [])) ? val(an, []) : []);
      setEvents(Array.isArray(val(ev, [])) ? val(ev, []) : []);
      setDisciplineRecords(Array.isArray(val(dc, [])) ? val(dc, []) : []);
      setDocuments(Array.isArray(val(docs, [])) ? val(docs, []) : []);
    } catch (e) {
      console.error('Error fetching child data:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnread = async () => {
    try {
      const data = await api('/messages/unread-count');
      setUnread(data?.count || data?.unread || 0);
    } catch { setUnread(0); }
  };

  const handleChildChange = (child) => {
    setSelectedChild(child);
    fetchChildData(child._id);
    setShowChildSelector(false);
  };

  const handleOpenChat = (user = null) => {
    if (user) setSelectedChatUser(user);
    setIsChatModalOpen(true);
  };

  const handleCloseChat = () => {
    setIsChatModalOpen(false);
    setSelectedChatUser(null);
    fetchUnread();
  };

  const handleDownloadDocument = (doc) => {
    if (doc?.url) window.open(doc.url, '_blank');
    else Swal.fire('Download', `Downloading ${doc?.name || 'document'}`, 'info');
  };

  const handlePayOnline = () => {
    Swal.fire({
      title: 'Pay Online',
      html: `
        <div style="text-align: left;">
          <p>Amount Due: <strong>${feeStatus?.balance?.toLocaleString() || 0} RWF</strong></p>
          <p>Select Payment Method:</p>
          <select id="paymentMethod" class="swal2-select">
            <option value="mobile">Mobile Money</option>
            <option value="card">Credit/Debit Card</option>
            <option value="bank">Bank Transfer</option>
          </select>
          <input type="text" id="amount" class="swal2-input" placeholder="Amount to Pay" value="${feeStatus?.balance || 0}">
        </div>
      `,
      confirmButtonText: 'Pay Now',
      confirmButtonColor: '#27ae60',
      showCancelButton: true,
      preConfirm: () => ({
        amount: document.getElementById('amount').value,
        method: document.getElementById('paymentMethod').value
      })
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.fire('Payment Initiated', `You will be redirected to complete payment of ${parseInt(result.value.amount || 0).toLocaleString()} RWF via ${result.value.method}`, 'success');
      }
    });
  };

  const handleRequestPermission = async () => {
    if (!selectedChild) return;
    const { value: formValues } = await Swal.fire({
      title: `Request Permission for ${childName}`,
      html: `
        <div class="admin-form">
          <div class="form-group"><input type="text" id="type" class="swal2-input" placeholder="Permission Type (e.g., Leave, Event)" required></div>
          <div class="form-group"><textarea id="reason" class="swal2-textarea" placeholder="Reason" rows="3" required></textarea></div>
          <div class="form-group"><input type="date" id="fromDate" class="swal2-input" required></div>
          <div class="form-group"><input type="date" id="toDate" class="swal2-input" required></div>
        </div>
      `,
      confirmButtonText: 'Submit Request',
      confirmButtonColor: '#3498db',
      showCancelButton: true,
      preConfirm: () => {
        const type = document.getElementById('type').value;
        const reason = document.getElementById('reason').value;
        if (!type || !reason) { Swal.showValidationMessage('Please fill required fields'); return false; }
        return {
          type, reason,
          fromDate: document.getElementById('fromDate').value,
          toDate: document.getElementById('toDate').value,
          childId: selectedChild._id
        };
      }
    });

    if (formValues) {
      try {
        await api('/permissions', { method: 'POST', body: JSON.stringify({ ...formValues, requesterRole: 'parent' }) });
        Swal.fire('Request Sent!', 'Your permission request has been submitted', 'success');
      } catch {
        Swal.fire('Error', 'Failed to submit request', 'error');
      }
    }
  };

  const menuItems = [
    { id: 'overview', label: 'Dashboard', icon: 'fas fa-chart-line' },
    { id: 'academic', label: 'Academic Performance', icon: 'fas fa-graduation-cap' },
    { id: 'attendance', label: 'Attendance', icon: 'fas fa-calendar-check' },
    { id: 'fees', label: 'Fee & Payments', icon: 'fas fa-money-bill-wave' },
    { id: 'homework', label: 'Homework', icon: 'fas fa-tasks' },
    { id: 'events', label: 'Events', icon: 'fas fa-calendar-alt' },
    { id: 'discipline', label: 'Behavior', icon: 'fas fa-gavel' },
    { id: 'documents', label: 'Documents', icon: 'fas fa-folder-open' },
    { id: 'messages', label: 'Messages', icon: 'fas fa-comments', badge: unread },
    { id: 'settings', label: 'Settings', icon: 'fas fa-cog' },
  ];

  // ─── safe derived values ────────────────────────────────────────────────
  const attendanceList = Array.isArray(attendance) ? attendance : [];
  const gradesList = Array.isArray(grades) ? grades : [];
  const assignmentsList = Array.isArray(assignments) ? assignments : [];
  const announcementsList = Array.isArray(announcements) ? announcements : [];
  const eventsList = Array.isArray(events) ? events : [];
  const disciplineList = Array.isArray(disciplineRecords) ? disciplineRecords : [];
  const documentsList = Array.isArray(documents) ? documents : [];

  const attendanceRate = attendanceList.length > 0
    ? Math.round((attendanceList.filter(a => a.status === 'present').length / attendanceList.length) * 100)
    : 0;
  const avgGrade = gradesList.length > 0
    ? Math.round(gradesList.reduce((s, g) => s + (g.score || 0), 0) / gradesList.length)
    : 0;
  const pendingHW = assignmentsList.filter(a => a.status === 'pending').length;
  const childName = selectedChild?.name || selectedChild?.fullName || 'Child';
  const sideW = isMobile ? 0 : sidebarOpen ? 260 : 72;

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'linear-gradient(135deg,#0d2b42,#1a3a5c)', color: 'white', gap: 20 }}>
      <div style={{ width: 44, height: 44, border: '3px solid rgba(255,255,255,.15)', borderTopColor: '#ffc107', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <p style={{ margin: 0, fontSize: 16 }}>Loading Dashboard…</p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f0f3f8', fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .tab-anim{animation:fadeIn .22s ease}
        ::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-thumb{background:#ccc;border-radius:10px}
        @media(max-width:768px){.hide-mobile{display:none!important}.stats-g{grid-template-columns:1fr 1fr!important}}
      `}</style>

      {isMobile && mobileOpen && <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 998 }} />}

      {/* ─── SIDEBAR ─── */}
      <aside style={{ position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 999, width: isMobile ? (mobileOpen ? 260 : 0) : sideW, background: 'linear-gradient(180deg,#0d1f33 0%,#1a3a5c 100%)', color: 'white', display: 'flex', flexDirection: 'column', transition: 'width .3s ease', overflow: 'hidden', boxShadow: '3px 0 20px rgba(0,0,0,.18)' }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', gap: 11, flexShrink: 0 }}>
          <div style={{ width: 38, height: 38, background: '#ffc107', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="fas fa-users" style={{ fontSize: 16, color: '#1a3a5c' }} />
          </div>
          {(sidebarOpen || isMobile) && <div><div style={{ fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 600 }}>ESSA Portal</div><div style={{ fontSize: 10, opacity: .6, letterSpacing: 1 }}>PARENT</div></div>}
          {!isMobile && <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}><i className={`fas fa-chevron-${sidebarOpen ? 'left' : 'right'}`} /></button>}
        </div>

        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Avatar name={userName} size={36} bg='rgba(255,193,7,.2)' color='#ffc107' />
          {(sidebarOpen || isMobile) && <div><div style={{ fontSize: 13, fontWeight: 600 }}>{userName}</div><div style={{ fontSize: 10, color: '#ffc107' }}>Parent</div></div>}
        </div>

        {/* Child selector */}
        <div style={{ padding: '12px 12px', borderBottom: '1px solid rgba(255,255,255,.08)', position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setShowChildSelector(!showChildSelector)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,.08)', border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer', fontSize: 12 }}>
            <i className="fas fa-child" style={{ fontSize: 13 }} />
            {(sidebarOpen || isMobile) && <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{childName}</span>}
            {(sidebarOpen || isMobile) && <i className="fas fa-chevron-down" style={{ fontSize: 10, opacity: .6 }} />}
          </button>
          {showChildSelector && (
            <div style={{ position: 'absolute', top: '100%', left: 12, right: 12, background: 'white', borderRadius: 10, color: '#333', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,.25)', overflow: 'hidden' }}>
              {children.length === 0 && (
                <div style={{ padding: 12, fontSize: 12, color: '#888', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fas fa-info-circle" /> No children linked
                </div>
              )}
              {children.map(child => (
                <div key={child._id} onClick={() => handleChildChange(child)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', background: selectedChild?._id === child._id ? '#e8f0fe' : 'white' }}>
                  <Avatar name={child.name || child.fullName} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{child.name || child.fullName}</div>
                    <div style={{ fontSize: 10, color: '#888' }}>{child.className || ''} {child.section ? `· ${child.section}` : ''}</div>
                  </div>
                  {selectedChild?._id === child._id && <i className="fas fa-check-circle" style={{ color: '#27ae60', fontSize: 13 }} />}
                </div>
              ))}
            </div>
          )}
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {menuItems.map(item => {
            const active = activeTab === item.id;
            return (
              <button key={item.id} onClick={() => { setActiveTab(item.id); if (isMobile) setMobileOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '10px 16px', background: active ? 'rgba(255,193,7,.15)' : 'transparent', border: 'none', borderRight: active ? '3px solid #ffc107' : '3px solid transparent', color: active ? '#ffc107' : 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400, transition: 'all .2s', textAlign: 'left' }}>
                <i className={item.icon} style={{ fontSize: 15, width: 18, flexShrink: 0 }} />
                {(sidebarOpen || isMobile) && <span style={{ flex: 1 }}>{item.label}</span>}
                {item.badge > 0 && (sidebarOpen || isMobile) && <span style={{ background: '#e74c3c', color: 'white', borderRadius: 20, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>{item.badge}</span>}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,.08)', flexShrink: 0 }}>
          <button onClick={() => { localStorage.clear(); navigate('/portal/login'); }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', background: 'rgba(231,76,60,.2)', border: '1px solid rgba(231,76,60,.3)', borderRadius: 9, color: '#ff8a80', cursor: 'pointer', fontSize: 13 }}>
            <i className="fas fa-sign-out-alt" style={{ fontSize: 13 }} />{(sidebarOpen || isMobile) && 'Logout'}
          </button>
        </div>
      </aside>

      {/* ─── MAIN ─── */}
      <main style={{ flex: 1, marginLeft: isMobile ? 0 : sideW, transition: 'margin-left .3s', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Top bar */}
        <div style={{ background: 'white', padding: '11px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 8px rgba(0,0,0,.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isMobile && <button onClick={() => setMobileOpen(!mobileOpen)} style={{ background: '#1a3a5c', color: 'white', border: 'none', padding: '7px 10px', borderRadius: 8, cursor: 'pointer' }}><i className="fas fa-bars" /></button>}
            <div>
              <div style={{ fontSize: 10, color: '#aaa', letterSpacing: .5 }}>ESSA NYARUGUNGA</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>{menuItems.find(m => m.id === activeTab)?.label || 'Dashboard'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {unread > 0 && <button onClick={() => setActiveTab('messages')} style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 17 }}>
              <i className="fas fa-bell" />
              <span style={{ position: 'absolute', top: -4, right: -4, background: '#e74c3c', color: 'white', borderRadius: '50%', fontSize: 9, width: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{unread}</span>
            </button>}
            <Avatar name={userName} size={32} />
            <div className="hide-mobile">
              <div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{userName}</div>
              <div style={{ fontSize: 10, color: '#ffc107' }}>PARENT</div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: 20, overflowY: 'auto' }} className="tab-anim">

          {/* ══ OVERVIEW ══ */}
          {activeTab === 'overview' && (
            <div>
              <div style={{ background: 'linear-gradient(135deg,#0d1f33,#1a3a5c)', borderRadius: 18, padding: '24px 28px', marginBottom: 22, color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, boxShadow: '0 6px 24px rgba(26,58,92,.35)' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 600, fontFamily: 'Georgia, serif', marginBottom: 5 }}>Welcome, {userName.split(' ')[0]}! 👪</div>
                  <div style={{ fontSize: 12, opacity: .75 }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Btn onClick={handleRequestPermission} icon="fas fa-file-alt" color="#ffc107" textColor="#1a3a5c">Request Permission</Btn>
                  <Btn onClick={() => setActiveTab('fees')} icon="fas fa-credit-card" color="rgba(255,255,255,.15)" textColor="white">Pay Fees</Btn>
                </div>
              </div>

              {selectedChild && (
                <div style={{ background: 'white', borderRadius: 16, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 12px rgba(0,0,0,.06)', border: '1px solid #f0f0f0', flexWrap: 'wrap' }}>
                  <Avatar name={childName} size={52} bg="#1a3a5c" color="#ffc107" />
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>{childName}</div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                      Class: <strong>{selectedChild.className || '—'}</strong>
                      {' · '}Section: <strong>{selectedChild.section || '—'}</strong>
                      {' · '}Roll No: <strong>{selectedChild.rollNo || '—'}</strong>
                    </div>
                  </div>
                  <Badge text="Active" color="#27ae60" bg="#e8f5e9" />
                </div>
              )}

              <div className="stats-g" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14, marginBottom: 20 }}>
                <StatCard icon="fas fa-chart-line" label="Average Grade" value={`${avgGrade}%`} sub={avgGrade >= 80 ? 'Excellent' : avgGrade >= 70 ? 'Good' : 'Average'} accent="#3498db" bg="#e3f2fd" onClick={() => setActiveTab('academic')} />
                <StatCard icon="fas fa-calendar-check" label="Attendance Rate" value={`${attendanceRate}%`} sub={attendanceRate >= 90 ? 'Excellent' : attendanceRate >= 75 ? 'Good' : 'Needs Improvement'} accent="#27ae60" bg="#e8f5e9" onClick={() => setActiveTab('attendance')} />
                <StatCard icon="fas fa-tasks" label="Pending Homework" value={pendingHW} sub="Assignments due" accent="#f39c12" bg="#fff3e0" onClick={() => setActiveTab('homework')} />
                <StatCard icon="fas fa-money-bill-wave" label="Balance Due" value={`${(feeStatus?.balance || 0).toLocaleString()} RWF`} sub="School fees" accent="#e74c3c" bg="#fdecea" onClick={() => setActiveTab('fees')} />
              </div>

              {/* quick actions */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
                <Btn onClick={() => setActiveTab('academic')} icon="fas fa-chart-line" color="#3498db">View Grades</Btn>
                <Btn onClick={() => setActiveTab('attendance')} icon="fas fa-calendar-check" color="#f39c12">Attendance</Btn>
                <Btn onClick={() => setActiveTab('fees')} icon="fas fa-credit-card" color="#27ae60">Pay Fees</Btn>
                <Btn onClick={() => setActiveTab('homework')} icon="fas fa-tasks" color="#1abc9c">Homework</Btn>
                <Btn onClick={() => handleOpenChat({ name: 'Teacher', role: 'teacher', id: 'teacher' })} icon="fas fa-comment" color="#9b59b6">Contact Teacher</Btn>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 18 }}>
                <div style={{ background: 'white', borderRadius: 14, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: 14, color: '#1a3a5c', fontWeight: 600 }}><i className="fas fa-bullhorn" style={{ marginRight: 7, color: '#f39c12' }} />Recent Announcements</h3>
                  {announcementsList.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#bbb', fontSize: 13, padding: 20 }}>No announcements yet</p>
                  ) : announcementsList.slice(0, 3).map(ann => {
                    const pc = ann.priority === 'urgent' ? '#e74c3c' : ann.priority === 'high' ? '#f39c12' : '#27ae60';
                    return (
                      <div key={ann._id} style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 8, background: '#f8f9fa', borderLeft: `3px solid ${pc}` }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a3a5c' }}>{ann.title}</div>
                        <div style={{ fontSize: 11, color: '#666', marginTop: 3, lineHeight: 1.5 }}>{ann.content}</div>
                        <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>{fmt(ann.createdAt)}</div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ background: 'white', borderRadius: 14, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                  <h3 style={{ margin: '0 0 14px', fontSize: 14, color: '#1a3a5c', fontWeight: 600 }}><i className="fas fa-calendar-alt" style={{ marginRight: 7, color: '#3498db' }} />Upcoming Events</h3>
                  {eventsList.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#bbb', fontSize: 13, padding: 20 }}>No upcoming events</p>
                  ) : eventsList.slice(0, 3).map(event => (
                    <div key={event._id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
                      <div style={{ textAlign: 'center', background: '#1a3a5c', color: 'white', padding: '8px 10px', borderRadius: 8, minWidth: 50, flexShrink: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{new Date(event.date).getDate()}</div>
                        <div style={{ fontSize: 9, opacity: .8, letterSpacing: .5 }}>{new Date(event.date).toLocaleString('default', { month: 'short' }).toUpperCase()}</div>
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{event.title}</div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══ ACADEMIC ══ */}
          {activeTab === 'academic' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
                <div><h2 style={{ margin: 0, fontSize: 19, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>Academic Performance</h2><p style={{ margin: '3px 0 0', fontSize: 12, color: '#888' }}>{childName} · {gradesList.length} records</p></div>
                <Badge text={`Average ${avgGrade}%`} color="#27ae60" bg="#e8f5e9" size={12} />
              </div>
              <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                <Table cols={['Subject', 'Assignment/Exam', 'Score', 'Grade', 'Term', 'Teacher Comment']} emptyMsg="No grades available"
                  rows={gradesList.map(grade => (
                    <React.Fragment key={grade._id}>
                      <TD><strong style={{ fontSize: 13 }}>{grade.subject}</strong></TD>
                      <TD style={{ fontSize: 12 }}>{grade.assignmentTitle || '—'}</TD>
                      <TD><span style={{ fontWeight: 700, color: grade.score >= 80 ? '#27ae60' : grade.score >= 60 ? '#f39c12' : '#e74c3c' }}>{grade.score}%</span></TD>
                      <TD><Badge text={grade.grade || '—'} color="#1a3a5c" bg="#e8f0fb" /></TD>
                      <TD style={{ fontSize: 12 }}>{grade.term}</TD>
                      <TD style={{ fontSize: 12, color: '#666' }}>{grade.feedback || '—'}</TD>
                    </React.Fragment>
                  ))}
                />
              </div>
            </div>
          )}

          {/* ══ ATTENDANCE ══ */}
          {activeTab === 'attendance' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
                <div><h2 style={{ margin: 0, fontSize: 19, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>Attendance Records</h2><p style={{ margin: '3px 0 0', fontSize: 12, color: '#888' }}>{childName} · {attendanceList.length} days</p></div>
                <Badge text={`${attendanceRate}% Overall`} color="#27ae60" bg="#e8f5e9" size={12} />
              </div>
              <div className="stats-g" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, marginBottom: 18 }}>
                <StatCard icon="fas fa-check-circle" label="Present" value={attendanceList.filter(a => a.status === 'present').length} accent="#27ae60" bg="#e8f5e9" />
                <StatCard icon="fas fa-times-circle" label="Absent" value={attendanceList.filter(a => a.status === 'absent').length} accent="#e74c3c" bg="#fdecea" />
                <StatCard icon="fas fa-clock" label="Late" value={attendanceList.filter(a => a.status === 'late').length} accent="#f39c12" bg="#fff3e0" />
                <StatCard icon="fas fa-calendar" label="Total Days" value={attendanceList.length} accent="#3498db" bg="#e3f2fd" />
              </div>
              <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                <Table cols={['Date', 'Status', 'Arrival Time', 'Remarks']} emptyMsg="No attendance records"
                  rows={attendanceList.map(record => (
                    <React.Fragment key={record._id}>
                      <TD style={{ fontSize: 12 }}>{fmt(record.date)}</TD>
                      <TD><Badge text={record.status} color={record.status === 'present' ? '#27ae60' : record.status === 'absent' ? '#e74c3c' : '#f39c12'} bg={record.status === 'present' ? '#e8f5e9' : record.status === 'absent' ? '#fdecea' : '#fff3e0'} /></TD>
                      <TD style={{ fontSize: 12 }}>{record.arrivalTime || '—'}</TD>
                      <TD style={{ fontSize: 12, color: '#666' }}>{record.remarks || '—'}</TD>
                    </React.Fragment>
                  ))}
                />
              </div>
            </div>
          )}

          {/* ══ FEES ══ */}
          {activeTab === 'fees' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
                <div><h2 style={{ margin: 0, fontSize: 19, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>Fee & Payments</h2><p style={{ margin: '3px 0 0', fontSize: 12, color: '#888' }}>{childName}</p></div>
                <Btn onClick={handlePayOnline} icon="fas fa-credit-card" color="#27ae60">Pay Online</Btn>
              </div>
              <div className="stats-g" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 18 }}>
                <StatCard icon="fas fa-money-bill" label="Total Fees" value={`${(feeStatus?.total || 0).toLocaleString()} RWF`} accent="#1a3a5c" bg="#e8f0fb" />
                <StatCard icon="fas fa-check-circle" label="Amount Paid" value={`${(feeStatus?.paid || 0).toLocaleString()} RWF`} accent="#27ae60" bg="#e8f5e9" />
                <StatCard icon="fas fa-exclamation-circle" label="Balance Due" value={`${(feeStatus?.balance || 0).toLocaleString()} RWF`} accent="#e74c3c" bg="#fdecea" />
              </div>
              <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                <Table cols={['Date', 'Description', 'Amount', 'Status', 'Receipt']} emptyMsg="No payments recorded"
                  rows={(feeStatus?.payments || []).map(p => (
                    <React.Fragment key={p._id}>
                      <TD style={{ fontSize: 12 }}>{fmt(p.date)}</TD>
                      <TD style={{ fontSize: 12 }}>{p.description}</TD>
                      <TD><span style={{ fontWeight: 700, color: '#27ae60' }}>{(p.amount || 0).toLocaleString()} RWF</span></TD>
                      <TD><Badge text="Paid" color="#27ae60" bg="#e8f5e9" /></TD>
                      <TD>
                        <Btn small icon="fas fa-download" color="#3498db" onClick={() => handleDownloadDocument({ name: `Receipt_${p.receiptNo}`, url: p.receiptUrl })}>Receipt</Btn>
                      </TD>
                    </React.Fragment>
                  ))}
                />
              </div>
            </div>
          )}

          {/* ══ HOMEWORK ══ */}
          {activeTab === 'homework' && (
            <div>
              <div style={{ marginBottom: 18 }}><h2 style={{ margin: 0, fontSize: 19, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>Homework & Assignments</h2><p style={{ margin: '3px 0 0', fontSize: 12, color: '#888' }}>{childName} · {assignmentsList.length} assignments</p></div>
              {assignmentsList.length === 0 ? (
                <div style={{ background: 'white', borderRadius: 14, padding: 50, textAlign: 'center', color: '#bbb', boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                  <i className="fas fa-tasks" style={{ fontSize: 36, display: 'block', marginBottom: 10, opacity: .3 }} />No assignments yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {assignmentsList.map(ass => (
                    <div key={ass._id} style={{ background: 'white', borderRadius: 14, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,.05)', borderLeft: `4px solid ${ass.status === 'pending' ? '#f39c12' : '#27ae60'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                        <h3 style={{ margin: 0, fontSize: 15, color: '#1a3a5c' }}>{ass.title}</h3>
                        <Badge text={ass.status} color={ass.status === 'pending' ? '#f39c12' : '#27ae60'} bg={ass.status === 'pending' ? '#fff3e0' : '#e8f5e9'} />
                      </div>
                      <p style={{ margin: '0 0 10px', fontSize: 13, color: '#666', lineHeight: 1.6 }}>{ass.description}</p>
                      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#888', flexWrap: 'wrap' }}>
                        <span><i className="fas fa-book" style={{ marginRight: 4 }} />{ass.subject}</span>
                        <span><i className="fas fa-calendar" style={{ marginRight: 4 }} />Due: {fmt(ass.dueDate)}</span>
                        <span><i className="fas fa-star" style={{ marginRight: 4 }} />{ass.totalPoints} pts</span>
                      </div>
                      {ass.fileUrl && (
                        <div style={{ marginTop: 10 }}>
                          <Btn small icon="fas fa-download" color="#3498db" onClick={() => handleDownloadDocument({ name: ass.title, url: ass.fileUrl })}>Download Materials</Btn>
                        </div>
                      )}
                      {ass.submitted && (
                        <div style={{ marginTop: 10, padding: '8px 12px', background: '#e8f5e9', borderRadius: 8, fontSize: 12, color: '#27ae60' }}>
                          <strong>Submitted:</strong> {fmt(ass.submittedAt)} | <strong>Score:</strong> {ass.score}%
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ EVENTS ══ */}
          {activeTab === 'events' && (
            <div>
              <div style={{ marginBottom: 18 }}><h2 style={{ margin: 0, fontSize: 19, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>School Events</h2><p style={{ margin: '3px 0 0', fontSize: 12, color: '#888' }}>{eventsList.length} events</p></div>
              {eventsList.length === 0 ? (
                <div style={{ background: 'white', borderRadius: 14, padding: 50, textAlign: 'center', color: '#bbb', boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                  <i className="fas fa-calendar-alt" style={{ fontSize: 36, display: 'block', marginBottom: 10, opacity: .3 }} />No events
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {eventsList.map(event => (
                    <div key={event._id} style={{ background: 'white', borderRadius: 14, padding: 18, display: 'flex', gap: 16, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                      <div style={{ textAlign: 'center', background: '#1a3a5c', color: 'white', padding: '12px', borderRadius: 12, minWidth: 70, flexShrink: 0 }}>
                        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, fontFamily: 'Georgia, serif' }}>{new Date(event.date).getDate()}</div>
                        <div style={{ fontSize: 10, opacity: .8, letterSpacing: 1, marginTop: 4 }}>{new Date(event.date).toLocaleString('default', { month: 'short' }).toUpperCase()}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ margin: 0, fontSize: 15, color: '#1a3a5c' }}>{event.title}</h3>
                        <p style={{ margin: '6px 0', fontSize: 13, color: '#666', lineHeight: 1.6 }}>{event.description}</p>
                        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#888', flexWrap: 'wrap' }}>
                          {event.time && <span><i className="fas fa-clock" style={{ marginRight: 4 }} />{event.time}</span>}
                          {event.location && <span><i className="fas fa-map-marker-alt" style={{ marginRight: 4 }} />{event.location}</span>}
                        </div>
                        {event.permissionRequired && (
                          <div style={{ marginTop: 10 }}>
                            <Btn small icon="fas fa-file-alt" color="#27ae60" onClick={handleRequestPermission}>Request Permission</Btn>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ DISCIPLINE ══ */}
          {activeTab === 'discipline' && (
            <div>
              <div style={{ marginBottom: 18 }}><h2 style={{ margin: 0, fontSize: 19, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>Behavior & Discipline</h2><p style={{ margin: '3px 0 0', fontSize: 12, color: '#888' }}>{childName} · {disciplineList.length} records</p></div>
              {disciplineList.length === 0 ? (
                <div style={{ background: 'white', borderRadius: 14, padding: 50, textAlign: 'center', color: '#bbb', boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                  <i className="fas fa-gavel" style={{ fontSize: 36, display: 'block', marginBottom: 10, opacity: .3 }} />No discipline records
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {disciplineList.map(record => {
                    const isPositive = record.type === 'positive';
                    return (
                      <div key={record._id} style={{ background: 'white', borderRadius: 14, padding: 18, borderLeft: `4px solid ${isPositive ? '#27ae60' : '#e74c3c'}`, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                          <h3 style={{ margin: 0, fontSize: 15, color: '#1a3a5c' }}>{record.category}</h3>
                          <Badge text={record.status} color={record.status === 'resolved' ? '#27ae60' : '#f39c12'} bg={record.status === 'resolved' ? '#e8f5e9' : '#fff3e0'} />
                        </div>
                        <p style={{ margin: '0 0 10px', fontSize: 13, color: '#666', lineHeight: 1.6 }}>{record.description}</p>
                        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#888', flexWrap: 'wrap' }}>
                          <span><i className="fas fa-calendar" style={{ marginRight: 4 }} />{fmt(record.date)}</span>
                          <span><i className="fas fa-user" style={{ marginRight: 4 }} />Reported by {record.reportedBy}</span>
                        </div>
                        {record.action && (
                          <div style={{ marginTop: 10, padding: '8px 12px', background: '#f8f9fa', borderRadius: 8, fontSize: 12 }}>
                            <strong>Action:</strong> {record.action}
                          </div>
                        )}
                        {record.reward && (
                          <div style={{ marginTop: 8, padding: '8px 12px', background: '#e8f5e9', borderRadius: 8, fontSize: 12, color: '#27ae60' }}>
                            <strong>🏆 Reward:</strong> {record.reward}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══ DOCUMENTS ══ */}
          {activeTab === 'documents' && (
            <div>
              <div style={{ marginBottom: 18 }}><h2 style={{ margin: 0, fontSize: 19, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>Documents</h2><p style={{ margin: '3px 0 0', fontSize: 12, color: '#888' }}>{documentsList.length} documents</p></div>
              {documentsList.length === 0 ? (
                <div style={{ background: 'white', borderRadius: 14, padding: 50, textAlign: 'center', color: '#bbb', boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                  <i className="fas fa-folder-open" style={{ fontSize: 36, display: 'block', marginBottom: 10, opacity: .3 }} />No documents
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
                  {documentsList.map(doc => (
                    <div key={doc._id} style={{ background: 'white', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: '#e8f0fb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className={`fas ${doc.type === 'report_card' ? 'fa-file-alt' : doc.type === 'certificate' ? 'fa-certificate' : 'fa-receipt'}`} style={{ fontSize: 18, color: '#1a3a5c' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a3a5c', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name}</div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{doc.date ? fmt(doc.date) : '—'}</div>
                      </div>
                      <Btn small icon="fas fa-download" color="#27ae60" onClick={() => handleDownloadDocument(doc)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ MESSAGES ══ */}
          {activeTab === 'messages' && (
            <div style={{ background: 'white', borderRadius: 14, padding: 30, textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
              <i className="fas fa-comments" style={{ fontSize: 48, color: '#1a3a5c', opacity: .3, marginBottom: 16, display: 'block' }} />
              <h3 style={{ margin: '0 0 8px', color: '#1a3a5c' }}>Message Center</h3>
              <p style={{ margin: '0 0 20px', color: '#888', fontSize: 13 }}>Chat with teachers and school staff about your child's progress.</p>
              <Btn icon="fas fa-comments" color="#1a3a5c" onClick={() => handleOpenChat()}>Open Messages</Btn>
            </div>
          )}

          {/* ══ SETTINGS ══ */}
          {activeTab === 'settings' && (
            <div style={{ maxWidth: 620, margin: '0 auto' }}>
              <div style={{ background: 'linear-gradient(135deg,#0d1f33,#1a3a5c)', borderRadius: 18, padding: 30, textAlign: 'center', marginBottom: 18, color: 'white' }}>
                <Avatar name={userName} size={72} bg='rgba(255,193,7,.2)' color='#ffc107' />
                <h2 style={{ margin: '14px 0 3px', fontFamily: 'Georgia, serif', fontSize: 22 }}>{userName}</h2>
                <div style={{ fontSize: 11, opacity: .7, letterSpacing: 1 }}>PARENT / GUARDIAN</div>
                <div style={{ fontSize: 12, opacity: .6, marginTop: 4 }}>{localStorage.getItem('userEmail') || 'parent@essa.rw'}</div>
              </div>
              <div style={{ background: 'white', borderRadius: 14, padding: 22, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 15, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>
                  <i className="fas fa-lock" style={{ color: '#ffc107', marginRight: 8 }} />Change Password
                </h3>
                {[['Current Password', 'currentPw'], ['New Password', 'newPw'], ['Confirm New Password', 'confirmPw']].map(([label, id]) => (
                  <Field key={id} label={label} required>
                    <Inp type="password" id={id} placeholder={`Enter ${label.toLowerCase()}`} />
                  </Field>
                ))}
                <Btn icon="fas fa-key" color="#1a3a5c" onClick={() => {
                  const cur = document.getElementById('currentPw')?.value;
                  const nw = document.getElementById('newPw')?.value;
                  const cf = document.getElementById('confirmPw')?.value;
                  if (!cur || !nw || !cf) { Swal.fire('Error', 'All fields required', 'warning'); return; }
                  if (nw !== cf) { Swal.fire('Error', 'Passwords do not match', 'error'); return; }
                  if (nw.length < 6) { Swal.fire('Error', 'Min 6 characters', 'error'); return; }
                  api('/user/change-password', { method: 'PUT', body: JSON.stringify({ currentPassword: cur, newPassword: nw }) })
                    .then(() => Swal.fire('✅ Password Updated!', '', 'success'))
                    .catch(e => Swal.fire('Error', e.message || 'Current password incorrect', 'error'));
                }}>Update Password</Btn>
              </div>
            </div>
          )}
        </div>
      </main>

      <ChatModal
        isOpen={isChatModalOpen}
        onClose={handleCloseChat}
        recipient={selectedChatUser}
        onMessageSent={fetchUnread}
      />
    </div>
  );
};

export default ParentDashboard;