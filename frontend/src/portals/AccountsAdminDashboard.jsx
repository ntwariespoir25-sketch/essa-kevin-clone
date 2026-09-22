import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import io from 'socket.io-client';

const API_URL = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';
const getToken = () => localStorage.getItem('portalToken');
const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` });

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-RW', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-RW', { hour: '2-digit', minute: '2-digit' }) : '';
const fmtAmt = (n) => typeof n === 'number' ? n.toLocaleString() + ' RWF' : '— RWF';

const Badge = ({ text, color, bg, size = 11 }) => (
  <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: size, fontWeight: 700, color, background: bg, whiteSpace: 'nowrap' }}>
    {typeof text === 'string' ? text.replace(/_/g, ' ').toUpperCase() : text}
  </span>
);

const Avatar = ({ name = '?', size = 36, bg = '#1a3a5c', color = '#ffc107', img }) => {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return img
    ? <img src={img} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
    : <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.38, flexShrink: 0 }}>{initials}</div>;
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
    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 5, letterSpacing: .5 }}>
      {label?.toUpperCase()}{required && <span style={{ color: '#e74c3c' }}> *</span>}
    </label>
    {children}
  </div>
);

const ist = { width: '100%', padding: '9px 12px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', transition: 'border-color .2s' };

const Inp = (props) => <input {...props} style={{ ...ist, ...props.style }} onFocus={e => e.target.style.borderColor = '#1a3a5c'} onBlur={e => e.target.style.borderColor = '#e0e0e0'} />;
const Sel = ({ children, ...props }) => <select {...props} style={{ ...ist, background: 'white', ...props.style }}>{children}</select>;
const Txt = (props) => <textarea {...props} style={{ ...ist, resize: 'vertical', minHeight: 80, ...props.style }} onFocus={e => e.target.style.borderColor = '#1a3a5c'} onBlur={e => e.target.style.borderColor = '#e0e0e0'} />;

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

const Table = ({ cols, rows, emptyMsg = 'No data found' }) => (
  <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid #f0f0f0' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
      <thead><tr style={{ background: '#f7f9fb' }}>
        {cols.map((c, i) => <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: .8, borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>{c.toUpperCase()}</th>)}
      </tr></thead>
      <tbody>
        {rows.length === 0
          ? <tr><td colSpan={cols.length} style={{ textAlign: 'center', padding: 36, color: '#bbb', fontSize: 13 }}>{emptyMsg}</td></tr>
          : rows.map((row, i) => <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }} onMouseEnter={e => e.currentTarget.style.background = '#fafbff'} onMouseLeave={e => e.currentTarget.style.background = ''}>{row}</tr>)}
      </tbody>
    </table>
  </div>
);

const TD = ({ children, style }) => <td style={{ padding: '10px 14px', fontSize: 13, color: '#333', ...style }}>{children}</td>;

// Role badge helper
const roleBadge = (role) => {
  const map = {
    super_admin:      { label: 'Super Admin', color: '#ffc107', bg: '#fff8e1' },
    academic_admin:   { label: 'Academic Admin', color: '#27ae60', bg: '#e8f5e9' },
    discipline_admin: { label: 'Discipline Admin', color: '#e74c3c', bg: '#fdecea' },
    accounts_admin:   { label: 'Accounts Admin', color: '#3498db', bg: '#e3f2fd' },
    teacher:          { label: 'Teacher', color: '#9b59b6', bg: '#f3e5f5' },
    student:          { label: 'Student', color: '#1abc9c', bg: '#e0f7fa' },
    parent:           { label: 'Parent', color: '#e67e22', bg: '#fff3e0' },
  };
  return map[role] || { label: role || '—', color: '#666', bg: '#f0f0f0' };
};

// ═══════════════════════════════════════════════════════════════════
const AccountsAdminDashboard = () => {
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // data
  const [budget, setBudget] = useState({ total: 0 });
  const [income, setIncome] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [feeStructures, setFeeStructures] = useState([]);
  const [feePayments, setFeePayments] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);

  // announcements
  const [announcements, setAnnouncements] = useState([]);

  // modals
  const [incomeModal, setIncomeModal] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);
  const [feeModal, setFeeModal] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [salaryModal, setSalaryModal] = useState(false);
  const [budgetModal, setBudgetModal] = useState(false);

  const [incomeForm, setIncomeForm] = useState({ source: '', amount: '', date: new Date().toISOString().split('T')[0], description: '', reference: '' });
  const [expenseForm, setExpenseForm] = useState({ category: '', amount: '', date: new Date().toISOString().split('T')[0], description: '', reference: '' });
  const [feeForm, setFeeForm] = useState({ classId: '', feeType: '', amount: '', dueDate: '', description: '' });
  const [salaryForm, setSalaryForm] = useState({ teacherName: '', subject: '', amount: '', month: '', year: new Date().getFullYear(), status: 'pending' });
  const [paymentForm, setPaymentForm] = useState({ studentId: '', feeType: '', amount: '', paymentDate: new Date().toISOString().split('T')[0], paymentMethod: 'cash', reference: '' });

  const [newBudget, setNewBudget] = useState('');

  // filters
  const [recordSearch, setRecordSearch] = useState('');

  // messaging
  const [msgUsers, setMsgUsers] = useState([]);
  const [msgTab, setMsgTab] = useState('inbox');
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgText, setMsgText] = useState('');
  const [unread, setUnread] = useState(0);
  const [socket, setSocket] = useState(null);
  const [msgSearch, setMsgSearch] = useState('');
  const userName = localStorage.getItem('userName') || 'Accounts Admin';
  const userId = localStorage.getItem('userId');

  useEffect(() => {
    const check = () => { setIsMobile(window.innerWidth <= 1024); if (window.innerWidth > 1024) setMobileOpen(false); };
    check(); window.addEventListener('resize', check); return () => window.removeEventListener('resize', check);
  }, []);

  // Socket connection
  useEffect(() => {
    const token = getToken(); if (!token) return;
    const sock = io(SOCKET_URL, { auth: { token } });
    setSocket(sock);
    if (userId) sock.emit('join', userId);
    sock.on('new_message', () => { fetchUnread(); fetchMsgUsers(); });
    sock.on('newMessage', () => { fetchUnread(); fetchMsgUsers(); });
    return () => sock.disconnect();
  }, [userId]);

  // Auth check
  useEffect(() => {
    const token = getToken(); const role = localStorage.getItem('userRole');
    if (!token || role !== 'accounts_admin') { navigate('/portal/login'); return; }
    loadAll();
  }, [navigate]);

  // Scroll messages to bottom
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const api = useCallback(async (path, opts = {}) => {
    const res = await fetch(`${API_URL}${path}`, { headers: authHeaders(), ...opts });
    if (!res.ok) {
      let err;
      try { err = await res.json(); } catch { err = { message: `HTTP ${res.status}` }; }
      return Promise.reject(err);
    }
    return res.json();
  }, []);

  const loadAll = () => Promise.allSettled([
    fetchBudget(), fetchIncome(), fetchExpenses(), fetchFees(),
    fetchPayments(), fetchSalaries(), fetchClasses(), fetchStudents(),
    fetchUnread(), fetchMsgUsers(), fetchAnnouncements(),
  ]).finally(() => setLoading(false));

  // ─── fetchers ─────────────────────────────────────────────────
  const fetchBudget = () => api('/accounts/budget').then(d => setBudget(d || { total: 0 })).catch(() => {});
  const fetchIncome = () => api('/accounts/income').then(d => setIncome(Array.isArray(d) ? d : [])).catch(() => {});
  const fetchExpenses = () => api('/accounts/expenses').then(d => setExpenses(Array.isArray(d) ? d : [])).catch(() => {});
  const fetchFees = () => api('/accounts/fee-structures').then(d => setFeeStructures(Array.isArray(d) ? d : [])).catch(() => {});
  const fetchPayments = () => api('/accounts/payments').then(d => setFeePayments(Array.isArray(d) ? d : [])).catch(() => {});
  const fetchSalaries = () => api('/accounts/salaries').then(d => setSalaries(Array.isArray(d) ? d : [])).catch(() => {});
  const fetchClasses = () => api('/academic-admin/classes').then(d => setClasses(Array.isArray(d) ? d : [])).catch(() => {});
  const fetchStudents = () => api('/academic-admin/students').then(d => setStudents(Array.isArray(d) ? d : [])).catch(() => {});
  const fetchAnnouncements = () => {
    api('/announcements').then(d => setAnnouncements(Array.isArray(d) ? d : [])).catch(() => setAnnouncements([]));
  };

  const fetchUnread = () => {
    api('/messages/unread-count')
      .then(d => setUnread(d?.count || d?.unread || 0))
      .catch(() => setUnread(0));
  };

  const fetchMsgUsers = () => {
    api('/messages/users').then(d => {
      const all = Object.values(d?.users || d || {});
      setMsgUsers(Array.isArray(all) ? all.flat() : []);
    }).catch(() => setMsgUsers([]));
  };

  const fetchConversation = (uid) => {
    if (!uid) return;
    api(`/messages/conversation/${uid}`).then(d => setMessages(Array.isArray(d?.messages) ? d.messages : [])).catch(() => setMessages([]));
  };

  const sendMessage = async () => {
    if (!msgText.trim() || !selectedUser) return;
    try {
      const res = await api('/messages/send', {
        method: 'POST',
        body: JSON.stringify({
          recipientId: selectedUser._id,
          subject: 'Direct Message',
          content: msgText.trim(),
        })
      });
      setMessages(prev => [...prev, res.message]);
      setMsgText('');
      if (socket) socket.emit('sendMessage', { receiverId: selectedUser._id, ...res.message });
      fetchUnread();
      fetchMsgUsers();
    } catch (e) {
      console.error('Send message error:', e);
    }
  };

  // ─── financial actions ───────────────────────────────────────────
  const addIncome = async () => {
    if (!incomeForm.source || !incomeForm.amount) { Swal.fire('Missing Fields', 'Source and amount required', 'warning'); return; }
    setSaving(true);
    try {
      await api('/accounts/income', { method: 'POST', body: JSON.stringify({ ...incomeForm, amount: parseFloat(incomeForm.amount) }) });
      Swal.fire('✅ Income Recorded!', '', 'success');
      setIncomeModal(false); setIncomeForm({ source: '', amount: '', date: new Date().toISOString().split('T')[0], description: '', reference: '' });
      fetchIncome();
    } catch (e) { Swal.fire('Error', e.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const addExpense = async () => {
    if (!expenseForm.category || !expenseForm.amount) { Swal.fire('Missing Fields', 'Category and amount required', 'warning'); return; }
    setSaving(true);
    try {
      await api('/accounts/expenses', { method: 'POST', body: JSON.stringify({ ...expenseForm, amount: parseFloat(expenseForm.amount) }) });
      Swal.fire('✅ Expense Recorded!', '', 'success');
      setExpenseModal(false); setExpenseForm({ category: '', amount: '', date: new Date().toISOString().split('T')[0], description: '', reference: '' });
      fetchExpenses();
    } catch (e) { Swal.fire('Error', e.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const createFee = async () => {
    if (!feeForm.feeType || !feeForm.amount) { Swal.fire('Missing Fields', 'Fee type and amount required', 'warning'); return; }
    setSaving(true);
    try {
      await api('/accounts/fee-structures', { method: 'POST', body: JSON.stringify({ ...feeForm, amount: parseFloat(feeForm.amount) }) });
      Swal.fire('✅ Fee Structure Created!', '', 'success');
      setFeeModal(false); setFeeForm({ classId: '', feeType: '', amount: '', dueDate: '', description: '' });
      fetchFees();
    } catch (e) { Swal.fire('Error', e.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const deleteFee = async (id) => {
    const ok = await Swal.fire({ title: 'Delete fee structure?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#e74c3c', confirmButtonText: 'Delete' });
    if (!ok.isConfirmed) return;
    await api(`/accounts/fee-structures/${id}`, { method: 'DELETE' });
    Swal.fire('Deleted!', '', 'success'); fetchFees();
  };

  const recordPayment = async () => {
    if (!paymentForm.studentId || !paymentForm.amount) { Swal.fire('Missing Fields', 'Student and amount required', 'warning'); return; }
    setSaving(true);
    try {
      await api('/accounts/payments', { method: 'POST', body: JSON.stringify({ ...paymentForm, amount: parseFloat(paymentForm.amount) }) });
      Swal.fire('✅ Payment Recorded!', '', 'success');
      setPaymentModal(false); setPaymentForm({ studentId: '', feeType: '', amount: '', paymentDate: new Date().toISOString().split('T')[0] });
      fetchPayments();
    } catch (e) { Swal.fire('Error', e.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const addSalary = async () => {
    if (!salaryForm.teacherName || !salaryForm.amount) { Swal.fire('Missing Fields', 'Teacher name and amount required', 'warning'); return; }
    setSaving(true);
    try {
      await api('/accounts/salaries', { method: 'POST', body: JSON.stringify({ ...salaryForm, amount: parseFloat(salaryForm.amount) }) });
      Swal.fire('✅ Salary Record Added!', '', 'success');
      setSalaryModal(false); setSalaryForm({ teacherName: '', subject: '', amount: '', month: '', year: new Date().getFullYear(), status: 'pending' });
      fetchSalaries();
    } catch (e) { Swal.fire('Error', e.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const approveSalary = async (s) => {
    const ok = await Swal.fire({ title: `Approve salary for ${s.teacherName}?`, text: fmtAmt(s.amount), icon: 'question', showCancelButton: true, confirmButtonColor: '#27ae60', confirmButtonText: 'Approve' });
    if (!ok.isConfirmed) return;
    await api(`/accounts/salaries/${s._id}/approve`, { method: 'PUT' });
    Swal.fire('✅ Approved!', '', 'success'); fetchSalaries();
  };

  const updateBudget = async () => {
    if (!newBudget) return;
    await api('/accounts/budget', { method: 'PUT', body: JSON.stringify({ total: parseFloat(newBudget) }) });
    Swal.fire('✅ Budget Updated!', '', 'success'); setBudgetModal(false); fetchBudget();
  };

  const totalIncome = income.reduce((s, i) => s + (i.amount || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const pendingSalaries = salaries.filter(s => s.status === 'pending').length;

  const filteredRecords = [...income.map(i => ({ ...i, _type: 'income' })), ...expenses.map(e => ({ ...e, _type: 'expense' }))]
    .filter(t => !recordSearch || (t.source || t.category || '').toLowerCase().includes(recordSearch.toLowerCase()))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const filteredUsers = msgUsers.filter(u =>
    u.fullName?.toLowerCase().includes(msgSearch.toLowerCase()) ||
    u.role?.toLowerCase().includes(msgSearch.toLowerCase())
  );

  const menuItems = [
    { id: 'overview', label: 'Dashboard', icon: 'fas fa-chart-line' },
    { id: 'budget', label: 'Budget', icon: 'fas fa-chart-pie' },
    { id: 'fees', label: 'Fee Management', icon: 'fas fa-money-bill-wave' },
    { id: 'salaries', label: 'Salaries', icon: 'fas fa-wallet', badge: pendingSalaries },
    { id: 'records', label: 'Financial Records', icon: 'fas fa-book' },
    { id: 'announcements', label: 'Announcements', icon: 'fas fa-bullhorn' },
    { id: 'messages', label: 'Messages', icon: 'fas fa-comments', badge: unread },
    { id: 'profile', label: 'Profile', icon: 'fas fa-user-shield' },
  ];

  const sideW = isMobile ? 0 : sidebarOpen ? 260 : 72;

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'linear-gradient(135deg,#0d2b42,#1a3a5c)', color: 'white', gap: 20 }}>
      <div style={{ width: 44, height: 44, border: '3px solid rgba(255,255,255,.15)', borderTopColor: '#ffc107', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <p style={{ margin: 0, fontSize: 16 }}>Loading...</p>
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
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#ccc;border-radius:10px}
        .msg-bubble-sent{background:#1a3a5c;color:white;border-radius:18px 18px 4px 18px;padding:10px 15px;max-width:70%;align-self:flex-end;font-size:13px;line-height:1.5}
        .msg-bubble-received{background:white;color:#333;border-radius:18px 18px 18px 4px;padding:10px 15px;max-width:70%;align-self:flex-start;font-size:13px;line-height:1.5;box-shadow:0 1px 4px rgba(0,0,0,.08)}
        @media(max-width:768px){.hide-m{display:none!important}}
      `}</style>

      {isMobile && mobileOpen && <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 998 }} />}

      {/* ─── SIDEBAR ─── */}
      <aside style={{ position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 999, width: isMobile ? (mobileOpen ? 260 : 0) : sideW, background: 'linear-gradient(180deg,#0d1f33 0%,#1a3a5c 100%)', color: 'white', display: 'flex', flexDirection: 'column', transition: 'width .3s', overflow: 'hidden', boxShadow: '3px 0 20px rgba(0,0,0,.18)' }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', gap: 11, flexShrink: 0 }}>
          <div style={{ width: 38, height: 38, background: '#ffc107', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="fas fa-coins" style={{ fontSize: 16, color: '#1a3a5c' }} />
          </div>
          {(sidebarOpen || isMobile) && <div><div style={{ fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 600 }}>ESSA Portal</div><div style={{ fontSize: 10, opacity: .6, letterSpacing: 1 }}>ACCOUNTS ADMIN</div></div>}
          {!isMobile && <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}><i className={`fas fa-chevron-${sidebarOpen ? 'left' : 'right'}`} /></button>}
        </div>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Avatar name={userName} size={36} bg='rgba(255,193,7,.2)' color='#ffc107' />
          {(sidebarOpen || isMobile) && <div><div style={{ fontSize: 13, fontWeight: 600 }}>{userName}</div><div style={{ fontSize: 10, color: '#ffc107' }}>Accounts Admin</div></div>}
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {menuItems.map(item => {
            const active = activeTab === item.id;
            return (
              <button key={item.id} onClick={() => { setActiveTab(item.id); if (isMobile) setMobileOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '10px 16px', background: active ? 'rgba(255,193,7,.15)' : 'transparent', border: 'none', borderRight: active ? '3px solid #ffc107' : '3px solid transparent', color: active ? '#ffc107' : 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400, transition: 'all .2s', textAlign: 'left' }}>
                <i className={item.icon} style={{ fontSize: 15, width: 18, flexShrink: 0 }} />
                {(sidebarOpen || isMobile) && <span style={{ flex: 1 }}>{item.label}</span>}
                {item.badge > 0 && (sidebarOpen || isMobile) && <span style={{ background: '#e74c3c', color: 'white', borderRadius: 20, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>{item.badge}</span>}
              </button>
            );
          })}
        </nav>
        <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,.08)', flexShrink: 0 }}>
          <button onClick={() => { localStorage.clear(); navigate('/portal/login'); }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 12px', background: 'rgba(231,76,60,.2)', border: '1px solid rgba(231,76,60,.3)', borderRadius: 9, color: '#ff8a80', cursor: 'pointer', fontSize: 13 }}>
            <i className="fas fa-sign-out-alt" style={{ fontSize: 13 }} />{(sidebarOpen || isMobile) && 'Logout'}
          </button>
        </div>
      </aside>

      {/* ─── MAIN ─── */}
      <main style={{ flex: 1, marginLeft: isMobile ? 0 : sideW, transition: 'margin-left .3s', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: 'white', padding: '11px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 8px rgba(0,0,0,.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isMobile && <button onClick={() => setMobileOpen(!mobileOpen)} style={{ background: '#1a3a5c', color: 'white', border: 'none', padding: '7px 10px', borderRadius: 8, cursor: 'pointer' }}><i className="fas fa-bars" /></button>}
            <div>
              <div style={{ fontSize: 10, color: '#aaa', letterSpacing: .5 }}>ESSA NYARUGUNGA</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>{menuItems.find(m => m.id === activeTab)?.label || 'Dashboard'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {unread > 0 && <div style={{ background: '#fdecea', color: '#e74c3c', borderRadius: 20, fontSize: 12, fontWeight: 700, padding: '4px 10px' }}>{unread} new msg</div>}
            <Avatar name={userName} size={32} />
            <div className="hide-m"><div style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>{userName}</div><div style={{ fontSize: 10, color: '#ffc107' }}>ACCOUNTS ADMIN</div></div>
          </div>
        </div>
        <div style={{ flex: 1, padding: 20, overflowY: 'auto' }} className="tab-anim">
          {/* ══ OVERVIEW ══ */}
          {activeTab === 'overview' && (
            <div>
              <div style={{ background: 'linear-gradient(135deg,#0d1f33,#1a3a5c)', borderRadius: 18, padding: '22px 26px', marginBottom: 20, color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, boxShadow: '0 6px 24px rgba(26,58,92,.35)' }}>
                <div>
                  <div style={{ fontSize: 19, fontWeight: 600, fontFamily: 'Georgia, serif', marginBottom: 4 }}>Welcome, {userName.split(' ')[0]}! 💰</div>
                  <div style={{ fontSize: 12, opacity: .75 }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Btn onClick={() => setIncomeModal(true)} icon="fas fa-plus-circle" color="#27ae60">Add Income</Btn>
                  <Btn onClick={() => setExpenseModal(true)} icon="fas fa-minus-circle" color="#e74c3c">Add Expense</Btn>
                </div>
              </div>

              {/* Stats cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 20 }}>
                {[
                  { icon: 'fas fa-chart-pie', label: 'Total Budget', value: fmtAmt(budget.total), accent: '#1a3a5c', bg: '#e8f0fb', action: () => setBudgetModal(true) },
                  { icon: 'fas fa-arrow-down', label: 'Total Income', value: fmtAmt(totalIncome), accent: '#27ae60', bg: '#e8f5e9', action: () => setIncomeModal(true) },
                  { icon: 'fas fa-arrow-up', label: 'Total Expenses', value: fmtAmt(totalExpenses), accent: '#e74c3c', bg: '#fdecea', action: () => setExpenseModal(true) },
                  { icon: 'fas fa-balance-scale', label: 'Net Balance', value: fmtAmt(totalIncome - totalExpenses), accent: totalIncome - totalExpenses >= 0 ? '#27ae60' : '#e74c3c', bg: '#f8f9fa' },
                  { icon: 'fas fa-wallet', label: 'Pending Salaries', value: pendingSalaries, accent: '#f39c12', bg: '#fff3e0', action: () => setActiveTab('salaries') },
                  { icon: 'fas fa-credit-card', label: 'Fee Payments', value: feePayments.length, accent: '#3498db', bg: '#e3f2fd', action: () => setActiveTab('fees') },
                ].map((s, i) => (
                  <div key={i} onClick={s.action} style={{ background: 'white', borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 2px 10px rgba(0,0,0,.05)', cursor: s.action ? 'pointer' : 'default', transition: 'transform .2s', border: '1px solid #f0f0f0' }}
                    onMouseEnter={e => { if (s.action) { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,.1)'; } }}
                    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,.05)'; }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className={s.icon} style={{ fontSize: 18, color: s.accent }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#1a3a5c', lineHeight: 1, fontFamily: 'Georgia, serif' }}>{s.value}</div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{s.label}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick actions */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
                <Btn onClick={() => setIncomeModal(true)} icon="fas fa-plus-circle" color="#27ae60">Add Income</Btn>
                <Btn onClick={() => setExpenseModal(true)} icon="fas fa-minus-circle" color="#e74c3c">Add Expense</Btn>
                <Btn onClick={() => setFeeModal(true)} icon="fas fa-tag" color="#3498db">Create Fee</Btn>
                <Btn onClick={() => setPaymentModal(true)} icon="fas fa-credit-card" color="#1abc9c">Record Payment</Btn>
                <Btn onClick={() => setSalaryModal(true)} icon="fas fa-wallet" color="#9b59b6">Add Salary</Btn>
                <Btn onClick={() => setBudgetModal(true)} icon="fas fa-cog" color="#f39c12">Set Budget</Btn>
              </div>

              {/* Recent transactions */}
              <div style={{ background: 'white', borderRadius: 14, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 14, color: '#1a3a5c', fontWeight: 600 }}><i className="fas fa-history" style={{ marginRight: 7, color: '#3498db' }} />Recent Transactions</h3>
                {[...income.map(i => ({ ...i, _type: 'income' })), ...expenses.map(e => ({ ...e, _type: 'expense' }))]
                  .sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8).map(t => (
                    <div key={t._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid #f5f5f5' }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: t._type === 'income' ? '#e8f5e9' : '#fdecea', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className={`fas fa-arrow-${t._type === 'income' ? 'down' : 'up'}`} style={{ fontSize: 13, color: t._type === 'income' ? '#27ae60' : '#e74c3c' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{t.source || t.category}</div>
                        <div style={{ fontSize: 11, color: '#aaa' }}>{fmt(t.date)} {t.description ? '· ' + t.description : ''}</div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: t._type === 'income' ? '#27ae60' : '#e74c3c' }}>
                        {t._type === 'income' ? '+' : '-'}{fmtAmt(t.amount)}
                      </div>
                    </div>
                  ))}
                {income.length === 0 && expenses.length === 0 && <p style={{ textAlign: 'center', color: '#bbb', fontSize: 13, padding: 20 }}>No transactions yet</p>}
              </div>
            </div>
          )}

          {/* ══ BUDGET ══ */}
          {activeTab === 'budget' && (
            <div>
              <div style={{ marginBottom: 18 }}><h2 style={{ margin: 0, fontSize: 19, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>Budget & Financial Overview</h2></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 20 }}>
                {[
                  { label: 'Total Budget', value: fmtAmt(budget.total), color: '#1a3a5c', action: () => setBudgetModal(true), actionLabel: 'Edit' },
                  { label: 'Total Income', value: fmtAmt(totalIncome), color: '#27ae60', action: () => setIncomeModal(true), actionLabel: '+ Add' },
                  { label: 'Total Expenses', value: fmtAmt(totalExpenses), color: '#e74c3c', action: () => setExpenseModal(true), actionLabel: '+ Add' },
                ].map((c, i) => (
                  <div key={i} style={{ background: 'white', borderRadius: 14, padding: '18px 20px', textAlign: 'center', boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                    <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{c.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: c.color, fontFamily: 'Georgia, serif', marginBottom: 10 }}>{c.value}</div>
                    <Btn small onClick={c.action} color={c.color}>{c.actionLabel}</Btn>
                  </div>
                ))}
              </div>
              <div style={{ background: 'white', borderRadius: 14, padding: 20, marginBottom: 18, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 14, color: '#1a3a5c', fontWeight: 600 }}>Budget Utilisation</h3>
                {[
                  { label: 'Spent', value: totalExpenses, total: budget.total || 1, color: '#e74c3c' },
                  { label: 'Remaining', value: Math.max(0, (budget.total || 0) - totalExpenses), total: budget.total || 1, color: '#27ae60' },
                ].map(b => (
                  <div key={b.label} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                      <span>{b.label}</span><span style={{ fontWeight: 700, color: b.color }}>{fmtAmt(b.value)}</span>
                    </div>
                    <div style={{ height: 10, background: '#f0f0f0', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, (b.value / b.total) * 100)}%`, background: b.color, borderRadius: 5 }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 18 }}>
                <div style={{ background: 'white', borderRadius: 14, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                    <h3 style={{ margin: 0, fontSize: 14, color: '#27ae60', fontWeight: 600 }}><i className="fas fa-arrow-down" style={{ marginRight: 7 }} />Income</h3>
                    <Btn small onClick={() => setIncomeModal(true)} icon="fas fa-plus" color="#27ae60">Add</Btn>
                  </div>
                  <Table cols={['Date', 'Source', 'Amount']} emptyMsg="No income recorded"
                    rows={income.slice(0, 10).map(i => (
                      <React.Fragment key={i._id}>
                        <TD style={{ fontSize: 12, color: '#aaa' }}>{fmt(i.date)}</TD>
                        <TD><div style={{ fontWeight: 600, fontSize: 13 }}>{i.source}</div><div style={{ fontSize: 11, color: '#aaa' }}>{i.description}</div></TD>
                        <TD><span style={{ fontWeight: 700, color: '#27ae60' }}>+{fmtAmt(i.amount)}</span></TD>
                      </React.Fragment>
                    ))}
                  />
                </div>
                <div style={{ background: 'white', borderRadius: 14, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                    <h3 style={{ margin: 0, fontSize: 14, color: '#e74c3c', fontWeight: 600 }}><i className="fas fa-arrow-up" style={{ marginRight: 7 }} />Expenses</h3>
                    <Btn small onClick={() => setExpenseModal(true)} icon="fas fa-plus" color="#e74c3c">Add</Btn>
                  </div>
                  <Table cols={['Date', 'Category', 'Amount']} emptyMsg="No expenses recorded"
                    rows={expenses.slice(0, 10).map(e => (
                      <React.Fragment key={e._id}>
                        <TD style={{ fontSize: 12, color: '#aaa' }}>{fmt(e.date)}</TD>
                        <TD><div style={{ fontWeight: 600, fontSize: 13 }}>{e.category}</div><div style={{ fontSize: 11, color: '#aaa' }}>{e.description}</div></TD>
                        <TD><span style={{ fontWeight: 700, color: '#e74c3c' }}>-{fmtAmt(e.amount)}</span></TD>
                      </React.Fragment>
                    ))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ══ FEES ══ */}
          {activeTab === 'fees' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
                <div><h2 style={{ margin: 0, fontSize: 19, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>Fee Management</h2></div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Btn onClick={() => setFeeModal(true)} icon="fas fa-plus" color="#3498db">Create Fee Structure</Btn>
                  <Btn onClick={() => setPaymentModal(true)} icon="fas fa-credit-card" color="#27ae60">Record Payment</Btn>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14, marginBottom: 20 }}>
                {feeStructures.map(fee => (
                  <div key={fee._id} style={{ background: 'white', borderRadius: 12, padding: '16px 18px', borderLeft: '4px solid #f39c12', boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <h3 style={{ margin: 0, fontSize: 14, color: '#1a3a5c' }}>{fee.feeType}</h3>
                      <button onClick={() => deleteFee(fee._id)} style={{ background: '#fdecea', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#e74c3c', fontSize: 11 }}><i className="fas fa-trash" /></button>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#27ae60', marginBottom: 8, fontFamily: 'Georgia, serif' }}>{fmtAmt(fee.amount)}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{fee.classId ? `Class: ${fee.classId.grade || ''} ${fee.classId.className || ''}` : 'All classes'}</div>
                    {fee.dueDate && <div style={{ fontSize: 11, color: '#e74c3c', marginTop: 4 }}>Due: {fmt(fee.dueDate)}</div>}
                    {fee.description && <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>{fee.description}</div>}
                  </div>
                ))}
                {feeStructures.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#bbb', background: 'white', borderRadius: 12, fontSize: 13, gridColumn: '1/-1' }}>No fee structures created yet</div>}
              </div>
              <div style={{ background: 'white', borderRadius: 14, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 14, color: '#1a3a5c', fontWeight: 600 }}><i className="fas fa-credit-card" style={{ marginRight: 7, color: '#27ae60' }} />Recent Payments</h3>
                  <Btn small onClick={() => setPaymentModal(true)} icon="fas fa-plus" color="#27ae60">Record Payment</Btn>
                </div>
                <Table cols={['Date', 'Student', 'Fee Type', 'Amount', 'Receipt']} emptyMsg="No payments recorded yet"
                  rows={feePayments.slice(0, 15).map(p => (
                    <React.Fragment key={p._id}>
                      <TD style={{ fontSize: 12, color: '#aaa' }}>{fmt(p.paymentDate)}</TD>
                      <TD><div style={{ fontWeight: 600, fontSize: 13 }}>{p.studentName || p.studentId?.fullName || '—'}</div></TD>
                      <TD style={{ fontSize: 12 }}>{p.feeType}</TD>
                      <TD><span style={{ fontWeight: 700, color: '#27ae60' }}>{fmtAmt(p.amount)}</span></TD>
                      <TD style={{ fontSize: 12, color: '#3498db' }}>{p.receiptNo || '—'}</TD>
                    </React.Fragment>
                  ))}
                />
              </div>
            </div>
          )}

          {/* ══ SALARIES ══ */}
          {activeTab === 'salaries' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
                <div><h2 style={{ margin: 0, fontSize: 19, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>Teacher Salaries</h2><p style={{ margin: '3px 0 0', fontSize: 12, color: '#888' }}>{pendingSalaries} pending approval</p></div>
                <Btn onClick={() => setSalaryModal(true)} icon="fas fa-plus" color="#1a3a5c">Add Salary Record</Btn>
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
                {[
                  ['Total Records', salaries.length, '#1a3a5c', '#e8f0fb'],
                  ['Pending', pendingSalaries, '#f39c12', '#fff3e0'],
                  ['Approved', salaries.filter(s => s.status === 'approved').length, '#27ae60', '#e8f5e9'],
                  ['Total Approved', fmtAmt(salaries.filter(s => s.status === 'approved').reduce((sum, s) => sum + (s.amount || 0), 0)), '#9b59b6', '#f3e5f5'],
                ].map(([l, v, c, bg]) => (
                  <div key={l} style={{ background: bg, borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: c, fontFamily: 'Georgia, serif' }}>{v}</div>
                    <div style={{ fontSize: 11, color: c, opacity: .8, fontWeight: 600 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                <Table cols={['Teacher', 'Subject', 'Month / Year', 'Amount', 'Status', 'Actions']} emptyMsg="No salary records yet"
                  rows={salaries.map(s => (
                    <React.Fragment key={s._id}>
                      <TD><div style={{ fontWeight: 600, fontSize: 13 }}>{s.teacherName}</div></TD>
                      <TD style={{ fontSize: 12 }}>{s.subject || '—'}</TD>
                      <TD style={{ fontSize: 12 }}>{s.month} {s.year}</TD>
                      <TD><span style={{ fontWeight: 700 }}>{fmtAmt(s.amount)}</span></TD>
                      <TD><Badge text={s.status} color={s.status === 'approved' ? '#27ae60' : '#f39c12'} bg={s.status === 'approved' ? '#e8f5e9' : '#fff3e0'} /></TD>
                      <TD>{s.status === 'pending' && <Btn small onClick={() => approveSalary(s)} color="#27ae60" icon="fas fa-check">Approve</Btn>}</TD>
                    </React.Fragment>
                  ))}
                />
              </div>
            </div>
          )}

          {/* ══ RECORDS ══ */}
          {activeTab === 'records' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
                <div><h2 style={{ margin: 0, fontSize: 19, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>Financial Records</h2><p style={{ margin: '3px 0 0', fontSize: 12, color: '#888' }}>{filteredRecords.length} transactions</p></div>
                <input value={recordSearch} onChange={e => setRecordSearch(e.target.value)} placeholder="Search records..." style={{ padding: '8px 12px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 13, outline: 'none', width: 220 }} />
              </div>
              <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                <Table cols={['Date', 'Type', 'Source / Category', 'Description', 'Reference', 'Amount']} emptyMsg="No records found"
                  rows={filteredRecords.map(t => (
                    <React.Fragment key={t._id}>
                      <TD style={{ fontSize: 12, color: '#aaa' }}>{fmt(t.date)}</TD>
                      <TD><Badge text={t._type} color={t._type === 'income' ? '#27ae60' : '#e74c3c'} bg={t._type === 'income' ? '#e8f5e9' : '#fdecea'} /></TD>
                      <TD><span style={{ fontWeight: 600, fontSize: 13 }}>{t.source || t.category}</span></TD>
                      <TD style={{ fontSize: 12, color: '#666' }}>{t.description || '—'}</TD>
                      <TD style={{ fontSize: 12, color: '#3498db' }}>{t.reference || '—'}</TD>
                      <TD><span style={{ fontWeight: 700, color: t._type === 'income' ? '#27ae60' : '#e74c3c' }}>{t._type === 'income' ? '+' : '-'}{fmtAmt(t.amount)}</span></TD>
                    </React.Fragment>
                  ))}
                />
              </div>
            </div>
          )}

          {/* ══ ANNOUNCEMENTS ══ */}
          {activeTab === 'announcements' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 19, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>School Announcements</h2>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>
                    {announcements.length} total announcements
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {announcements.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 60, color: '#bbb', background: 'white', borderRadius: 16 }}>
                    <i className="fas fa-bullhorn" style={{ fontSize: 36, marginBottom: 12, display: 'block', opacity: .3 }} />
                    No announcements yet
                  </div>
                )}
                {announcements.map((ann) => {
                  const priority = ann.priority || 'normal';
                  const pColor = priority === 'urgent' ? '#e74c3c' : priority === 'high' ? '#f39c12' : '#27ae60';
                  const pBg = priority === 'urgent' ? '#fdecea' : priority === 'high' ? '#fff3e0' : '#e8f5e9';
                  return (
                    <div key={ann._id} style={{
                      background: 'white', borderRadius: 14, padding: '18px 20px',
                      borderLeft: `4px solid ${pColor}`, boxShadow: '0 2px 10px rgba(0,0,0,.05)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: 15, color: '#1a3a5c' }}>{ann.title || 'Untitled'}</h3>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                            <Badge text={priority} color={pColor} bg={pBg} />
                            <Badge text={ann.audience === 'all' ? 'All Users' : (ann.audience || 'All Users')} color="#888" bg="#f5f5f5" />
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: '#aaa' }}>{ann.createdAt ? fmt(ann.createdAt) : 'Just now'}</span>
                        </div>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: '#555', lineHeight: 1.7 }}>{ann.content || 'No content provided'}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══ MESSAGES ══ */}
          {activeTab === 'messages' && (
            <div style={{ background: 'white', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,.06)',
              overflow: 'hidden', height: 'calc(100vh - 150px)', display: 'flex', flexDirection: 'column' }}>
              {/* tabs */}
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #eee', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {['inbox', 'compose'].map(t => (
                  <button key={t} onClick={() => { setMsgTab(t); if (t === 'compose') { setSelectedUser(null); setMessages([]); } }}
                    style={{
                      padding: '7px 18px', borderRadius: 30, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      background: msgTab === t ? '#1a3a5c' : '#f0f3f8', color: msgTab === t ? 'white' : '#666',
                      transition: 'all .2s',
                    }}>
                    {t === 'inbox' ? <><i className="fas fa-inbox" style={{ marginRight: 6 }} />Inbox{unread > 0 && <span style={{ marginLeft: 6, background: '#e74c3c', color: 'white', borderRadius: 20, fontSize: 10, padding: '1px 7px' }}>{unread}</span>}</> : <><i className="fas fa-pen" style={{ marginRight: 6 }} />New Message</>}
                  </button>
                ))}
              </div>
              {msgTab === 'inbox' ? (
                <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                  {/* user list */}
                  <div style={{ width: 280, borderRight: '1px solid #eee', display: 'flex', flexDirection: 'column', background: '#fafbff', flexShrink: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 14px', borderBottom: '1px solid #eee' }}>
                      <div style={{ position: 'relative' }}>
                        <i className="fas fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#ccc', fontSize: 12 }} />
                        <input value={msgSearch} onChange={e => setMsgSearch(e.target.value)}
                          placeholder="Search users..." style={{ width: '100%', padding: '7px 10px 7px 30px',
                          border: '1px solid #eee', borderRadius: 20, fontSize: 12, boxSizing: 'border-box',
                          background: 'white', outline: 'none' }} />
                      </div>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                      {filteredUsers.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#ccc', fontSize: 13 }}>No users found</div>}
                      {filteredUsers.map(u => (
                        <div key={u._id} onClick={() => { setSelectedUser(u); fetchConversation(u._id); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer',
                            background: selectedUser?._id === u._id ? '#e8f0fe' : 'transparent',
                            borderLeft: selectedUser?._id === u._id ? '3px solid #ffc107' : '3px solid transparent',
                            transition: 'background .15s',
                          }}>
                          <Avatar name={u.fullName} size={36} img={u.profileImage} />
                          <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.fullName}</div>
                            <div style={{ fontSize: 10, color: '#ffc107', fontWeight: 700, letterSpacing: .3 }}>{roleBadge(u.role).label}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* conversation */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {selectedUser ? (
                      <>
                        <div style={{ padding: '14px 18px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 12, background: 'white' }}>
                          <Avatar name={selectedUser.fullName} size={40} img={selectedUser.profileImage} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: '#1a3a5c' }}>{selectedUser.fullName}</div>
                            <div style={{ fontSize: 11, color: '#ffc107', fontWeight: 700 }}>{roleBadge(selectedUser.role).label}</div>
                          </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12, background: '#f8f9ff' }}>
                          {messages.length === 0 && (
                            <div style={{ textAlign: 'center', color: '#ccc', paddingTop: 40 }}>
                              <i className="fas fa-comments" style={{ fontSize: 32, marginBottom: 8, display: 'block' }} />
                              <div style={{ fontSize: 13 }}>Start a conversation with {selectedUser.fullName}</div>
                            </div>
                          )}
                          {messages.map(m => (
                            <div key={m._id} className={m.senderId === userId ? 'msg-bubble-sent' : 'msg-bubble-received'}>
                              <div>{m.content}</div>
                              <div style={{ fontSize: 10, opacity: .6, marginTop: 4, textAlign: 'right' }}>{fmtTime(m.createdAt)}</div>
                            </div>
                          ))}
                          <div ref={messagesEndRef} />
                        </div>
                        <div style={{ padding: '12px 16px', borderTop: '1px solid #eee', display: 'flex', gap: 10, background: 'white', alignItems: 'flex-end' }}>
                          <textarea value={msgText} onChange={e => setMsgText(e.target.value)}
                            placeholder={`Message ${selectedUser.fullName}...`}
                            rows={2} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                            style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #e0e0e0', borderRadius: 12,
                              resize: 'none', fontFamily: 'inherit', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                          <button onClick={sendMessage} disabled={!msgText.trim()}
                            style={{ width: 42, height: 42, background: msgText.trim() ? '#1a3a5c' : '#ddd',
                              border: 'none', borderRadius: '50%', cursor: msgText.trim() ? 'pointer' : 'default',
                              color: 'white', fontSize: 16, transition: 'all .2s', flexShrink: 0 }}>
                            <i className="fas fa-paper-plane" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#ccc', gap: 12 }}>
                        <i className="fas fa-comments" style={{ fontSize: 48, opacity: .3 }} />
                        <div style={{ fontSize: 14 }}>Select a user to start messaging</div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* compose */
                <div style={{ flex: 1, padding: 28, maxWidth: 600, margin: '0 auto', width: '100%', overflowY: 'auto' }}>
                  <h3 style={{ margin: '0 0 20px', color: '#1a3a5c', fontFamily: 'Georgia, serif' }}>New Message</h3>
                  <Field label="Recipient" required>
                    <Sel value={selectedUser?._id || ''} onChange={e => {
                      const u = msgUsers.find(x => x._id === e.target.value);
                      setSelectedUser(u || null);
                    }}>
                      <option value="">Select a user...</option>
                      {msgUsers.map(u => <option key={u._id} value={u._id}>{u.fullName} — {roleBadge(u.role).label}</option>)}
                    </Sel>
                  </Field>
                  <Field label="Message" required>
                    <Txt value={msgText} onChange={e => setMsgText(e.target.value)} rows={8} placeholder="Type your message..." />
                  </Field>
                  <Btn icon="fas fa-paper-plane" color="#1a3a5c" style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
                    onClick={async () => {
                      if (!selectedUser || !msgText.trim()) { Swal.fire('Error', 'Select recipient and enter message', 'warning'); return; }
                      await sendMessage();
                      Swal.fire('✅ Sent!', '', 'success');
                      setMsgTab('inbox');
                    }}>Send Message</Btn>
                </div>
              )}
            </div>
          )}

          {/* ══ PROFILE ══ */}
          {activeTab === 'profile' && (
            <div style={{ maxWidth: 580, margin: '0 auto' }}>
              <div style={{ background: 'linear-gradient(135deg,#0d1f33,#1a3a5c)', borderRadius: 18, padding: 28, textAlign: 'center', marginBottom: 16, color: 'white' }}>
                <Avatar name={userName} size={68} bg='rgba(255,193,7,.2)' color='#ffc107' />
                <h2 style={{ margin: '12px 0 3px', fontFamily: 'Georgia, serif', fontSize: 20 }}>{userName}</h2>
                <div style={{ fontSize: 11, opacity: .7, letterSpacing: 1 }}>ACCOUNTS ADMINISTRATOR</div>
                <div style={{ fontSize: 12, opacity: .6, marginTop: 4 }}>{localStorage.getItem('userEmail') || 'accounts@essa.rw'}</div>
              </div>
              <div style={{ background: 'white', borderRadius: 14, padding: 22, boxShadow: '0 2px 10px rgba(0,0,0,.05)' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 15, color: '#1a3a5c', fontFamily: 'Georgia, serif' }}><i className="fas fa-lock" style={{ color: '#ffc107', marginRight: 8 }} />Change Password</h3>
                {[['currentPw', 'Current Password'], ['newPw', 'New Password'], ['confirmPw', 'Confirm Password']].map(([id, label]) => (
                  <Field key={id} label={label} required><Inp type="password" id={id} placeholder={`Enter ${label.toLowerCase()}`} /></Field>
                ))}
                <Btn icon="fas fa-key" color="#1a3a5c" onClick={async () => {
                  const cur = document.getElementById('currentPw')?.value;
                  const nw = document.getElementById('newPw')?.value;
                  const cf = document.getElementById('confirmPw')?.value;
                  if (!cur || !nw || !cf) { Swal.fire('Error', 'All fields required', 'warning'); return; }
                  if (nw !== cf) { Swal.fire('Error', 'Passwords do not match', 'error'); return; }
                  try {
                    await api('/user/change-password', { method: 'PUT', body: JSON.stringify({ currentPassword: cur, newPassword: nw }) });
                    Swal.fire('✅ Password Updated!', '', 'success');
                    document.getElementById('currentPw').value = '';
                    document.getElementById('newPw').value = '';
                    document.getElementById('confirmPw').value = '';
                  } catch (e) { Swal.fire('Error', e.message || 'Current password incorrect', 'error'); }
                }}>Update Password</Btn>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ─── MODALS ─── */}
      <Modal open={budgetModal} onClose={() => setBudgetModal(false)} title="Set Total Budget">
        <Field label="Total Budget (RWF)" required><Inp type="number" value={newBudget} placeholder={`Current: ${budget.total?.toLocaleString()} RWF`} onChange={e => setNewBudget(e.target.value)} /></Field>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn onClick={() => setBudgetModal(false)} color="#f0f0f0" textColor="#666">Cancel</Btn>
          <Btn onClick={updateBudget} icon="fas fa-save" color="#1a3a5c">Save Budget</Btn>
        </div>
      </Modal>

      <Modal open={incomeModal} onClose={() => setIncomeModal(false)} title="Record Income">
        <Field label="Source" required><Inp value={incomeForm.source} placeholder="e.g. School Fees, Donation" onChange={e => setIncomeForm(p => ({ ...p, source: e.target.value }))} /></Field>
        <Field label="Amount (RWF)" required><Inp type="number" value={incomeForm.amount} placeholder="0" onChange={e => setIncomeForm(p => ({ ...p, amount: e.target.value }))} /></Field>
        <Field label="Date"><Inp type="date" value={incomeForm.date} onChange={e => setIncomeForm(p => ({ ...p, date: e.target.value }))} /></Field>
        <Field label="Description"><Txt value={incomeForm.description} rows={2} placeholder="Optional notes" onChange={e => setIncomeForm(p => ({ ...p, description: e.target.value }))} /></Field>
        <Field label="Reference"><Inp value={incomeForm.reference} placeholder="Receipt / ref number" onChange={e => setIncomeForm(p => ({ ...p, reference: e.target.value }))} /></Field>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn onClick={() => setIncomeModal(false)} color="#f0f0f0" textColor="#666">Cancel</Btn>
          <Btn onClick={addIncome} icon="fas fa-plus" color="#27ae60" disabled={saving}>{saving ? 'Saving...' : 'Add Income'}</Btn>
        </div>
      </Modal>

      <Modal open={expenseModal} onClose={() => setExpenseModal(false)} title="Record Expense">
        <Field label="Category" required><Inp value={expenseForm.category} placeholder="e.g. Salaries, Utilities" onChange={e => setExpenseForm(p => ({ ...p, category: e.target.value }))} /></Field>
        <Field label="Amount (RWF)" required><Inp type="number" value={expenseForm.amount} placeholder="0" onChange={e => setExpenseForm(p => ({ ...p, amount: e.target.value }))} /></Field>
        <Field label="Date"><Inp type="date" value={expenseForm.date} onChange={e => setExpenseForm(p => ({ ...p, date: e.target.value }))} /></Field>
        <Field label="Description"><Txt value={expenseForm.description} rows={2} placeholder="Optional notes" onChange={e => setExpenseForm(p => ({ ...p, description: e.target.value }))} /></Field>
        <Field label="Reference"><Inp value={expenseForm.reference} placeholder="Receipt / ref number" onChange={e => setExpenseForm(p => ({ ...p, reference: e.target.value }))} /></Field>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn onClick={() => setExpenseModal(false)} color="#f0f0f0" textColor="#666">Cancel</Btn>
          <Btn onClick={addExpense} icon="fas fa-minus" color="#e74c3c" disabled={saving}>{saving ? 'Saving...' : 'Add Expense'}</Btn>
        </div>
      </Modal>

      <Modal open={feeModal} onClose={() => setFeeModal(false)} title="Create Fee Structure">
        <Field label="Fee Type" required><Inp value={feeForm.feeType} placeholder="e.g. Tuition, Lab Fee" onChange={e => setFeeForm(p => ({ ...p, feeType: e.target.value }))} /></Field>
        <Field label="Amount (RWF)" required><Inp type="number" value={feeForm.amount} placeholder="0" onChange={e => setFeeForm(p => ({ ...p, amount: e.target.value }))} /></Field>
        <Field label="Class">
          <Sel value={feeForm.classId} onChange={e => setFeeForm(p => ({ ...p, classId: e.target.value }))}>
            <option value="">All Classes</option>
            {classes.map(c => <option key={c._id} value={c._id}>{c.grade} {c.className}</option>)}
          </Sel>
        </Field>
        <Field label="Due Date"><Inp type="date" value={feeForm.dueDate} onChange={e => setFeeForm(p => ({ ...p, dueDate: e.target.value }))} /></Field>
        <Field label="Description"><Txt value={feeForm.description} rows={2} placeholder="Optional" onChange={e => setFeeForm(p => ({ ...p, description: e.target.value }))} /></Field>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn onClick={() => setFeeModal(false)} color="#f0f0f0" textColor="#666">Cancel</Btn>
          <Btn onClick={createFee} icon="fas fa-tag" color="#3498db" disabled={saving}>{saving ? 'Saving...' : 'Create Fee'}</Btn>
        </div>
      </Modal>

      <Modal open={paymentModal} onClose={() => setPaymentModal(false)} title="Record Fee Payment">
        <Field label="Student" required>
          <Sel value={paymentForm.studentId} onChange={e => setPaymentForm(p => ({ ...p, studentId: e.target.value }))}>
            <option value="">Select student...</option>
            {students.map(s => <option key={s._id} value={s._id}>{s.fullName} ({s.studentId || ''})</option>)}
          </Sel>
        </Field>
        <Field label="Fee Type">
          <Sel value={paymentForm.feeType} onChange={e => setPaymentForm(p => ({ ...p, feeType: e.target.value }))}>
            <option value="">Select fee type...</option>
            {feeStructures.map(f => <option key={f._id} value={f.feeType}>{f.feeType} — {fmtAmt(f.amount)}</option>)}
          </Sel>
        </Field>
        <Field label="Amount (RWF)" required><Inp type="number" value={paymentForm.amount} placeholder="0" onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))} /></Field>
        <Field label="Payment Date"><Inp type="date" value={paymentForm.paymentDate} onChange={e => setPaymentForm(p => ({ ...p, paymentDate: e.target.value }))} /></Field>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn onClick={() => setPaymentModal(false)} color="#f0f0f0" textColor="#666">Cancel</Btn>
          <Btn onClick={recordPayment} icon="fas fa-credit-card" color="#27ae60" disabled={saving}>{saving ? 'Saving...' : 'Record Payment'}</Btn>
        </div>
      </Modal>

      <Modal open={salaryModal} onClose={() => setSalaryModal(false)} title="Add Salary Record">
        <Field label="Teacher Name" required><Inp value={salaryForm.teacherName} placeholder="Full name" onChange={e => setSalaryForm(p => ({ ...p, teacherName: e.target.value }))} /></Field>
        <Field label="Subject"><Inp value={salaryForm.subject} placeholder="e.g. Mathematics" onChange={e => setSalaryForm(p => ({ ...p, subject: e.target.value }))} /></Field>
        <Field label="Amount (RWF)" required><Inp type="number" value={salaryForm.amount} placeholder="0" onChange={e => setSalaryForm(p => ({ ...p, amount: e.target.value }))} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Month"><Inp value={salaryForm.month} placeholder="e.g. January" onChange={e => setSalaryForm(p => ({ ...p, month: e.target.value }))} /></Field>
          <Field label="Year"><Inp type="number" value={salaryForm.year} onChange={e => setSalaryForm(p => ({ ...p, year: parseInt(e.target.value) }))} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn onClick={() => setSalaryModal(false)} color="#f0f0f0" textColor="#666">Cancel</Btn>
          <Btn onClick={addSalary} icon="fas fa-wallet" color="#9b59b6" disabled={saving}>{saving ? 'Saving...' : 'Add Salary'}</Btn>
        </div>
      </Modal>
    </div>
  );
};

export default AccountsAdminDashboard;