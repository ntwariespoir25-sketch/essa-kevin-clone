import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';

const API_URL = import.meta.env.VITE_API_URL;

const strengthOf = (password) => {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
};

const LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
const COLOURS = ['#dc3545', '#fd7e14', '#ffc107', '#20c997', '#198754'];

// Rendered instead of the dashboard whenever the account still owes a password
// change. The backend refuses every other endpoint for such a token, so this
// is the only page that will load until a new password is set.
const ChangePasswordPage = () => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const isFirstLogin = localStorage.getItem('mustSetPassword') === 'true';
  const userName = localStorage.getItem('userName') || 'there';
  const strength = strengthOf(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('portalToken')}`
        },
        body: JSON.stringify({ newPassword: password })
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Could not change your password');
        return;
      }

      // The old token carried the pending flag, so swap in the fresh one.
      localStorage.setItem('portalToken', data.token);
      localStorage.removeItem('mustSetPassword');
      localStorage.setItem('mustChangePassword', 'false');

      Swal.fire({
        title: 'Password updated',
        text: 'Your account is now ready to use.',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });

      setTimeout(() => {
        const dashboards = {
          super_admin: '/portal/super-admin',
          academic_admin: '/portal/academic-admin',
          discipline_admin: '/portal/discipline-admin',
          accounts_admin: '/portal/accounts-admin',
          teacher: '/portal/teacher',
          student: '/portal/student',
          parent: '/portal/parent'
        };
        navigate(dashboards[localStorage.getItem('userRole')] || '/portal/login');
      }, 1500);
    } catch {
      setError('Connection error. Please check your internet connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = () => {
    ['portalToken', 'userRole', 'userName', 'userEmail', 'userId', 'mustSetPassword', 'mustChangePassword']
      .forEach(k => localStorage.removeItem(k));
    navigate('/portal/login');
  };

  return (
    <div className="change-password-container">
      <div className="change-password-card">
        <div className="change-password-icon">
          <i className="fas fa-key" aria-hidden="true" />
        </div>

        <h1>{isFirstLogin ? 'Choose your password' : 'Change your password'}</h1>
        <p className="change-password-lead">
          {isFirstLogin
            ? `Welcome, ${userName}. Your SDMS code gets you this far, but it is not a secret you should keep using. Set a password of your own to finish signing in.`
            : 'You must set a new password before you can continue.'}
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="cp-field">
            <label htmlFor="cp-new">New password</label>
            <input
              id="cp-new"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
              required
            />
            {password && (
              <div className="cp-strength" aria-live="polite">
                <div className="cp-strength-bar">
                  <div
                    className="cp-strength-fill"
                    style={{ width: `${(strength / 4) * 100}%`, background: COLOURS[strength] }}
                  />
                </div>
                <span style={{ color: COLOURS[strength] }}>{LABELS[strength]}</span>
              </div>
            )}
          </div>

          <div className="cp-field">
            <label htmlFor="cp-confirm">Confirm new password</label>
            <input
              id="cp-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          {error && (
            <p className="cp-error" role="alert">
              <i className="fas fa-exclamation-circle" aria-hidden="true" /> {error}
            </p>
          )}

          <button type="submit" className="cp-submit" disabled={isLoading}>
            {isLoading ? (
              <i className="fas fa-spinner fa-spin" aria-hidden="true" />
            ) : (
              <>
                <span>Save and continue</span>
                <i className="fas fa-arrow-right" aria-hidden="true" />
              </>
            )}
          </button>
        </form>

        <button type="button" className="cp-signout" onClick={handleSignOut}>
          Sign out instead
        </button>
      </div>

      <style>{`
        .change-password-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
          background: linear-gradient(135deg, #1a3a5c 0%, #2c5f8a 100%);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI',
            Roboto, sans-serif;
        }

        .change-password-card {
          width: 100%;
          max-width: 460px;
          background: #fff;
          border-radius: 20px;
          padding: 2.5rem;
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.25);
        }

        .change-password-icon {
          width: 60px;
          height: 60px;
          margin: 0 auto 1.25rem;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 193, 7, 0.15);
          color: #b8930a;
          font-size: 1.5rem;
        }

        .change-password-card h1 {
          text-align: center;
          font-size: 1.5rem;
          color: #1a3a5c;
          margin-bottom: 0.5rem;
        }

        .change-password-lead {
          text-align: center;
          font-size: 0.9rem;
          color: #6c757d;
          line-height: 1.55;
          margin-bottom: 1.75rem;
        }

        .cp-field {
          margin-bottom: 1.1rem;
        }

        .cp-field label {
          display: block;
          font-size: 0.82rem;
          font-weight: 600;
          color: #495057;
          margin-bottom: 0.4rem;
        }

        .cp-field input {
          width: 100%;
          padding: 12px 14px;
          border: 1.5px solid #e9ecef;
          border-radius: 10px;
          font-size: 0.95rem;
          background: #f8f9fc;
        }

        .cp-field input:focus {
          outline: none;
          border-color: #ffc107;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(255, 193, 7, 0.15);
        }

        .cp-strength {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .cp-strength-bar {
          flex: 1;
          height: 5px;
          background: #e9ecef;
          border-radius: 3px;
          overflow: hidden;
        }

        .cp-strength-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.25s ease, background 0.25s ease;
        }

        .cp-error {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.85rem;
          color: #dc3545;
          background: #f8d7da;
          border-radius: 8px;
          padding: 10px 12px;
          margin-bottom: 1rem;
        }

        .cp-submit {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #1a3a5c 0%, #2c5f8a 100%);
          color: #fff;
          border: none;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .cp-submit:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .cp-signout {
          display: block;
          width: 100%;
          margin-top: 1rem;
          background: none;
          border: none;
          color: #6c757d;
          font-size: 0.85rem;
          cursor: pointer;
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
};

export default ChangePasswordPage;
