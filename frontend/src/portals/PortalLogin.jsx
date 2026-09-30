import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL;

const BG =
  'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1600&q=80';

const DASHBOARDS = {
  super_admin: '/portal/super-admin',
  academic_admin: '/portal/academic-admin',
  discipline_admin: '/portal/discipline-admin',
  accounts_admin: '/portal/accounts-admin',
  teacher: '/portal/teacher',
  student: '/portal/student',
  parent: '/portal/parent',
};

const TABS = [
  { id: 'email', label: 'Email', icon: 'fa-envelope' },
  { id: 'sdms', label: 'Student', icon: 'fa-id-card' },
  { id: 'otp', label: 'Parent', icon: 'fa-mobile-screen-button' },
];

const COPY = {
  email: ['Sign in', 'Use the email address and password linked to your school account.'],
  sdms: ['Student sign in', 'Enter the SDMS code printed on your student card.'],
  otp: ['Parent sign in', 'We send a 6-digit code to the phone number the school has on file.'],
};

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  remove: (k) => { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

const saveSession = (d) => {
  store.set('portalToken', d.token);
  store.set('userRole', d.role);
  store.set('userName', d.fullName);
  store.set('userEmail', d.email || '');
  store.set('userId', d._id);
  store.set('mustChangePassword', d.mustChangePassword ? 'true' : 'false');
};

async function post(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON response */ }
  return { ok: res.ok, data };
}

/* ── Small building blocks ───────────────────────────── */

const Field = ({ id, label, icon, hint, action, children }) => (
  <div className="pl-field">
    <div className="pl-label-row">
      <label htmlFor={id}>{label}</label>
      {action}
    </div>
    <div className="pl-control">
      <i className={`fas ${icon} pl-icon`} aria-hidden="true" />
      {children}
    </div>
    {hint && <p className="pl-hint">{hint}</p>}
  </div>
);

