import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Swal from 'sweetalert2';
import campusBg from '../assets/campus.png';

const API_URL = import.meta.env.VITE_API_URL;

const SetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!token) {
      Swal.fire({
        title: 'Invalid Link',
        text: 'This setup link is missing its token. Please contact the school administration.',
        icon: 'error',
        confirmButtonColor: '#1a3a5c',
      });
      return;
    }

    if (password.length < 6) {
      Swal.fire({
        title: 'Weak Password',
        text: 'Password must be at least 6 characters.',
        icon: 'warning',
        confirmButtonColor: '#1a3a5c',
      });
      return;
    }

    if (password !== confirmPassword) {
      Swal.fire({
        title: 'Password Mismatch',
        text: 'The two passwords do not match.',
        icon: 'warning',
        confirmButtonColor: '#1a3a5c',
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();

      if (response.ok) {
        Swal.fire({
          title: 'Password Set!',
          text: 'Your password has been set. You can now login.',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false,
        });
        setTimeout(() => navigate('/portal/login'), 1500);
      } else {
        Swal.fire({
          title: 'Setup Failed',
          text: data.message || 'Unable to set password.',
          icon: 'error',
          confirmButtonColor: '#1a3a5c',
        });
      }
    } catch {
      Swal.fire({
        title: 'Connection Error',
        text: 'Please check your internet connection and try again.',
        icon: 'error',
        confirmButtonColor: '#1a3a5c',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="portal-login-container">
      <div
        className="portal-login-left"
        style={{ backgroundImage: `url(${campusBg})` }}
      >
        <div className="overlay" />
        <div className="brand-section">
          <div className="school-badge">
            <i className="fas fa-graduation-cap" aria-hidden="true" />
            <h1>ESSA Nyarugunga</h1>
          </div>
          <p className="tagline">
            École Secondaire des Sciences et Administrative
          </p>
          <div className="brand-divider" />
          <div className="quote">
            <i className="fas fa-quote-left" aria-hidden="true" />
            <p>Shaping Futures, Building Leaders</p>
          </div>
        </div>
      </div>

      <div className="portal-login-right">
        <div className="login-box">
          <div className="login-header">
            <h2>Set Your Password</h2>
            <p>Activate your account with a password only you know</p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="input-field">
              <i className="fas fa-lock" aria-hidden="true" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="New Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={6}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <i
                  className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}
                  aria-hidden="true"
                />
              </button>
            </div>

            <div className="input-field">
              <i className="fas fa-lock" aria-hidden="true" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={6}
              />
            </div>

            <button type="submit" className="login-button" disabled={isLoading}>
              {isLoading ? (
                <i className="fas fa-spinner fa-spin" aria-hidden="true" />
              ) : (
                <>
                  <span>Set Password</span>
                  <i className="fas fa-arrow-right" aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <div className="login-footer">
            <p>
              <i className="fas fa-shield-alt" aria-hidden="true" />
              Your password is hashed and never shared
            </p>
            <p className="copyright">
              &copy; {new Date().getFullYear()} ESSA Nyarugunga School
            </p>
          </div>
        </div>
      </div>

      <style>{`
        *,
        *::before,
        *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .portal-login-container {
          display: flex;
          min-height: 100vh;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI',
            Roboto, sans-serif;
        }

        .portal-login-left {
          flex: 1;
          position: relative;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          overflow: hidden;
        }

        .overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            135deg,
            hsla(220, 60%, 18%, 0.80) 0%,
            hsla(45, 90%, 70%, 0.45) 100%
          );
          z-index: 1;
        }

        .brand-section {
          text-align: center;
          color: #fff;
          position: relative;
          z-index: 2;
          max-width: 400px;
        }

        .school-badge {
          margin-bottom: 1.5rem;
        }

        .school-badge i {
          font-size: 3.5rem;
          color: #ffc107;
          margin-bottom: 0.5rem;
          display: inline-block;
        }

        .school-badge h1 {
          font-size: 2rem;
          font-weight: 700;
          letter-spacing: -0.5px;
        }

        .tagline {
          font-size: 0.875rem;
          opacity: 0.9;
          margin-bottom: 2rem;
          line-height: 1.5;
        }

        .brand-divider {
          width: 60px;
          height: 3px;
          background: #ffc107;
          margin: 0 auto 2rem;
        }

        .quote i {
          font-size: 1.5rem;
          color: #ffc107;
          opacity: 0.6;
          margin-bottom: 0.5rem;
          display: block;
        }

        .quote p {
          font-size: 1rem;
          font-style: italic;
          font-weight: 300;
        }

        .portal-login-right {
          flex: 1;
          background: #f8f9fc;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }

        .login-box {
          width: 100%;
          max-width: 420px;
          background: #fff;
          border-radius: 24px;
          padding: 2.5rem;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.08);
          animation: fadeInUp 0.45s ease both;
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .login-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .login-header h2 {
          font-size: 1.75rem;
          color: #1a3a5c;
          margin-bottom: 0.4rem;
          font-weight: 700;
        }

        .login-header p {
          color: #6c757d;
          font-size: 0.875rem;
        }

        .input-field {
          position: relative;
          margin-bottom: 1.2rem;
        }

        .input-field > i {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: #adb5bd;
          font-size: 1rem;
          pointer-events: none;
          transition: color 0.25s ease;
          z-index: 1;
        }

        .input-field:focus-within > i {
          color: #ffc107;
        }

        .input-field input {
          width: 100%;
          padding: 13px 46px 13px 46px;
          border: 1.5px solid #e9ecef;
          border-radius: 12px;
          font-size: 0.925rem;
          background: #f8f9fc;
          color: #212529;
          transition: border-color 0.25s ease, background 0.25s ease,
            box-shadow 0.25s ease;
        }

        .input-field input::placeholder {
          color: #adb5bd;
          opacity: 1;
          transition: color 0.25s ease, opacity 0.25s ease;
        }

        .input-field input:hover {
          border-color: #ffc107;
          background: #fff;
        }

        .input-field input:focus {
          outline: none;
          border-color: #ffc107;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(255, 193, 7, 0.15);
        }

        .password-toggle {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: #adb5bd;
          font-size: 1rem;
          padding: 4px;
          line-height: 1;
        }

        .password-toggle:hover {
          color: #1a3a5c;
        }

        .login-button {
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
          transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
          margin-bottom: 1.5rem;
        }

        .login-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 18px rgba(26, 58, 92, 0.3);
        }

        .login-button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .login-footer {
          text-align: center;
          padding-top: 1rem;
          border-top: 1px solid #e9ecef;
        }

        .login-footer p {
          font-size: 0.75rem;
          color: #6c757d;
        }

        .login-footer i {
          margin-right: 5px;
        }

        .copyright {
          margin-top: 0.4rem;
          font-size: 0.7rem;
        }

        @media (max-width: 768px) {
          .portal-login-container {
            flex-direction: column;
          }

          .portal-login-left {
            min-height: 40vh;
            padding: 2rem 1.5rem;
          }

          .login-box {
            padding: 1.75rem;
          }
        }

        @media (max-width: 480px) {
          .portal-login-left {
            min-height: 35vh;
          }

          .login-box {
            padding: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
};

export default SetPasswordPage;