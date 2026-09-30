import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useForm } from '@formspree/react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

// API Base URL (still used by the newsletter form)
const API_URL = import.meta.env.VITE_API_URL;

const ContactPage = () => {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    subject: '',
    message: ''
  });
  const [mapLoaded, setMapLoaded] = useState(false);
  const [activeFaq, setActiveFaq] = useState(null);
  const [activeChannel, setActiveChannel] = useState('message'); // message | call | email | visit

  // Formspree hook
  const [state, handleSubmit] = useForm('mppzepwk');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (state.succeeded) {
      Swal.fire({
        title: 'Message Sent!',
        html: `
          <div style="text-align: left;">
            <p>Thank you <strong>${formData.fullName}</strong> for contacting us.</p>
            <p>We have received your message and will respond within 24 hours.</p>
          </div>
        `,
        icon: 'success',
        confirmButtonText: 'OK',
        confirmButtonColor: '#1e3c72'
      });

      setFormData({
        fullName: '',
        email: '',
        phone: '',
        subject: '',
        message: ''
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.succeeded]);

  useEffect(() => {
    if (state.errors && state.errors.length > 0) {
      Swal.fire({
        title: 'Error',
        text: state.errors[0]?.message || 'Failed to send message. Please try again.',
        icon: 'error',
        confirmButtonColor: '#1e3c72'
      });
    }
  }, [state.errors]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const toggleFaq = (index) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  const handleCallClick = () => {
    Swal.fire({
      title: 'Call Us',
      text: 'Click OK to call +250 788 123 456',
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'Call Now',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#27ae60'
    }).then((result) => {
      if (result.isConfirmed) {
        window.location.href = 'tel:250788123456';
      }
    });
  };

  const handleEmailClick = () => {
    Swal.fire({
      title: 'Email Us',
      text: 'Click OK to send an email to info@essanyarugunga.rw',
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'Send Email',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#3498db'
    }).then((result) => {
      if (result.isConfirmed) {
        window.location.href = 'mailto:info@essanyarugunga.rw';
      }
    });
  };

  const handleWhatsAppClick = () => {
    window.open('https://wa.me/250788123456?text=Hello%20ESSA%20Nyarugunga%2C%20I%20have%20a%20question%20about', '_blank');
  };

  const handleDirectionClick = () => {
    Swal.fire({
      title: 'Get Directions',
      text: 'Open Google Maps for directions to ESSA Nyarugunga?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Open Maps',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#1e3c72'
    }).then((result) => {
      if (result.isConfirmed) {
        window.open('https://maps.google.com/?q=Nyarugunga+Sector+Kicukiro+District+Kigali+Rwanda', '_blank');
      }
    });
  };

  const handleNewsletterSubscribe = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    if (!email) return;

    try {
      const response = await fetch(`${API_URL}/api/subscriptions/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await response.json();

      Swal.fire({
        title: data.success ? 'Subscribed!' : 'Already Subscribed',
        text: data.message || 'You have successfully subscribed to our newsletter.',
        icon: data.success ? 'success' : 'info',
        confirmButtonColor: '#1e3c72'
      });
      e.target.reset();
    } catch (error) {
      Swal.fire({
        title: 'Error',
        text: 'Failed to subscribe. Please try again.',
        icon: 'error',
        confirmButtonColor: '#1e3c72'
      });
    }
  };

  const contactInfo = [
    {
      id: 'visit',
      icon: 'fas fa-map-marker-alt',
      title: 'Visit Us',
      details: ['Nyarugunga Sector, Kicukiro District', 'Kigali, Rwanda'],
      action: 'Get Directions',
      actionHandler: handleDirectionClick,
      color: '#e74c3c',
      bgLight: '#fdecea'
    },
    {
      id: 'call',
      icon: 'fas fa-phone-alt',
      title: 'Call Us',
      details: ['+250 788 123 456', '+250 788 123 457'],
      action: 'Call Now',
      actionHandler: handleCallClick,
      color: '#27ae60',
      bgLight: '#e8f5e9'
    },
    {
      id: 'email',
      icon: 'fas fa-envelope',
      title: 'Email Us',
      details: ['info@essanyarugunga.rw', 'admissions@essanyarugunga.rw'],
      action: 'Send Email',
      actionHandler: handleEmailClick,
      color: '#3498db',
      bgLight: '#e3f2fd'
    },
    {
      id: 'hours',
      icon: 'fas fa-clock',
      title: 'Office Hours',
      details: ['Mon-Fri: 8:00 AM - 5:00 PM', 'Saturday: 9:00 AM - 12:00 PM'],
      action: 'Schedule Appointment',
      actionHandler: () => {
        Swal.fire({
          title: 'Schedule Appointment',
          html: `
            <input type="text" id="name" class="swal2-input" placeholder="Your Name">
            <input type="email" id="email" class="swal2-input" placeholder="Your Email">
            <input type="date" id="date" class="swal2-input">
            <select id="time" class="swal2-select">
              <option value="">Select Time</option>
              <option>9:00 AM</option>
              <option>10:00 AM</option>
              <option>11:00 AM</option>
              <option>2:00 PM</option>
              <option>3:00 PM</option>
            </select>
          `,
          confirmButtonText: 'Request Appointment',
          confirmButtonColor: '#1e3c72',
          preConfirm: () => {
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const date = document.getElementById('date').value;
            const time = document.getElementById('time').value;
            if (!name || !email || !date || !time) {
              Swal.showValidationMessage('Please fill all fields');
              return false;
            }
            return { name, email, date, time };
          }
        }).then((result) => {
          if (result.isConfirmed) {
            Swal.fire('Appointment Requested!', `We will confirm your appointment for ${result.value.date} at ${result.value.time}.`, 'success');
          }
        });
      },
      color: '#9b59b6',
      bgLight: '#f3e5f5'
    }
  ];

  const socialLinks = [
    { name: 'Facebook', icon: 'fab fa-facebook-f', url: 'https://facebook.com', color: '#1877f2' },
    { name: 'Twitter', icon: 'fab fa-twitter', url: 'https://twitter.com', color: '#1da1f2' },
    { name: 'Instagram', icon: 'fab fa-instagram', url: 'https://instagram.com', color: '#e4405f' },
    { name: 'LinkedIn', icon: 'fab fa-linkedin-in', url: 'https://linkedin.com', color: '#0077b5' },
    { name: 'YouTube', icon: 'fab fa-youtube', url: 'https://youtube.com', color: '#ff0000' },
    { name: 'WhatsApp', icon: 'fab fa-whatsapp', url: 'https://wa.me/250788123456', color: '#25D366' }
  ];

  const faqs = [
    { q: 'How can I apply for admission?', a: 'You can apply online through our admissions portal or download the application form from the Admissions page.' },
    { q: 'When is the application deadline?', a: 'The application deadline for the 2026-2027 academic year is September 30, 2026.' },
    { q: 'Is there an entrance examination?', a: 'Yes, entrance examinations are held weekly on Saturdays. Please contact the admissions office to schedule.' },
    { q: 'Do you offer scholarships?', a: 'Yes, we offer merit-based and need-based scholarships. Visit our Admissions page for more information.' },
    { q: 'What are the school hours?', a: 'School runs from 7:45 AM to 4:00 PM, Monday through Friday.' },
    { q: 'How do I check my child\'s progress?', a: 'Parents can access the student portal using credentials provided by the school to track academic progress and attendance.' }
  ];

  return (
    <>
      <Navbar />

      {/* ============ HERO SECTION - Solid Blue with Split Layout ============ */}
      <section className="contact-hero">
        <div className="hero-grid">
          <div className="hero-left">
            <div className="hero-badge">
              <i className="fas fa-comments"></i> GET IN TOUCH
            </div>
            <h1>Let's <span className="highlight">Talk</span></h1>
            <p>
              Whether you have a question about admissions, need academic support, or want to
              partner with us — our team is here to help. Reach out and we'll respond within 24 hours.
            </p>

            <div className="hero-quick-actions">
              <button onClick={handleCallClick} className="hero-action-btn call">
                <i className="fas fa-phone-alt"></i>
                <div>
                  <span>Call Us</span>
                  <small>+250 788 123 456</small>
                </div>
              </button>
              <button onClick={handleWhatsAppClick} className="hero-action-btn whatsapp">
                <i className="fab fa-whatsapp"></i>
                <div>
                  <span>WhatsApp</span>
                  <small>Chat with us now</small>
                </div>
              </button>
            </div>
          </div>

          <div className="hero-right">
            <div className="hero-stat-card">
              <div className="hero-stat-icon">
                <i className="fas fa-clock"></i>
              </div>
              <div className="hero-stat-info">
                <span className="hero-stat-number">24/7</span>
                <span className="hero-stat-label">Support Available</span>
              </div>
            </div>
            <div className="hero-stat-card">
              <div className="hero-stat-icon">
                <i className="fas fa-bolt"></i>
              </div>
              <div className="hero-stat-info">
                <span className="hero-stat-number">15 min</span>
                <span className="hero-stat-label">Average Response</span>
              </div>
            </div>
            <div className="hero-stat-card">
              <div className="hero-stat-icon">
                <i className="fas fa-users"></i>
              </div>
              <div className="hero-stat-info">
                <span className="hero-stat-number">98%</span>
                <span className="hero-stat-label">Satisfaction Rate</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FLOATING QUICK-CONTACT DOCK ============ */}
      <section className="quick-dock-section">
        <div className="container">
          <div className="quick-dock">
            {contactInfo.map((info) => (
              <button
                key={info.id}
                className={`quick-dock-item ${activeChannel === info.id ? 'active' : ''}`}
                onClick={() => { setActiveChannel(info.id); info.actionHandler(); }}
                style={{ '--dock-color': info.color }}
              >
                <div className="dock-icon">
                  <i className={info.icon}></i>
                </div>
                <div className="dock-text">
                  <span className="dock-title">{info.title}</span>
                  <span className="dock-action">{info.action} <i className="fas fa-arrow-right"></i></span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ============ CONTACT FORM & MAP ============ */}
      <section className="contact-form-section">
        <div className="container">
          <div className="form-map-grid">
            {/* Contact Form */}
            <div className="contact-form-container">
              <div className="form-header">
                <div className="form-header-icon">
                  <i className="fas fa-paper-plane"></i>
                </div>
                <div>
                  <h2>Send Us a Message</h2>
                  <p>Fill out the form below and we'll get back to you as soon as possible.</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="contact-form">
                <input
                  type="hidden"
                  name="_subject"
                  value={formData.subject ? `Contact: ${formData.subject}` : 'New Contact Form Submission'}
                />
                <input
                  type="text"
                  name="_gotcha"
                  style={{ display: 'none' }}
                  tabIndex="-1"
                  autoComplete="off"
                />

                <div className="form-row">
                  <div className="form-group">
                    <label>Full Name <span className="required">*</span></label>
                    <div className="input-icon">
                      <i className="fas fa-user"></i>
                      <input
                        type="text"
                        name="fullName"
                        value={formData.fullName}
                        onChange={handleInputChange}
                        placeholder="Enter your full name"
                        required
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Email Address <span className="required">*</span></label>
                    <div className="input-icon">
                      <i className="fas fa-envelope"></i>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        placeholder="Enter your email"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Phone Number</label>
                    <div className="input-icon">
                      <i className="fas fa-phone"></i>
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        placeholder="Enter your phone number"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Subject</label>
                    <div className="input-icon">
                      <i className="fas fa-tag"></i>
                      <select name="subject" value={formData.subject} onChange={handleInputChange}>
                        <option value="">Select a subject</option>
                        <option>General Inquiry</option>
                        <option>Admissions Question</option>
                        <option>Academic Support</option>
                        <option>Complaint/Suggestion</option>
                        <option>Partnership Opportunity</option>
                        <option>Technical Support</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label>Message <span className="required">*</span></label>
                  <div className="input-icon textarea-icon">
                    <i className="fas fa-comment"></i>
                    <textarea
                      name="message"
                      value={formData.message}
                      onChange={handleInputChange}
                      rows="5"
                      placeholder="Write your message here..."
                      required
                    ></textarea>
                  </div>
                </div>

                <button type="submit" className="submit-btn" disabled={state.submitting}>
                  {state.submitting ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Sending...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-paper-plane"></i> Send Message
                    </>
                  )}
                </button>

                <p className="form-privacy-note">
                  <i className="fas fa-shield-alt"></i> Your information is secure and will never be shared.
                </p>
              </form>
            </div>

            {/* Map + Info Side */}
            <div className="map-side">
              <div className="map-card">
                <div className="map-card-header">
                  <h3><i className="fas fa-map-marked-alt"></i> Find Us</h3>
                  <span className="map-live-badge">
                    <span className="live-dot"></span> Open Now
                  </span>
                </div>
                <div className="map-wrapper">
                  <iframe
                    title="ESSA Nyarugunga Location"
                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3987.4756!2d30.0935!3d-1.9444!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x19dca76c8d1e2e5b%3A0x4f5c7e3b2a1d8e9f!2sKigali%2C%20Rwanda!5e0!3m2!1sen!2s!4v1700000000000!5m2!1sen!2s"
                    width="100%"
                    height="280"
                    style={{ border: 0 }}
                    allowFullScreen=""
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    onLoad={() => setMapLoaded(true)}
                  ></iframe>
                  {!mapLoaded && (
                    <div className="map-loading">
                      <i className="fas fa-spinner fa-spin"></i> Loading map...
                    </div>
                  )}
                </div>
                <div className="map-address">
                  <p><i className="fas fa-location-dot"></i> Nyarugunga Sector, Kicukiro District, Kigali, Rwanda</p>
                  <button onClick={handleDirectionClick} className="directions-btn">
                    <i className="fas fa-directions"></i> Get Directions
                  </button>
                </div>
              </div>

              {/* Mini info cards */}
              <div className="mini-info-grid">
                <div className="mini-info-card">
                  <i className="fas fa-phone-alt"></i>
                  <div>
                    <strong>Phone</strong>
                    <span>+250 788 123 456</span>
                  </div>
                </div>
                <div className="mini-info-card">
                  <i className="fas fa-envelope"></i>
                  <div>
                    <strong>Email</strong>
                    <span>info@essanyarugunga.rw</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ NEWSLETTER SECTION ============ */}
      <section className="newsletter-section">
        <div className="container">
          <div className="newsletter-card">
            <div className="newsletter-left">
              <div className="newsletter-icon">
                <i className="fas fa-envelope-open-text"></i>
              </div>
              <div>
                <h3>Subscribe to Our Newsletter</h3>
                <p>Get the latest news, events, and updates directly in your inbox.</p>
              </div>
            </div>
            <form onSubmit={handleNewsletterSubscribe} className="newsletter-form">
              <input type="email" name="email" placeholder="Your email address" required />
              <button type="submit">Subscribe <i className="fas fa-paper-plane"></i></button>
            </form>
          </div>
        </div>
      </section>

      {/* ============ SOCIAL MEDIA ============ */}
      <section className="social-section">
        <div className="container">
          <div className="section-title">
            <h2><i className="fas fa-share-alt"></i> Connect With Us</h2>
            <div className="underline"></div>
            <p className="section-subtitle">Follow us on social media for updates and news</p>
          </div>
          <div className="social-grid">
            {socialLinks.map((social, index) => (
              <a
                key={index}
                href={social.url}
                target="_blank"
                rel="noopener noreferrer"
                className="social-card"
                style={{ '--social-color': social.color }}
              >
                <div className="social-icon" style={{ background: social.color }}>
                  <i className={social.icon}></i>
                </div>
                <h3>{social.name}</h3>
                <p>Follow us on {social.name}</p>
                <span className="follow-btn">Follow <i className="fas fa-arrow-right"></i></span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section className="contact-faq">
        <div className="container">
          <div className="faq-header">
            <i className="fas fa-question-circle"></i>
            <h2>Frequently Asked Questions</h2>
            <p>Find quick answers to common questions</p>
          </div>
          <div className="faq-grid">
            {faqs.map((faq, index) => (
              <div key={index} className={`faq-card ${activeFaq === index ? 'active' : ''}`}>
                <div className="faq-question" onClick={() => toggleFaq(index)}>
                  <div className="faq-question-content">
                    <i className="fas fa-question-circle"></i>
                    <h3>{faq.q}</h3>
                  </div>
                  <i className={`fas fa-chevron-${activeFaq === index ? 'up' : 'down'}`}></i>
                </div>
                <div className={`faq-answer ${activeFaq === index ? 'active' : ''}`}>
                  <p>{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="faq-more">
            <p>Still have questions? <Link to="/contact">Contact our support team</Link></p>
          </div>
        </div>
      </section>

      {/* ============ EMERGENCY BANNER ============ */}
      <section className="emergency-banner">
        <div className="container">
          <div className="emergency-content">
            <div className="emergency-icon">
              <i className="fas fa-phone-alt"></i>
            </div>
            <div className="emergency-text">
              <h3>Emergency Contact</h3>
              <p>For urgent matters outside office hours, please call our emergency hotline</p>
            </div>
            <div className="emergency-number">
              <span>+250 788 123 456</span>
              <small>Available 24/7</small>
            </div>
            <button onClick={handleCallClick} className="emergency-btn">
              <i className="fas fa-phone"></i> Call Now
            </button>
          </div>
        </div>
      </section>

      <Footer />

      <style>{`
        /* ============ HERO - Solid Blue Split Layout ============ */
        .contact-hero {
          position: relative;
          background: #1e3c72;
          padding: 5rem 0;
          overflow: hidden;
        }

        .hero-grid {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1.5rem;
          display: grid;
          grid-template-columns: 1.3fr 1fr;
          gap: 3rem;
          align-items: center;
        }

        .hero-left { text-align: left; }

        .hero-badge {
          display: inline-block;
          background: rgba(255,193,7,0.15);
          color: #ffc107;
          padding: 8px 20px;
          border-radius: 30px;
          font-size: 0.82rem;
          margin-bottom: 1.25rem;
          border: 1px solid rgba(255,193,7,0.3);
          letter-spacing: 1px;
          font-weight: 600;
          animation: fadeInDown 0.6s ease both;
        }

        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-15px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .hero-left h1 {
          color: #ffffff;
          font-size: 3rem;
          font-weight: 800;
          letter-spacing: -1px;
          line-height: 1.15;
          margin-bottom: 1rem;
          animation: fadeInUp 0.7s ease 0.1s both;
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .hero-left h1 .highlight { color: #ffc107; }

        .hero-left p {
          color: rgba(255,255,255,0.9);
          font-size: 1.05rem;
          line-height: 1.7;
          margin-bottom: 2rem;
          max-width: 520px;
          animation: fadeInUp 0.7s ease 0.2s both;
        }

        .hero-quick-actions {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          animation: fadeInUp 0.7s ease 0.3s both;
        }

        .hero-action-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 22px;
          border-radius: 14px;
          border: none;
          cursor: pointer;
          font-family: inherit;
          text-align: left;
          transition: all 0.3s ease;
        }

        .hero-action-btn.call {
          background: #ffc107;
          color: #1e3c72;
          box-shadow: 0 8px 22px rgba(255,193,7,0.35);
        }

        .hero-action-btn.call:hover {
          background: #e0a800;
          transform: translateY(-3px);
          box-shadow: 0 12px 28px rgba(255,193,7,0.45);
        }

        .hero-action-btn.whatsapp {
          background: transparent;
          color: #ffffff;
          border: 2px solid rgba(255,255,255,0.35);
        }

        .hero-action-btn.whatsapp:hover {
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.6);
          transform: translateY(-3px);
        }

        .hero-action-btn i { font-size: 1.35rem; }

        .hero-action-btn div {
          display: flex;
          flex-direction: column;
        }

        .hero-action-btn span {
          font-weight: 700;
          font-size: 0.95rem;
          line-height: 1.2;
        }

        .hero-action-btn small {
          font-size: 0.72rem;
          opacity: 0.85;
        }

        /* Hero right - stat cards */
        .hero-right {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          animation: fadeInUp 0.7s ease 0.4s both;
        }

        .hero-stat-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 16px;
          padding: 1.25rem 1.5rem;
          backdrop-filter: blur(10px);
          transition: all 0.3s ease;
        }

        .hero-stat-card:hover {
          background: rgba(255,255,255,0.12);
          border-color: rgba(255,193,7,0.4);
          transform: translateX(6px);
        }

        .hero-stat-icon {
          flex-shrink: 0;
          width: 52px;
          height: 52px;
          border-radius: 12px;
          background: rgba(255,193,7,0.15);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .hero-stat-icon i {
          color: #ffc107;
          font-size: 1.25rem;
        }

        .hero-stat-info {
          display: flex;
          flex-direction: column;
        }

        .hero-stat-number {
          color: #ffffff;
          font-size: 1.35rem;
          font-weight: 800;
          letter-spacing: -0.5px;
        }

        .hero-stat-label {
          color: rgba(255,255,255,0.7);
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* ============ FLOATING QUICK-CONTACT DOCK ============ */
        .quick-dock-section {
          padding: 0;
          margin-top: -2rem;
          position: relative;
          z-index: 10;
        }

        .quick-dock {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
          background: #ffffff;
          border-radius: 20px;
          padding: 0.75rem;
          box-shadow: 0 20px 50px rgba(26, 58, 92, 0.15);
          border: 1px solid rgba(26, 58, 92, 0.05);
        }

        .quick-dock-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 1rem 1.15rem;
          border: none;
          background: transparent;
          border-radius: 14px;
          cursor: pointer;
          text-align: left;
          font-family: inherit;
          transition: all 0.3s ease;
          position: relative;
        }

        .quick-dock-item:hover {
          background: #f8fafc;
        }

        .quick-dock-item.active {
          background: #f8fafc;
        }

        .quick-dock-item:not(:last-child)::after {
          content: '';
          position: absolute;
          right: -0.5rem;
          top: 20%;
          height: 60%;
          width: 1px;
          background: #eef2f8;
        }

        .quick-dock-item .dock-icon {
          flex-shrink: 0;
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: var(--dock-color);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.3s ease;
        }

        .quick-dock-item:hover .dock-icon {
          transform: scale(1.08);
        }

        .quick-dock-item .dock-icon i {
          color: #ffffff;
          font-size: 1.05rem;
        }

        .dock-text {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .dock-title {
          font-weight: 700;
          color: #1a3a5c;
          font-size: 0.9rem;
        }

        .dock-action {
          font-size: 0.72rem;
          color: var(--dock-color);
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        /* ============ CONTACT FORM SECTION ============ */
        .contact-form-section {
          padding: 4rem 0;
          background: #ffffff;
        }

        .form-map-grid {
          display: grid;
          grid-template-columns: 1.15fr 1fr;
          gap: 2.5rem;
          align-items: flex-start;
        }

        /* Contact Form Container */
        .contact-form-container {
          background: #ffffff;
          padding: 2.5rem;
          border-radius: 24px;
          box-shadow: 0 10px 40px rgba(26, 58, 92, 0.08);
          border: 1px solid #eef2f8;
        }

        .form-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 2rem;
          padding-bottom: 1.5rem;
          border-bottom: 2px solid #f1f5f9;
        }

        .form-header-icon {
          flex-shrink: 0;
          width: 56px;
          height: 56px;
          border-radius: 16px;
          background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 20px rgba(30, 60, 114, 0.25);
        }

        .form-header-icon i {
          color: #ffc107;
          font-size: 1.4rem;
        }

        .form-header h2 {
          color: #1a3a5c;
          margin: 0 0 4px;
          font-size: 1.4rem;
          font-weight: 800;
        }

        .form-header p {
          color: #64748b;
          font-size: 0.85rem;
          margin: 0;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.2rem;
          margin-bottom: 1.2rem;
        }

        .form-group { margin-bottom: 0; }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 600;
          font-size: 0.82rem;
          color: #334155;
        }

        .required { color: #e74c3c; }

        .input-icon { position: relative; }

        .input-icon > i {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          font-size: 0.9rem;
          pointer-events: none;
          transition: color 0.25s ease;
        }

        .input-icon.textarea-icon > i {
          top: 18px;
          transform: none;
        }

        .input-icon:focus-within > i { color: #1a3a5c; }

        .input-icon input,
        .input-icon select,
        .input-icon textarea {
          width: 100%;
          padding: 13px 14px 13px 42px;
          border: 1.5px solid #e2e8f0;
          border-radius: 12px;
          font-size: 0.92rem;
          font-family: inherit;
          background: #fbfcfe;
          color: #1e293b;
          transition: all 0.25s ease;
        }

        .input-icon textarea {
          resize: vertical;
          min-height: 120px;
          padding-top: 14px;
        }

        .input-icon input::placeholder,
        .input-icon textarea::placeholder { color: #b0bac7; }

        .input-icon input:hover,
        .input-icon select:hover,
        .input-icon textarea:hover {
          border-color: #cbd5e1;
          background: #ffffff;
        }

        .input-icon input:focus,
        .input-icon select:focus,
        .input-icon textarea:focus {
          outline: none;
          border-color: #1a3a5c;
          background: #ffffff;
          box-shadow: 0 0 0 4px rgba(26, 58, 92, 0.1);
        }

        .input-icon select {
          appearance: none;
          background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e");
          background-repeat: no-repeat;
          background-position: right 14px center;
          background-size: 16px;
          padding-right: 40px;
        }

        .submit-btn {
          width: 100%;
          background: linear-gradient(135deg, #1a3a5c 0%, #2a5298 100%);
          color: white;
          border: none;
          padding: 15px;
          border-radius: 12px;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          letter-spacing: 0.3px;
          margin-top: 0.5rem;
        }

        .submit-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #ffc107 0%, #e0a800 100%);
          color: #1a3a5c;
          transform: translateY(-2px);
          box-shadow: 0 12px 28px rgba(255, 193, 7, 0.4);
        }

        .submit-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .form-privacy-note {
          text-align: center;
          font-size: 0.75rem;
          color: #94a3b8;
          margin-top: 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .form-privacy-note i { color: #22c55e; }

        /* Map Side */
        .map-side {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .map-card {
          background: #f8fafc;
          padding: 1.75rem;
          border-radius: 24px;
          border: 1px solid #eef2f8;
        }

        .map-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.25rem;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .map-card-header h3 {
          margin: 0;
          color: #1a3a5c;
          font-size: 1.2rem;
          font-weight: 800;
        }

        .map-card-header h3 i {
          color: #ffc107;
          margin-right: 8px;
        }

        .map-live-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #dcfce7;
          color: #16a34a;
          padding: 5px 12px;
          border-radius: 20px;
          font-size: 0.72rem;
          font-weight: 700;
        }

        .live-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #16a34a;
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }

        .map-wrapper {
          position: relative;
          border-radius: 16px;
          overflow: hidden;
          background: #eef2f8;
        }

        .map-loading {
          position: absolute;
          inset: 0;
          background: #f0f2f5;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #64748b;
          font-size: 0.85rem;
          gap: 8px;
        }

        .map-address {
          margin-top: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }

        .map-address p {
          margin: 0;
          font-size: 0.87rem;
          color: #475569;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          line-height: 1.5;
        }

        .map-address p i {
          color: #ffc107;
          margin-top: 3px;
        }

        .directions-btn {
          background: #1a3a5c;
          color: white;
          border: none;
          padding: 12px 20px;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.9rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.3s ease;
          align-self: flex-start;
        }

        .directions-btn:hover {
          background: #ffc107;
          color: #1a3a5c;
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(255, 193, 7, 0.35);
        }

        .mini-info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .mini-info-card {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #ffffff;
          border: 1px solid #eef2f8;
          padding: 1.1rem 1.25rem;
          border-radius: 16px;
          transition: all 0.3s ease;
        }

        .mini-info-card:hover {
          border-color: #ffc107;
          transform: translateY(-3px);
          box-shadow: 0 8px 20px rgba(26, 58, 92, 0.06);
        }

        .mini-info-card > i {
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: rgba(255, 193, 7, 0.12);
          color: #d4a017;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
        }

        .mini-info-card div {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .mini-info-card strong {
          color: #1a3a5c;
          font-size: 0.82rem;
          font-weight: 700;
        }

        .mini-info-card span {
          color: #64748b;
          font-size: 0.75rem;
          word-break: break-all;
        }

        /* ============ NEWSLETTER SECTION ============ */
        .newsletter-section {
          padding: 4rem 0;
          background: #1e3c72;
        }

        .newsletter-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 2rem;
          max-width: 1000px;
          margin: 0 auto;
          flex-wrap: wrap;
        }

        .newsletter-left {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          color: white;
        }

        .newsletter-icon {
          flex-shrink: 0;
          width: 60px;
          height: 60px;
          border-radius: 16px;
          background: rgba(255, 193, 7, 0.15);
          border: 1px solid rgba(255, 193, 7, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .newsletter-icon i {
          font-size: 1.5rem;
          color: #ffc107;
        }

        .newsletter-left h3 {
          margin: 0 0 4px;
          font-size: 1.15rem;
          font-weight: 800;
        }

        .newsletter-left p {
          margin: 0;
          opacity: 0.85;
          font-size: 0.85rem;
        }

        .newsletter-form {
          display: flex;
          gap: 0.5rem;
          flex: 1;
          max-width: 420px;
        }

        .newsletter-form input {
          flex: 1;
          padding: 14px 20px;
          border: none;
          border-radius: 30px;
          font-size: 0.9rem;
          font-family: inherit;
        }

        .newsletter-form input:focus { outline: 2px solid #ffc107; }

        .newsletter-form button {
          background: #ffc107;
          color: #1a3a5c;
          border: none;
          padding: 14px 26px;
          border-radius: 30px;
          cursor: pointer;
          font-weight: 700;
          font-family: inherit;
          transition: all 0.3s ease;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .newsletter-form button:hover {
          background: #e0a800;
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(255,193,7,0.4);
        }

        /* ============ SOCIAL SECTION ============ */
        .social-section {
          padding: 4rem 0;
          background: #ffffff;
        }

        .section-title {
          text-align: center;
          margin-bottom: 2.5rem;
        }

        .section-title h2 {
          font-size: 1.8rem;
          color: #1a3a5c;
          font-weight: 800;
        }

        .section-title h2 i {
          color: #ffc107;
          margin-right: 10px;
        }

        .underline {
          width: 80px;
          height: 3px;
          background: #ffc107;
          margin: 0.75rem auto;
          border-radius: 2px;
        }

        .section-subtitle { color: #64748b; font-size: 0.9rem; }

        .social-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 1.25rem;
        }

        .social-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1.75rem 1.25rem;
          background: #f8fafc;
          border-radius: 16px;
          text-decoration: none;
          transition: all 0.3s ease;
          border: 1px solid #eef2f8;
        }

        .social-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 15px 30px rgba(0,0,0,0.08);
          border-color: var(--social-color);
        }

        .social-icon {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 1rem;
          transition: transform 0.3s ease;
        }

        .social-card:hover .social-icon { transform: scale(1.1); }

        .social-icon i { font-size: 1.35rem; color: white; }

        .social-card h3 {
          color: #1a3a5c;
          margin: 0 0 4px;
          font-size: 1rem;
          font-weight: 700;
        }

        .social-card p {
          font-size: 0.75rem;
          color: #64748b;
          margin: 0 0 0.75rem;
          text-align: center;
        }

        .follow-btn {
          font-size: 0.78rem;
          color: var(--social-color);
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }

        /* ============ FAQ SECTION ============ */
        .contact-faq {
          padding: 4rem 0;
          background: #f8fafc;
        }

        .faq-header {
          text-align: center;
          margin-bottom: 2.5rem;
        }

        .faq-header i {
          font-size: 2.2rem;
          color: #ffc107;
          margin-bottom: 0.75rem;
        }

        .faq-header h2 {
          color: #1a3a5c;
          margin-bottom: 0.35rem;
          font-weight: 800;
        }

        .faq-header p { color: #64748b; font-size: 0.9rem; }

        .faq-grid {
          max-width: 850px;
          margin: 0 auto;
        }

        .faq-card {
          background: #ffffff;
          border-radius: 14px;
          margin-bottom: 0.85rem;
          overflow: hidden;
          border: 1px solid #eef2f8;
          transition: all 0.3s ease;
        }

        .faq-card.active {
          border-color: #ffc107;
          box-shadow: 0 8px 24px rgba(255, 193, 7, 0.15);
        }

        .faq-question {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.15rem 1.5rem;
          cursor: pointer;
          transition: 0.3s;
          gap: 1rem;
        }

        .faq-question-content {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .faq-question-content i { color: #ffc107; }

        .faq-question-content h3 {
          font-size: 0.98rem;
          margin: 0;
          color: #1a3a5c;
          font-weight: 700;
        }

        .faq-question > i { color: #94a3b8; }

        .faq-answer {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.4s ease;
          padding: 0 1.5rem;
        }

        .faq-answer.active {
          max-height: 300px;
          padding: 0 1.5rem 1.25rem;
        }

        .faq-answer p {
          color: #475569;
          line-height: 1.65;
          margin: 0;
          font-size: 0.9rem;
        }

        .faq-more {
          text-align: center;
          margin-top: 2rem;
          font-size: 0.9rem;
          color: #64748b;
        }

        .faq-more a {
          color: #d4a017;
          text-decoration: none;
          font-weight: 700;
        }

        .faq-more a:hover { text-decoration: underline; }

        /* ============ EMERGENCY BANNER ============ */
        .emergency-banner {
          background: #1e3c72;
          padding: 2.5rem 0;
          border-top: 4px solid #ffc107;
        }

        .emergency-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1.5rem;
        }

        .emergency-icon {
          flex-shrink: 0;
          width: 60px;
          height: 60px;
          border-radius: 16px;
          background: rgba(255, 193, 7, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .emergency-icon i {
          font-size: 1.6rem;
          color: #ffc107;
        }

        .emergency-text h3 {
          color: white;
          margin: 0 0 4px;
          font-size: 1.2rem;
          font-weight: 800;
        }

        .emergency-text p {
          color: rgba(255,255,255,0.8);
          margin: 0;
          font-size: 0.85rem;
        }

        .emergency-number {
          display: flex;
          flex-direction: column;
        }

        .emergency-number span {
          font-size: 1.35rem;
          font-weight: 800;
          color: #ffc107;
          letter-spacing: -0.5px;
        }

        .emergency-number small {
          color: rgba(255,255,255,0.7);
          font-size: 0.75rem;
        }

        .emergency-btn {
          background: #ffc107;
          color: #1a3a5c;
          border: none;
          padding: 13px 26px;
          border-radius: 30px;
          cursor: pointer;
          font-weight: 700;
          font-family: inherit;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .emergency-btn:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 26px rgba(255, 193, 7, 0.45);
        }

        /* ============ RESPONSIVE ============ */
        @media (max-width: 992px) {
          .hero-grid {
            grid-template-columns: 1fr;
            gap: 2.5rem;
          }

          .hero-left { text-align: center; }
          .hero-left p { margin-left: auto; margin-right: auto; }
          .hero-quick-actions { justify-content: center; }

          .hero-right {
            flex-direction: row;
            flex-wrap: wrap;
            justify-content: center;
          }

          .hero-stat-card {
            flex: 1 1 calc(50% - 0.5rem);
            min-width: 220px;
          }

          .quick-dock {
            grid-template-columns: 1fr 1fr;
          }

          .quick-dock-item:not(:last-child)::after { display: none; }

          .form-map-grid {
            grid-template-columns: 1fr;
            gap: 2rem;
          }
        }

        @media (max-width: 640px) {
          .contact-hero { padding: 3.5rem 0; }
          .hero-left h1 { font-size: 2rem; }
          .hero-left p { font-size: 0.95rem; }

          .hero-quick-actions {
            flex-direction: column;
            width: 100%;
          }

          .hero-action-btn { justify-content: center; }

          .hero-right { flex-direction: column; }
          .hero-stat-card { flex: 1 1 100%; }

          .quick-dock { grid-template-columns: 1fr; }

          .contact-form-container { padding: 1.75rem; }
          .form-row { grid-template-columns: 1fr; gap: 1rem; }

          .mini-info-grid { grid-template-columns: 1fr; }

          .newsletter-card { flex-direction: column; text-align: center; }
          .newsletter-left { flex-direction: column; text-align: center; }
          .newsletter-form { flex-direction: column; max-width: 100%; width: 100%; }
          .newsletter-form button { justify-content: center; }

          .social-grid { grid-template-columns: repeat(2, 1fr); }

          .emergency-content {
            flex-direction: column;
            text-align: center;
          }

          .emergency-number { align-items: center; }

          .form-header { flex-direction: column; text-align: center; }
        }
      `}</style>
    </>
  );
};

export default ContactPage;