const PasswordInput = ({ id, value, onChange, placeholder, autoComplete }) => {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  return (
    <>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={onChange}
        onKeyUp={(e) => setCaps(e.getModifierState && e.getModifierState('CapsLock'))}
        onBlur={() => setCaps(false)}
      />
      <button
        type="button"
        className="pl-toggle"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        <i className={`fas ${show ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true" />
      </button>
      {caps && <span className="pl-caps">Caps Lock is on</span>}
    </>
  );
};

const SubmitButton = ({ loading, loadingText, children }) => (
  <button type="submit" className="pl-btn" disabled={loading}>
    {loading ? (
      <><i className="fas fa-spinner fa-spin" aria-hidden="true" /><span>{loadingText}</span></>
    ) : children}
  </button>
);

/* ── Page ────────────────────────────────────────────── */

const PortalLogin = () => {
  const navigate = useNavigate();

  const [mode, setMode] = useState(() => {
    const saved = store.get('portalLoginMode');
    return TABS.some((t) => t.id === saved) ? saved : 'email';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [sdmsCode, setSdmsCode] = useState('');
  const [sdmsPassword, setSdmsPassword] = useState('');

  const [otpPhone, setOtpPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    const remembered = store.get('rememberedEmail');
    if (remembered) { setEmail(remembered); setRememberMe(true); }
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const switchMode = (id) => {
    setMode(id);
    setError('');
    setInfo('');
    store.set('portalLoginMode', id);
  };

  const run = async (fn) => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      await fn();
    } catch {
      setError('We could not reach the server. Check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  /* Email */
  const handleLogin = (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter both your email address and your password.');
      return;
    }
    run(async () => {
      const { ok, data } = await post('/api/auth/login', { email: email.trim(), password });
      if (!ok) { setError(data.message || 'The email or password is incorrect.'); return; }

      saveSession(data);
      store.remove('mustSetPassword');
      if (rememberMe) store.set('rememberedEmail', email.trim());
      else store.remove('rememberedEmail');

      navigate(data.mustChangePassword ? '/portal/change-password' : DASHBOARDS[data.role] || '/portal/login');
    });
  };

  /* Student (SDMS) */
  const handleSdmsLogin = (e) => {
    e.preventDefault();
    if (!sdmsCode.trim()) { setError('Enter the SDMS code from your student card.'); return; }
    run(async () => {
      const { ok, data } = await post('/api/auth/student/login', {
        sdmsCode: sdmsCode.trim(),
        password: sdmsPassword || undefined,
      });
      if (!ok) { setError(data.message || 'That SDMS code or password is not correct.'); return; }

      saveSession(data);
      store.set('mustSetPassword', data.mustSetPassword ? 'true' : 'false');
      navigate(data.mustSetPassword || data.mustChangePassword ? '/portal/change-password' : '/portal/student');
    });
  };

  /* Parent (OTP) */
  const requestOtp = () => {
    const phone = otpPhone.replace(/[\s-]/g, '');
    if (!phone) { setError('Enter the phone number the school has on file for you.'); return; }
    run(async () => {
      const { ok, data } = await post('/api/parent/request-otp', { phone });
      if (!ok) { setError(data.message || 'We could not send a code to that number.'); return; }
      setOtpSent(true);
      setOtpCode('');
      setResendIn(30);
      setInfo(data.devOtp ? `Test mode: your code is ${data.devOtp}.` : `Code sent to ${data.maskedPhone || 'your phone'}.`);
    });
  };

  const verifyOtp = (code) => {
    const phone = otpPhone.replace(/[\s-]/g, '');
    if (code.length !== 6) { setError('Enter all 6 digits of the code.'); return; }
    run(async () => {
      const { ok, data } = await post('/api/parent/verify-otp', { phone, otp: code });
      if (!ok) {
        setOtpCode('');
        setError(data.message || 'The code is wrong or has expired. Check it or request a new one.');
        return;
      }
      saveSession(data);
      navigate('/portal/parent');
    });
  };

  const handleOtpSubmit = (e) => {
    e.preventDefault();
    if (otpSent) verifyOtp(otpCode); else requestOtp();
  };

  const onCodeChange = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtpCode(v);
    if (v.length === 6 && !loading) verifyOtp(v);
  };

  const changePhone = () => {
    setOtpSent(false);
    setOtpCode('');
    setError('');
    setInfo('');
    setResendIn(0);
  };

  const [title, subtitle] = COPY[mode];

  return (
    <div className="pl-root">
      <aside className="pl-brand" style={{ backgroundImage: `url(${BG})` }}>
        <div className="pl-brand-veil" />
        <div className="pl-brand-inner">
          {/* ── Brand head ─────────────────────────── */}
          <div className="pl-brand-head">
            <span className="pl-logo"><i className="fas fa-graduation-cap" aria-hidden="true" /></span>
            <div>
              <strong>ESSA Nyarugunga</strong>
              <small>École Secondaire des Sciences et Administrative</small>
            </div>
          </div>

          {/* ── Hero copy ──────────────────────────── */}
          <div className="pl-hero">
            <span className="pl-eyebrow">
              <span className="pl-eyebrow-dot" aria-hidden="true" />
              Official School Portal
            </span>

            <h2>Grades, attendance and school news in one place.</h2>
            <p>
              Students, parents and staff each have their own way in — pick the right tab
              and sign in with the credentials the school gave you.
            </p>

            {/* Feature list */}
            <ul className="pl-features">
              <li>
                <i className="fas fa-chart-line" aria-hidden="true" />
                <div>
                  <strong>Live results &amp; attendance</strong>
                  <span>See updates the moment teachers post them</span>
                </div>
              </li>
              <li>
                <i className="fas fa-users" aria-hidden="true" />
                <div>
                  <strong>Separate access for every role</strong>
                  <span>Students, parents and staff each get their own view</span>
                </div>
              </li>
              <li>
                <i className="fas fa-bell" aria-hidden="true" />
                <div>
                  <strong>School announcements</strong>
                  <span>Events, exams and closures delivered in the portal</span>
                </div>
              </li>
              <li>
                <i className="fas fa-lock" aria-hidden="true" />
                <div>
                  <strong>Private and secure</strong>
                  <span>Encrypted connection, expiring sessions</span>
                </div>
              </li>
            </ul>

            {/* Trust / stats row */}
            <div className="pl-stats" role="list" aria-label="Portal facts">
              <div role="listitem">
                <strong>800+</strong>
                <span>Students enrolled</span>
              </div>
              <div role="listitem">
                <strong>30+</strong>
                <span>Teachers on staff</span>
              </div>
              <div role="listitem">
                <strong>24/7</strong>
                <span>Portal availability</span>
              </div>
            </div>

            {/* Support note */}
            <div className="pl-support">
              <i className="fas fa-headset" aria-hidden="true" />
              <p>
                Locked out or lost your SDMS card?{' '}
                <Link to="/contact">Contact the school office</Link> — we'll help you get back in.
              </p>
            </div>
          </div>

          {/* ── Footer ─────────────────────────────── */}
          <div className="pl-footnote">
            <p className="pl-copy">© {new Date().getFullYear()} ESSA Nyarugunga. All rights reserved.</p>
            <p className="pl-langs">Kinyarwanda · English · Français</p>
          </div>
        </div>
      </aside>

      <main className="pl-main">
        <div className="pl-shell">
          <nav className="pl-topnav">
            <Link to="/"><i className="fas fa-arrow-left" aria-hidden="true" />Back to website</Link>
            <Link to="/contact"><i className="fas fa-circle-question" aria-hidden="true" />Need help?</Link>
          </nav>

          <section className="pl-card">
            <h1>{title}</h1>
            <p className="pl-sub">{subtitle}</p>

            <div className="pl-tabs" role="tablist" aria-label="Choose how you sign in">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === t.id}
                  className={mode === t.id ? 'active' : ''}
                  onClick={() => switchMode(t.id)}
                >
                  <i className={`fas ${t.icon}`} aria-hidden="true" />
                  {t.label}
                </button>
              ))}
            </div>

            <div aria-live="polite">
              {error && <div className="pl-msg pl-error" role="alert"><i className="fas fa-circle-exclamation" aria-hidden="true" />{error}</div>}
              {info && !error && <div className="pl-msg pl-info"><i className="fas fa-circle-check" aria-hidden="true" />{info}</div>}
            </div>

            {mode === 'email' && (
              <form onSubmit={handleLogin} noValidate className="pl-form">
                <Field id="email" label="Email address" icon="fa-envelope">
                  <input
                    id="email" type="email" inputMode="email" placeholder="you@essanyarugunga.rw"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email" autoCapitalize="none" spellCheck="false"
                  />
                </Field>

                <Field
                  id="password" label="Password" icon="fa-lock"
                  action={<button type="button" className="pl-link" onClick={() => setShowHelp((v) => !v)} aria-expanded={showHelp}>Forgot password?</button>}
                >
                  <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" />
                </Field>

                {showHelp && (
                  <div className="pl-msg pl-info">
                    <i className="fas fa-circle-info" aria-hidden="true" />
                    <span>Passwords are reset by your school administrator. <Link to="/contact">Contact the school</Link> and they will set a temporary one for you.</span>
                  </div>
                )}

                <label className="pl-check">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                  <span className="pl-box" aria-hidden="true" />
                  Remember my email on this device
                </label>

                <SubmitButton loading={loading} loadingText="Signing in…">Sign in</SubmitButton>
              </form>
            )}

            {mode === 'sdms' && (
              <form onSubmit={handleSdmsLogin} noValidate className="pl-form">
                <Field id="sdmsCode" label="SDMS code" icon="fa-id-card" hint="Printed on the front of your student card.">
                  <input
                    id="sdmsCode" type="text" placeholder="A3F9-K2M7"
                    value={sdmsCode} onChange={(e) => setSdmsCode(e.target.value.toUpperCase())}
                    autoComplete="off" autoCapitalize="characters" spellCheck="false"
                  />
                </Field>

                <Field id="sdmsPassword" label="Password" icon="fa-lock" hint="First time signing in? Leave this empty. You will choose a password next.">
                  <PasswordInput id="sdmsPassword" value={sdmsPassword} onChange={(e) => setSdmsPassword(e.target.value)} placeholder="Leave empty on first login" autoComplete="current-password" />
                </Field>

                <SubmitButton loading={loading} loadingText="Signing in…">Continue</SubmitButton>
              </form>
            )}

            {mode === 'otp' && (
              <form onSubmit={handleOtpSubmit} noValidate className="pl-form">
                <p className="pl-step">{otpSent ? 'Step 2 of 2: Enter the code' : 'Step 1 of 2: Your phone number'}</p>

                <Field id="otpPhone" label="Phone number" icon="fa-mobile-screen-button" hint={!otpSent ? 'Use the number you gave the school, for example 0788 000 000.' : null}>
                  <input
                    id="otpPhone" type="tel" inputMode="tel" placeholder="0788 000 000"
                    value={otpPhone} onChange={(e) => setOtpPhone(e.target.value)}
                    autoComplete="tel" disabled={otpSent}
                  />
                </Field>

                {otpSent && (
                  <>
                    <Field id="otpCode" label="6-digit code" icon="fa-key">
                      <input
                        id="otpCode" type="text" inputMode="numeric" maxLength={6}
                        placeholder="000000" className="pl-otp"
                        value={otpCode} onChange={onCodeChange}
                        autoComplete="one-time-code" autoFocus
                      />
                    </Field>
                    <div className="pl-row">
                      <button type="button" className="pl-link" onClick={changePhone}>Use a different number</button>
                      <button type="button" className="pl-link" onClick={requestOtp} disabled={resendIn > 0 || loading}>
                        {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                      </button>
                    </div>
                  </>
                )}

                <SubmitButton loading={loading} loadingText={otpSent ? 'Checking code…' : 'Sending code…'}>
                  {otpSent ? 'Verify and sign in' : 'Send code'}
                </SubmitButton>
              </form>
            )}

            <p className="pl-legal">
              By signing in you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
            </p>
          </section>
        </div>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;800&display=swap');

        .pl-root, .pl-root *, .pl-root *::before, .pl-root *::after { box-sizing: border-box; }
        .pl-root {
          --navy: #12294a; --navy-deep: #0b1b33; --gold: #e8b931; --gold-ink: #7a5a00;
          --ink: #0f172a; --muted: #5b6678; --line: #d9e0ea; --paper: #f4f6fa;
          --bad: #b42318; --bad-bg: #fef3f2; --info-bg: #eef4ff;
          --gap: clamp(.5rem, 1.9vh, 1.1rem);
          --ctl: clamp(38px, 6vh, 48px);
          --pad: clamp(.9rem, 3.2vh, 2rem);
          position: fixed; inset: 0;
          display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr);
          overflow: hidden;
          font-family: 'Public Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
          color: var(--ink); background: var(--paper);
          -webkit-font-smoothing: antialiased;
        }
        .pl-root h1, .pl-root h2, .pl-root p, .pl-root ul { margin: 0; padding: 0; }
        .pl-root a { color: inherit; }
        .pl-root :focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }

        /* ═════════ BRAND PANEL ═════════ */
        .pl-brand { position: relative; min-height: 0; overflow: hidden; background-size: cover; background-position: center; background-color: var(--navy-deep); color: #fff; display: flex; }
        .pl-brand-veil {
          position: absolute; inset: 0;
          background:
            linear-gradient(160deg, rgba(11,27,51,.96) 0%, rgba(18,41,74,.92) 55%, rgba(18,41,74,.82) 100%),
            radial-gradient(circle at 80% 15%, rgba(232,185,49,.16) 0%, transparent 55%);
        }
        .pl-brand-inner {
          position: relative; width: 100%; max-width: 560px; margin: 0 auto; min-height: 0;
          padding: clamp(1.25rem, 4.5vh, 3rem) clamp(1.5rem, 3vw, 2.75rem);
          display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;
        }

        /* Head */
        .pl-brand-head { display: flex; align-items: center; gap: 14px; padding-bottom: clamp(.75rem, 2vh, 1.25rem); border-bottom: 1px solid rgba(255,255,255,.08); }
        .pl-logo { width: clamp(38px, 6vh, 48px); height: clamp(38px, 6vh, 48px); border-radius: 12px; background: var(--gold); color: var(--navy); display: grid; place-items: center; font-size: 1.2rem; flex-shrink: 0; }
        .pl-brand-head strong { display: block; font-size: 1.1rem; font-weight: 700; letter-spacing: -.01em; }
        .pl-brand-head small { display: block; font-size: .74rem; color: rgba(255,255,255,.62); margin-top: 2px; letter-spacing: .02em; }

        /* Hero */
        .pl-hero { display: flex; flex-direction: column; gap: clamp(.7rem, 2.2vh, 1.25rem); flex: 1; min-height: 0; justify-content: center; }

        .pl-eyebrow {
          display: inline-flex; align-items: center; gap: 8px; align-self: flex-start;
          font-size: .68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .14em;
          color: var(--gold);
          padding: 5px 12px; border-radius: 20px;
          background: rgba(232,185,49,.12); border: 1px solid rgba(232,185,49,.28);
        }
        .pl-eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 0 4px rgba(232,185,49,.2); animation: plPulse 1.8s ease-in-out infinite; }
        @keyframes plPulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.5; transform:scale(1.3); } }

        .pl-hero h2 { font-size: clamp(1.4rem, .95rem + 2.2vh, 2.05rem); font-weight: 800; line-height: 1.16; letter-spacing: -.022em; max-width: 15em; }
        .pl-hero > p { color: rgba(255,255,255,.75); line-height: 1.55; max-width: 34em; font-size: .9rem; }

        /* Feature list (enriched) */
        .pl-features { list-style: none; display: grid; gap: clamp(.45rem, 1.4vh, .7rem); margin-top: clamp(.4rem, 1.4vh, .8rem); }
        .pl-features li {
          display: flex; align-items: flex-start; gap: 12px;
          padding: clamp(.55rem, 1.6vh, .75rem) clamp(.7rem, 1.6vw, .9rem);
          background: rgba(255,255,255,.05);
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 11px;
          transition: background .2s, border-color .2s, transform .2s;
        }
        .pl-features li:hover { background: rgba(255,255,255,.09); border-color: rgba(232,185,49,.32); transform: translateX(3px); }
        .pl-features li i { flex-shrink: 0; width: 32px; height: 32px; border-radius: 9px; background: rgba(232,185,49,.14); color: var(--gold); display: grid; place-items: center; font-size: .85rem; margin-top: 1px; }
        .pl-features li > div { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .pl-features li strong { font-size: .84rem; font-weight: 700; color: #fff; }
        .pl-features li span { font-size: .74rem; color: rgba(255,255,255,.66); line-height: 1.35; }

        /* Stats row (new) */
        .pl-stats {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(.4rem, 1.2vw, .75rem);
          margin-top: clamp(.3rem, 1.2vh, .65rem);
          padding-top: clamp(.55rem, 1.6vh, .9rem);
          border-top: 1px solid rgba(255,255,255,.08);
        }
        .pl-stats > div { display: flex; flex-direction: column; gap: 1px; }
        .pl-stats strong { font-size: clamp(1rem, .6rem + 1.2vh, 1.25rem); font-weight: 800; color: var(--gold); letter-spacing: -.02em; }
        .pl-stats span { font-size: .68rem; text-transform: uppercase; letter-spacing: .08em; color: rgba(255,255,255,.55); }

        /* Support note (new) */
        .pl-support {
          display: flex; gap: 10px; align-items: flex-start;
          padding: clamp(.55rem, 1.6vh, .8rem) clamp(.7rem, 1.6vw, .9rem);
          background: rgba(232,185,49,.06);
          border: 1px solid rgba(232,185,49,.2);
          border-radius: 11px;
          margin-top: clamp(.3rem, 1.2vh, .65rem);
        }
        .pl-support i { color: var(--gold); margin-top: 3px; font-size: .85rem; }
        .pl-support p { font-size: .8rem; line-height: 1.5; color: rgba(255,255,255,.8); }
        .pl-support a { font-weight: 700; color: var(--gold); text-decoration: underline; text-underline-offset: 3px; }
        .pl-support a:hover { color: #fff; }

        /* Footnote */
        .pl-footnote { display: flex; flex-direction: column; gap: 4px; padding-top: clamp(.5rem, 1.5vh, 1rem); border-top: 1px solid rgba(255,255,255,.08); }
        .pl-copy { font-size: .72rem; color: rgba(255,255,255,.5); }
        .pl-langs { font-size: .68rem; letter-spacing: .12em; text-transform: uppercase; color: rgba(255,255,255,.35); }

        /* ═════════ FORM PANEL ═════════ */
        .pl-main { min-height: 0; overflow: hidden; display: flex; justify-content: center; align-items: center; padding: clamp(.6rem, 2.5vh, 2rem) 1.5rem; }
        .pl-shell { width: 100%; max-width: 440px; max-height: 100%; min-height: 0; display: flex; flex-direction: column; }
        .pl-topnav { display: flex; justify-content: space-between; margin-bottom: clamp(.25rem, 1.2vh, 1rem); }
        .pl-topnav a { display: inline-flex; align-items: center; gap: 8px; font-size: .84rem; font-weight: 600; color: var(--muted); text-decoration: none; padding: 6px 10px; margin: 0 -10px; border-radius: 8px; }
        .pl-topnav a:hover { color: var(--navy); background: #e6ebf3; }

        .pl-card { min-height: 0; overflow: hidden; background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: var(--pad); box-shadow: 0 10px 30px rgba(15,23,42,.06); }
        .pl-card h1 { font-size: clamp(1.25rem, .9rem + 1.4vh, 1.6rem); font-weight: 800; letter-spacing: -.02em; color: var(--navy); }
        .pl-sub { margin-top: .35rem; color: var(--muted); font-size: .9rem; line-height: 1.5; }

        .pl-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin: clamp(.7rem, 2.6vh, 1.5rem) 0 clamp(.6rem, 2vh, 1.25rem); padding: 4px; background: #eef1f6; border-radius: 12px; }
        .pl-tabs button { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: clamp(36px, 5.6vh, 44px); padding: 6px; border: 0; border-radius: 9px; background: transparent; color: var(--muted); font: inherit; font-size: .88rem; font-weight: 600; cursor: pointer; transition: background .15s, color .15s; }
        .pl-tabs button:hover { color: var(--navy); }
        .pl-tabs button.active { background: #fff; color: var(--navy); box-shadow: 0 1px 4px rgba(15,23,42,.14); }

        .pl-msg { display: flex; gap: 10px; align-items: flex-start; padding: 9px 12px; margin-bottom: var(--gap); border-radius: 10px; font-size: .84rem; line-height: 1.4; }
        .pl-msg i { margin-top: 2px; }
        .pl-error { background: var(--bad-bg); color: var(--bad); border: 1px solid #fecdca; }
        .pl-info { background: var(--info-bg); color: #1d3f7a; border: 1px solid #cfe0fb; }
        .pl-info a { font-weight: 600; }

        .pl-form { display: grid; gap: var(--gap); }
        .pl-field { display: grid; gap: 5px; }
        .pl-label-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
        .pl-field label { font-size: .84rem; font-weight: 600; color: #26324a; }
        .pl-control { position: relative; display: flex; align-items: center; }
        .pl-icon { position: absolute; left: 14px; color: #8a96a8; font-size: .9rem; pointer-events: none; }
        .pl-control:focus-within .pl-icon { color: var(--navy); }
        .pl-control input { width: 100%; height: var(--ctl); padding: 0 46px 0 40px; border: 1.5px solid var(--line); border-radius: 10px; background: #fff; color: var(--ink); font: inherit; font-size: 1rem; }
        .pl-control input::placeholder { color: #a3adbd; }
        .pl-control input:hover { border-color: #b8c3d3; }
        .pl-control input:focus { outline: none; border-color: var(--navy); box-shadow: 0 0 0 4px rgba(18,41,74,.12); }
        .pl-control input:disabled { background: #eef1f6; color: var(--muted); }
        .pl-otp { letter-spacing: .5em; font-weight: 700; text-align: center; padding-left: 40px !important; }
        .pl-hint { font-size: .78rem; color: var(--muted); line-height: 1.4; }
        .pl-caps { position: absolute; right: 46px; font-size: .72rem; font-weight: 600; color: var(--gold-ink); background: #fff4cc; padding: 3px 8px; border-radius: 6px; pointer-events: none; }
        .pl-toggle { position: absolute; right: 4px; width: 38px; height: 38px; border: 0; background: transparent; color: #7b8799; border-radius: 8px; cursor: pointer; }
        .pl-toggle:hover { color: var(--navy); background: #eef1f6; }

        .pl-link { border: 0; background: none; padding: 2px 0; font: inherit; font-size: .84rem; font-weight: 600; color: var(--navy); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
        .pl-link:hover:not(:disabled) { color: var(--gold-ink); }
        .pl-link:disabled { color: var(--muted); text-decoration: none; cursor: default; }
        .pl-row { display: flex; justify-content: space-between; flex-wrap: wrap; gap: .4rem; }
        .pl-step { font-size: .8rem; font-weight: 600; color: var(--muted); }

        .pl-check { display: flex; align-items: center; gap: 10px; font-size: .86rem; color: #3a465c; cursor: pointer; }
        .pl-check input { position: absolute; opacity: 0; width: 20px; height: 20px; margin: 0; }
        .pl-box { width: 20px; height: 20px; flex-shrink: 0; border: 1.5px solid #aab5c6; border-radius: 6px; background: #fff; position: relative; }
        .pl-check input:checked + .pl-box { background: var(--navy); border-color: var(--navy); }
        .pl-check input:checked + .pl-box::after { content: ''; position: absolute; left: 6px; top: 2px; width: 5px; height: 10px; border: solid var(--gold); border-width: 0 2px 2px 0; transform: rotate(45deg); }
        .pl-check input:focus-visible + .pl-box { outline: 3px solid var(--gold); outline-offset: 2px; }

        .pl-btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; width: 100%; height: calc(var(--ctl) + 2px); border: 0; border-radius: 10px; background: var(--navy); color: #fff; font: inherit; font-size: 1rem; font-weight: 700; cursor: pointer; transition: background .15s; }
        .pl-btn:hover:not(:disabled) { background: #1b3d6d; }
        .pl-btn:disabled { opacity: .75; cursor: progress; }

        .pl-legal { margin-top: clamp(.6rem, 2vh, 1.4rem); padding-top: clamp(.5rem, 1.6vh, 1.1rem); border-top: 1px solid #eef1f6; text-align: center; font-size: .76rem; color: var(--muted); line-height: 1.45; }
        .pl-legal a { font-weight: 600; }

        /* ═════════ SHORT SCREENS: prune brand content so everything fits ═════════ */
        @media (max-height: 860px) {
          .pl-support { display: none; }
        }
        @media (max-height: 780px) {
          .pl-stats { display: none; }
        }
        @media (max-height: 720px) {
          .pl-features li:nth-child(n+4) { display: none; }
          .pl-hero > p { font-size: .85rem; }
        }
        @media (max-height: 640px) {
          .pl-features li:nth-child(n+3) { display: none; }
        }
        @media (max-height: 560px) {
          .pl-hero > p, .pl-hint { display: none; }
          .pl-brand-head small { display: none; }
        }
        @media (max-height: 480px) {
          .pl-features, .pl-footnote, .pl-eyebrow { display: none; }
        }

        /* ═════════ TABLET / MOBILE ═════════ */
        @media (max-width: 900px) {
          .pl-root { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
          .pl-brand-inner { padding: .75rem 1.25rem; flex-direction: row; align-items: center; justify-content: space-between; gap: 1rem; }
          .pl-brand-head { padding-bottom: 0; border-bottom: 0; }
          .pl-hero, .pl-footnote { display: none; }
          .pl-main { padding: clamp(.5rem, 2vh, 1rem) 1rem; }
        }
        @media (max-width: 900px) and (max-height: 600px) {
          .pl-brand { display: none; }
          .pl-root { grid-template-rows: minmax(0, 1fr); }
        }
        @media (max-width: 480px) {
          .pl-main { padding-left: .75rem; padding-right: .75rem; }
          .pl-card { padding-left: 1.1rem; padding-right: 1.1rem; }
          .pl-caps { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pl-root * { transition: none !important; animation: none !important; }
        }
      `}</style>
    </div>
  );
};

export default PortalLogin;