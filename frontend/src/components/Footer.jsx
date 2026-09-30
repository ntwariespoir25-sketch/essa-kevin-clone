import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';

const Footer = () => {
  const [email, setEmail] = useState('');

  const handleNewsletterSubmit = (e) => {
    e.preventDefault();
    if (email) {
      Swal.fire({
        title: 'Subscribed!',
        text: `Thank you — updates will be sent to ${email}.`,
        icon: 'success',
        confirmButtonColor: '#1e3c72',
        confirmButtonText: 'Great',
        timer: 3000,
        timerProgressBar: true,
      });
      setEmail('');
    } else {
      Swal.fire({
        title: 'Email Required',
        text: 'Please enter a valid email address to subscribe.',
        icon: 'warning',
        confirmButtonColor: '#1e3c72',
        confirmButtonText: 'OK',
      });
    }
  };

  return (
    <footer className="footer">
      <div className="footer-inner">
        {/* ── Brand column ───────────────── */}
        <div className="footer-brand">
          <Link to="/" className="footer-brand-head">
            <h3>ESSA Nyarugunga</h3>
          </Link>
          <p className="footer-brand-sub">École Secondaire des Sciences et Administrative</p>

          <p className="footer-tagline">
            Committed to excellence in education, character formation, and holistic development.
          </p>

          <div className="footer-socials">
            <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
              <i className="fab fa-facebook-f" aria-hidden="true" />
            </a>
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" aria-label="Twitter">
              <i className="fab fa-twitter" aria-hidden="true" />
            </a>
            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
              <i className="fab fa-instagram" aria-hidden="true" />
            </a>
            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
              <i className="fab fa-linkedin-in" aria-hidden="true" />
            </a>
            <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube">
              <i className="fab fa-youtube" aria-hidden="true" />
            </a>
          </div>
        </div>

        {/* ── Quick links ────────────────── */}
        <div className="footer-col">
          <h4>Explore</h4>
          <ul className="footer-links">
            <li><Link to="/about">About Us</Link></li>
            <li><Link to="/academics">Academics</Link></li>
            <li><Link to="/admissions">Admissions</Link></li>
            <li><Link to="/news">News &amp; Events</Link></li>
            <li><Link to="/gallery">Gallery</Link></li>
          </ul>
        </div>

        {/* ── Contact ────────────────────── */}
        <div className="footer-col">
          <h4>Contact</h4>
          <ul className="footer-contact">
            <li>
              <i className="fas fa-map-marker-alt" aria-hidden="true" />
              <span>Nyarugunga Sector, Kicukiro District, Kigali, Rwanda</span>
            </li>
            <li>
              <i className="fas fa-envelope" aria-hidden="true" />
              <a href="mailto:info@essanyarugunga.rw">info@essanyarugunga.rw</a>
            </li>
            <li>
              <i className="fas fa-phone-alt" aria-hidden="true" />
              <a href="tel:+250788123456">+250 788 123 456</a>
            </li>
            <li>
              <i className="fas fa-clock" aria-hidden="true" />
              <span>Mon – Fri · 8:00 AM – 5:00 PM</span>
            </li>
          </ul>
        </div>

        {/* ── Newsletter ─────────────────── */}
        <div className="footer-col">
          <h4>Stay Updated</h4>
          <p className="newsletter-text">
            Get school news, events, and announcements delivered to your inbox.
          </p>
          <form className="newsletter-form" onSubmit={handleNewsletterSubmit}>
            <div className="input-group">
              <input
                type="email"
                placeholder="Your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-label="Email address"
              />
              <button type="submit" aria-label="Subscribe">
                <i className="fas fa-paper-plane" aria-hidden="true" />
              </button>
            </div>
          </form>
          <Link to="/portal/login" className="footer-portal-link">
            <i className="fas fa-sign-in-alt" aria-hidden="true" />
            Portal Login
          </Link>
        </div>
      </div>

      {/* ── Bottom bar ─────────────────── */}
      <div className="footer-bottom">
        <p className="footer-copy">
          © {new Date().getFullYear()} ESSA Nyarugunga. All rights reserved.
        </p>
        <div className="footer-legal">
          <Link to="/privacy-policy">Privacy Policy</Link>
          <span className="dot" aria-hidden="true">•</span>
          <Link to="/terms-of-use">Terms of Use</Link>
        </div>
      </div>

      <style>{`
        /* ═══════════════ FOOTER SHELL ═══════════════ */
        .footer {
          background: #1a3a5c;
          color: #ffffff;
          position: relative;
          padding: 2.75rem 1.5rem 1.25rem;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .footer-inner {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1.4fr 0.9fr 1.1fr 1.2fr;
          gap: 2.5rem;
          padding-bottom: 2.25rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          text-align: left;
        }

        /* ═══════════════ BRAND COLUMN ═══════════════ */
        .footer-brand-head {
          display: inline-block;
          text-decoration: none;
          margin-bottom: 0.5rem;
        }
        .footer-brand-head h3 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 800;
          letter-spacing: -0.3px;
          color: #ffffff;
          transition: color 0.2s ease;
        }
        .footer-brand-head:hover h3 { color: #ffc107; }

        .footer-brand-sub {
          font-size: 0.7rem;
          color: rgba(255, 255, 255, 0.5);
          letter-spacing: 0.2px;
          margin: 0 0 1rem;
          line-height: 1.4;
        }

        .footer-tagline {
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.85rem;
          line-height: 1.6;
          margin: 0 0 1.25rem;
          max-width: 320px;
        }

        .footer-socials {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .footer-socials a {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.75);
          font-size: 0.9rem;
          text-decoration: none;
          transition: all 0.25s ease;
        }
        .footer-socials a:hover {
          background: #ffc107;
          border-color: #ffc107;
          color: #1a3a5c;
          transform: translateY(-3px);
          box-shadow: 0 8px 18px rgba(255, 193, 7, 0.35);
        }

        /* ═══════════════ COLUMNS ═══════════════ */
        .footer-col { text-align: left; }

        .footer-col h4 {
          font-size: 0.78rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1.4px;
          color: #ffc107;
          margin: 0 0 1rem;
          position: relative;
          padding-bottom: 0.55rem;
        }
        .footer-col h4::after {
          content: '';
          position: absolute;
          left: 0;
          bottom: 0;
          width: 28px;
          height: 2px;
          background: #ffc107;
          border-radius: 2px;
        }

        /* Quick links */
        .footer-links {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .footer-links a {
          color: rgba(255, 255, 255, 0.72);
          font-size: 0.85rem;
          text-decoration: none;
          transition: color 0.2s ease;
          display: inline-block;
        }
        .footer-links a:hover {
          color: #ffc107;
        }

        /* Contact list */
        .footer-contact {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .footer-contact li {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          color: rgba(255, 255, 255, 0.72);
          font-size: 0.82rem;
          line-height: 1.5;
          text-align: left;
        }
        .footer-contact li i {
          color: #ffc107;
          font-size: 0.85rem;
          margin-top: 4px;
          flex-shrink: 0;
          width: 14px;
          text-align: center;
        }
        .footer-contact li a,
        .footer-contact li span {
          color: rgba(255, 255, 255, 0.72);
          text-decoration: none;
          transition: color 0.2s ease;
        }
        .footer-contact li a:hover {
          color: #ffc107;
        }

        /* Newsletter */
        .newsletter-text {
          font-size: 0.82rem;
          color: rgba(255, 255, 255, 0.7);
          line-height: 1.55;
          margin: 0 0 0.9rem;
        }

        .newsletter-form { margin-bottom: 0.9rem; }

        .input-group {
          display: flex;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          overflow: hidden;
          transition: border-color 0.2s ease, background 0.2s ease;
        }
        .input-group:focus-within {
          border-color: #ffc107;
          background: rgba(255, 255, 255, 0.09);
        }
        .input-group input {
          flex: 1;
          padding: 10px 14px;
          background: transparent;
          border: none;
          color: #ffffff;
          font-size: 0.85rem;
          outline: none;
          font-family: inherit;
          min-width: 0;
        }
        .input-group input::placeholder {
          color: rgba(255, 255, 255, 0.45);
        }
        .input-group button {
          padding: 0 16px;
          background: #ffc107;
          border: none;
          color: #1a3a5c;
          cursor: pointer;
          font-size: 0.9rem;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        .input-group button:hover {
          background: #e0a800;
        }

        .footer-portal-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 14px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: rgba(255, 255, 255, 0.85);
          font-size: 0.8rem;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.25s ease;
        }
        .footer-portal-link:hover {
          background: rgba(255, 193, 7, 0.12);
          border-color: rgba(255, 193, 7, 0.4);
          color: #ffc107;
          transform: translateY(-2px);
        }
        .footer-portal-link i { font-size: 0.78rem; }

        /* ═══════════════ BOTTOM BAR ═══════════════ */
        .footer-bottom {
          max-width: 1200px;
          margin: 0 auto;
          padding-top: 1.25rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
          text-align: left;
        }

        .footer-copy {
          margin: 0;
          font-size: 0.76rem;
          color: rgba(255, 255, 255, 0.5);
        }

        .footer-legal {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.76rem;
        }
        .footer-legal a {
          color: rgba(255, 255, 255, 0.55);
          text-decoration: none;
          transition: color 0.2s ease;
        }
        .footer-legal a:hover {
          color: #ffc107;
        }
        .footer-legal .dot {
          color: rgba(255, 255, 255, 0.25);
        }

        /* ═══════════════ RESPONSIVE ═══════════════ */
        @media (max-width: 992px) {
          .footer-inner {
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
          }
        }

        @media (max-width: 640px) {
          .footer { padding: 2rem 1.15rem 1rem; }

          .footer-inner {
            grid-template-columns: 1fr;
            gap: 1.75rem;
            padding-bottom: 1.75rem;
          }

          .footer-tagline { max-width: 100%; }

          .footer-bottom {
            flex-direction: column;
            align-items: flex-start;
            text-align: left;
            padding-top: 1.15rem;
          }
        }
      `}</style>
    </footer>
  );
};

export default Footer;