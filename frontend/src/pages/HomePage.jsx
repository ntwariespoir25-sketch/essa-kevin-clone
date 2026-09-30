import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

// ── Images ──
import heroBg from '../assets/hero-bg.jpg';
import campusImage from '../assets/campus.png';
import studentsImage from '../assets/students.png';
import classroomImg from '../assets/classroom.png';
import libraryImg from '../assets/library.png';
import footballImg from '../assets/football.png';
import basketballImg from '../assets/basketball.png';
import scienceLabImg from '../assets/science-lab.png';
import musicImg from '../assets/music.png';
import artImg from '../assets/art.png';
import graduationImg from '../assets/graduation.png';
import debateClubImg from '../assets/debate-club.png';
import musicClubImg from '../assets/music-club.png';
import sportsClubImg from '../assets/sports-club.png';

// ── Program cards ──
import sodEssa from '../assets/sod essa.png';
import accEssa from '../assets/acc essa.png';
import torEssa from '../assets/tor essa.png';
import bdcEssa from '../assets/bdc essa.png';
import fboEssa from '../assets/fbo essa.png';
import csaEssa from '../assets/csa essa.png';

// ═══════════════════════════════════════════════════════════
// HERO SLIDES — full-bleed photo, text overlaid (like the reference)
// ═══════════════════════════════════════════════════════════
const heroSlides = [
  {
    image: heroBg,
    eyebrow: 'Excellence in Education',
    titleLead: 'Shaping Futures,',
    titleHighlight: 'Building Leaders',
    text: 'Welcome to ESSA Nyarugunga — a center of academic excellence, discipline, and holistic development in Kigali.',
    primary: { label: 'Apply Now', to: '/admissions', icon: 'fas fa-user-graduate' },
    secondary: { label: 'Learn More', to: '/about', icon: 'fas fa-play-circle' },
  },
  {
    image: studentsImage,
    eyebrow: 'Career-Focused Programs',
    titleLead: 'Six Pathways to',
    titleHighlight: 'Your Future',
    text: 'From Software Development to Tourism — explore modern TVET programs designed for real careers.',
    primary: { label: 'View Programs', to: '/academics', icon: 'fas fa-graduation-cap' },
    secondary: { label: 'Talk to Us', to: '/contact', icon: 'fas fa-headset' },
  },
  {
    image: campusImage,
    eyebrow: 'A Campus Built for Learning',
    titleLead: 'Modern Facilities,',
    titleHighlight: 'Real Opportunity',
    text: 'Smart classrooms, labs, a library, sports grounds, and safe dormitories — everything students need to thrive.',
    primary: { label: 'Take a Tour', to: '/gallery', icon: 'fas fa-images' },
    secondary: { label: 'About the School', to: '/about', icon: 'fas fa-school' },
  },
];

const HomePage = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [counterValues, setCounterValues] = useState({ students: 0, teachers: 0, years: 0 });
  const [activeGalleryFilter, setActiveGalleryFilter] = useState('all');
  const sliderRef = useRef(null);

  // ═══════════ Data ═══════════
  const galleryItems = [
    { id: 1, category: 'academic', img: classroomImg, title: 'Classroom Session', subtitle: 'Academic Excellence' },
    { id: 2, category: 'sports', img: footballImg, title: 'Football Match', subtitle: 'Sports Day' },
    { id: 3, category: 'cultural', img: musicImg, title: 'Music Concert', subtitle: 'Cultural Event' },
    { id: 4, category: 'academic', img: scienceLabImg, title: 'Science Lab', subtitle: 'Lab Session' },
    { id: 5, category: 'sports', img: basketballImg, title: 'Basketball', subtitle: 'Basketball Tournament' },
    { id: 6, category: 'cultural', img: artImg, title: 'Art Exhibition', subtitle: 'Student Art' },
    { id: 7, category: 'academic', img: libraryImg, title: 'Library', subtitle: 'Reading Session' },
    { id: 8, category: 'events', img: graduationImg, title: 'Graduation', subtitle: 'Graduation Ceremony' },
  ];

  const programs = [
    { id: 1, name: 'Software Development', icon: 'fas fa-code', img: sodEssa,
      text: 'Design, build, test, and maintain computer programs using modern programming languages and tools.' },
    { id: 2, name: 'Accounting', icon: 'fas fa-calculator', img: accEssa,
      text: 'Record, organize, and analyze financial transactions for individuals and businesses.' },
    { id: 3, name: 'Computer Systems', icon: 'fas fa-microchip', img: csaEssa,
      text: 'Understand how computer hardware and software interact, plus networking and maintenance.' },
    { id: 4, name: 'Tourism', icon: 'fas fa-hotel', img: torEssa,
      text: 'Explore the travel and hospitality industry, customer service, and cultural awareness.' },
   
  ];

  const clubs = [
    { id: 1, name: 'Debate Club', icon: 'fas fa-microphone-alt', img: debateClubImg,
      description: 'Develop public speaking, critical thinking, and leadership skills through friendly competitions and inter-school debates.',
      schedule: 'Every Friday, 3:30 PM', venue: 'Debate Hall', members: 50, achievement: '15+ awards' },
    { id: 2, name: 'Music Club', icon: 'fas fa-music', img: musicClubImg,
      description: 'Learn instruments, choir singing, and modern music production. Annual concerts and school performances.',
      schedule: 'Tue & Thu, 4:00 PM', venue: 'Music Room', members: 38, achievement: '2 bands' },
    { id: 3, name: 'Sports Club', icon: 'fas fa-futbol', img: sportsClubImg,
      description: 'Football, basketball, volleyball, athletics, and more. Join school teams and regional tournaments.',
      schedule: 'Mon/Wed/Fri, 3:30 PM', venue: 'Playground / Gym', members: 120, achievement: '8 medals' },
  ];

  const spiritualActivities = [
    { icon: 'fas fa-praying-hands', title: 'Morning Prayer', description: 'Daily assembly starts with prayer and reflection (7:45 AM)' },
    { icon: 'fas fa-bible', title: 'Weekly Mass / Service', description: 'Sunday: Catholic Mass (8 AM) · Protestant Service (10 AM)' },
    { icon: 'fas fa-heart', title: 'Choir Ministry', description: 'Join the school choir for Sunday services and special events' },
    { icon: 'fas fa-hands-helping', title: 'Charity Outreach', description: 'Visit local communities, donate supplies, and serve the needy' },
    { icon: 'fas fa-calendar-week', title: 'Retreats & Recollections', description: 'Termly spiritual retreats for character formation' },
    { icon: 'fas fa-user-graduate', title: 'Guidance & Counseling', description: 'Moral and spiritual guidance sessions every Thursday' },
  ];

  const partners = [
    { id: 1, name: 'Ministry of Education', short: 'MINEDUC', icon: 'fas fa-landmark', type: 'Government',
      description: 'National education policy, curriculum standards, and school oversight.' },
    { id: 2, name: 'Rwanda Education Board', short: 'REB', icon: 'fas fa-book-open-reader', type: 'Government',
      description: 'Curriculum development, teacher training, and quality assurance.' },
    { id: 3, name: 'Rwanda TVET Board', short: 'RTB', icon: 'fas fa-tools', type: 'Government',
      description: 'Technical & vocational training accreditation and skills development.' },
    { id: 4, name: 'Kicukiro District', short: 'District', icon: 'fas fa-city', type: 'Local Government',
      description: 'Local administration, infrastructure support, and community engagement.' },
    { id: 5, name: 'Parents & Guardians', short: 'Parents', icon: 'fas fa-people-roof', type: 'Community',
      description: 'Active partnership in student learning, well-being, and school governance.' },
    { id: 6, name: 'Alumni Association', short: 'Alumni', icon: 'fas fa-user-graduate', type: 'Community',
      description: 'Mentorship, career guidance, and giving back to the school community.' },
    { id: 7, name: 'NESA', short: 'NESA', icon: 'fas fa-clipboard-check', type: 'Government',
      description: 'National Examinations and School Inspection Authority — assessment standards.' },
    { id: 8, name: 'Industry Partners', short: 'Industry', icon: 'fas fa-handshake', type: 'Private Sector',
      description: 'Internships, apprenticeships, and job placement for TVET graduates.' },
  ];

  // ═══════════ Effects ═══════════
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 6500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const targets = { students: 800, teachers: 20, years: 20 };
    const duration = 2000;
    const stepTime = 20;
    const steps = duration / stepTime;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      if (step <= steps) {
        setCounterValues({
          students: Math.floor((targets.students * step) / steps),
          teachers: Math.floor((targets.teachers * step) / steps),
          years: Math.floor((targets.years * step) / steps),
        });
      } else {
        setCounterValues(targets);
        clearInterval(interval);
      }
    }, stepTime);

    return () => clearInterval(interval);
  }, []);

  // ═══════════ Handlers ═══════════
  const nextSlide = () => setCurrentSlide((p) => (p + 1) % heroSlides.length);
  const prevSlide = () => setCurrentSlide((p) => (p - 1 + heroSlides.length) % heroSlides.length);

  const handleJoinClub = (clubName) => {
    Swal.fire({
      title: `Join ${clubName}`,
      text: 'Please visit the school administration office to register for this club.',
      icon: 'info',
      confirmButtonText: 'OK, got it',
      confirmButtonColor: '#1e3c72',
    });
  };

  const handleViewImage = (img, title) => {
    Swal.fire({
      imageUrl: img,
      imageAlt: title,
      title,
      showCloseButton: true,
      showConfirmButton: false,
      width: '800px',
    });
  };

  const handlePartnerClick = (partner) => {
    Swal.fire({
      title: partner.name,
      html: `
        <div style="text-align: left;">
          <p style="display: inline-block; background: #eef4ff; color: #1e3c72; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; margin-bottom: 12px;">${partner.type}</p>
          <p style="color: #475569; line-height: 1.6;">${partner.description}</p>
          <hr style="margin: 16px 0; border: 0; border-top: 1px solid #eef1f6;">
          <p style="font-size: 0.85rem; color: #64748b;">For more information about our partnership with <strong>${partner.name}</strong>, please contact the school administration.</p>
        </div>
      `,
      icon: 'info',
      confirmButtonText: 'Got it',
      confirmButtonColor: '#1e3c72',
    });
  };

  const filteredGallery = activeGalleryFilter === 'all'
    ? galleryItems
    : galleryItems.filter((item) => item.category === activeGalleryFilter);

  return (
    <>
      <Navbar />

      {/* ═══════════════ HERO — full-bleed photo with centered text over it ═══════════════ */}
      <section className="hero" ref={sliderRef}>
        <div className="hero-slider">
          {heroSlides.map((slide, i) => (
            <div
              key={i}
              className={`hero-bg ${i === currentSlide ? 'active' : ''}`}
              style={{ backgroundImage: `url(${slide.image})` }}
            />
          ))}
          <div className="hero-overlay" aria-hidden="true" />
        </div>

        <div className="container hero-content">
          <div className="hero-inner">
            <span className="hero-eyebrow">
              <i className="fas fa-star-of-life" aria-hidden="true" />
              {heroSlides[currentSlide].eyebrow}
            </span>

            <h1 className="hero-title">
              {heroSlides[currentSlide].titleLead}{' '}
              <span className="highlight">{heroSlides[currentSlide].titleHighlight}</span>
            </h1>

            <p className="hero-text">{heroSlides[currentSlide].text}</p>

            <div className="hero-actions">
              <Link to={heroSlides[currentSlide].primary.to} className="btn btn-primary">
                <i className={heroSlides[currentSlide].primary.icon} aria-hidden="true" />
                {heroSlides[currentSlide].primary.label}
              </Link>
              <Link to={heroSlides[currentSlide].secondary.to} className="btn btn-secondary">
                <i className={heroSlides[currentSlide].secondary.icon} aria-hidden="true" />
                {heroSlides[currentSlide].secondary.label}
              </Link>
            </div>
          </div>
        </div>

        <button className="hero-arrow prev" onClick={prevSlide} aria-label="Previous slide">
          <i className="fas fa-chevron-left" aria-hidden="true" />
        </button>
        <button className="hero-arrow next" onClick={nextSlide} aria-label="Next slide">
          <i className="fas fa-chevron-right" aria-hidden="true" />
        </button>

        <div className="hero-dots" role="tablist" aria-label="Hero slides">
          {heroSlides.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === currentSlide}
              className={`dot ${i === currentSlide ? 'active' : ''}`}
              onClick={() => setCurrentSlide(i)}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      </section>

      {/* ═══════════════ QUICK ACCESS ═══════════════ */}
      <section className="quick-strip">
        <div className="container">
          <div className="quick-grid">
            <Link to="/admissions" className="quick-card">
              <span className="quick-icon"><i className="fas fa-door-open" /></span>
              <span className="quick-text">
                <strong>Admissions Open</strong>
                <small>Apply for 2026–2027</small>
              </span>
              <i className="fas fa-arrow-right quick-arrow" />
            </Link>
            <Link to="/academics" className="quick-card">
              <span className="quick-icon"><i className="fas fa-graduation-cap" /></span>
              <span className="quick-text">
                <strong>Academic Programs</strong>
                <small>6 career pathways</small>
              </span>
              <i className="fas fa-arrow-right quick-arrow" />
            </Link>
            <Link to="/gallery" className="quick-card">
              <span className="quick-icon"><i className="fas fa-images" /></span>
              <span className="quick-text">
                <strong>Campus Gallery</strong>
                <small>Explore student life</small>
              </span>
              <i className="fas fa-arrow-right quick-arrow" />
            </Link>
            <Link to="/contact" className="quick-card">
              <span className="quick-icon"><i className="fas fa-headset" /></span>
              <span className="quick-text">
                <strong>Get in Touch</strong>
                <small>Visit or call us</small>
              </span>
              <i className="fas fa-arrow-right quick-arrow" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════ ABOUT ═══════════════ */}
      <section className="about">
        <div className="container">
          <div className="section-title">
            <h2><i className="fas fa-school" /> About ESSA Nyarugunga</h2>
            <div className="underline" />
          </div>
          <div className="about-grid">
            <div className="about-text">
              <p>Founded with a mission to provide quality education, ESSA Nyarugunga is one of the respected secondary schools in Kigali's Kicukiro District. We offer a nurturing environment where students grow academically, socially, and spiritually.</p>
              <p>Our dedicated staff and modern facilities ensure that every learner reaches their full potential. We follow the Rwandan national curriculum with a focus on technology, economics, and character formation.</p>
              <ul className="feature-list">
                <li><i className="fas fa-check-circle" /> Modern facilities &amp; smart classrooms</li>
                <li><i className="fas fa-check-circle" /> Computer lab with high-speed internet</li>
                <li><i className="fas fa-check-circle" /> Library &amp; quiet reading rooms</li>
                <li><i className="fas fa-check-circle" /> Sports fields &amp; recreational areas</li>
              </ul>
              <div className="stats">
                <div className="stat"><h3>{counterValues.students}+</h3><p><i className="fas fa-user-graduate" /> Students</p></div>
                <div className="stat"><h3>{counterValues.teachers}+</h3><p><i className="fas fa-chalkboard-user" /> Teachers</p></div>
                <div className="stat"><h3>{counterValues.years}+</h3><p><i className="fas fa-award" /> Years of Excellence</p></div>
              </div>
            </div>
            <div className="about-image">
              <img src={campusImage} alt="ESSA Nyarugunga campus" className="about-real-image" />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ ACADEMIC PROGRAMS ═══════════════ */}
      <section className="academics">
        <div className="container">
          <div className="section-title">
            <h2><i className="fas fa-graduation-cap" /> Academic Programs</h2>
            <div className="underline" />
            <p className="section-subtitle">Explore our diverse range of career-focused programs</p>
          </div>
          <div className="cards">
            {programs.map((p) => (
              <div key={p.id} className="card">
                <div className="card-icon"><i className={p.icon} /></div>
                <img src={p.img} alt={p.name} className="card-image" />
                <h3>{p.name}</h3>
                <p>{p.text}</p>
                <Link to="/academics" className="card-link">
                  Learn More <i className="fas fa-arrow-right" />
                </Link>
              </div>
            ))}
          </div>
          <div className="trades-btn-container">
            <Link to="/academics" className="btn-trades">
              <i className="fas fa-th-large" /> View All Trades &amp; Programs <i className="fas fa-arrow-right" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════ STUDENT LIFE ═══════════════ */}
      <section className="student-life">
        <div className="container">
          <div className="section-title">
            <h2><i className="fas fa-users" /> Student Life at ESSA</h2>
            <div className="underline" />
            <p className="section-subtitle">Beyond academics — discover, grow, and belong</p>
          </div>

          <div className="clubs-section">
            <h3 className="section-heading"><i className="fas fa-futbol" /> Student Clubs &amp; Activities</h3>
            <div className="clubs-grid">
              {clubs.map((club) => (
                <div key={club.id} className="club-card">
                  <img src={club.img} alt={club.name} className="club-real-image" />
                  <h4><i className={club.icon} /> {club.name}</h4>
                  <p>{club.description}</p>
                  <div className="club-details">
                    <span><i className="fas fa-calendar-week" /> {club.schedule}</span>
                    <span><i className="fas fa-map-marker-alt" /> {club.venue}</span>
                  </div>
                  <div className="club-stats">
                    <span><i className="fas fa-users" /> {club.members}+ members</span>
                    <span><i className="fas fa-trophy" /> {club.achievement}</span>
                  </div>
                  <button className="join-btn" onClick={() => handleJoinClub(club.name)}>
                    <i className="fas fa-hand-peace" /> How to Join
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="spiritual-section">
            <h3 className="section-heading"><i className="fas fa-church" /> Chapel &amp; Spiritual Life</h3>
            <div className="spiritual-grid">
              {spiritualActivities.map((item, i) => (
                <div key={i} className="spiritual-card">
                  <i className={item.icon} />
                  <h4>{item.title}</h4>
                  <p>{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ GALLERY ═══════════════ */}
      <section className="gallery">
        <div className="container">
          <div className="section-title">
            <h2><i className="fas fa-images" /> Our Gallery</h2>
            <div className="underline" />
            <p className="section-subtitle">Moments that define our journey</p>
          </div>
          <div className="gallery-filters">
            {[
              { id: 'all', label: 'All' },
              { id: 'academic', label: 'Academic' },
              { id: 'sports', label: 'Sports' },
              { id: 'cultural', label: 'Cultural' },
              { id: 'events', label: 'Events' },
            ].map((f) => (
              <button
                key={f.id}
                className={`filter-btn ${activeGalleryFilter === f.id ? 'active' : ''}`}
                onClick={() => setActiveGalleryFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="gallery-grid">
            {filteredGallery.map((item) => (
              <button
                key={item.id}
                type="button"
                className="gallery-item"
                onClick={() => handleViewImage(item.img, item.title)}
                aria-label={`View ${item.title}`}
              >
                <img src={item.img} alt={item.title} className="gallery-real-image" />
                <div className="gallery-overlay">
                  <i className="fas fa-search-plus" />
                  <p>{item.subtitle || item.title}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="gallery-btn-container">
            <Link to="/gallery" className="btn btn-outline">
              <i className="fas fa-images" /> View All Images <i className="fas fa-arrow-right" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════ STAKEHOLDERS & PARTNERS ═══════════════ */}
      <section className="partners">
        <div className="container">
          <div className="section-title">
            <h2><i className="fas fa-handshake" /> Stakeholders &amp; Partners</h2>
            <div className="underline" />
            <p className="section-subtitle">
              We work hand in hand with government, community, and industry partners
              to deliver quality education and real opportunities for our students.
            </p>
          </div>
        </div>

        <div className="partners-rail">
          <div className="partners-track">
            {[...partners, ...partners].map((partner, i) => (
              <button
                key={`${partner.id}-${i}`}
                type="button"
                className="partner-card"
                onClick={() => handlePartnerClick(partner)}
                aria-label={`Learn about ${partner.name}`}
              >
                <span className={`partner-type partner-type-${partner.type.toLowerCase().replace(/\s+/g, '-')}`}>
                  {partner.type}
                </span>
                <span className="partner-logo">
                  <i className={partner.icon} aria-hidden="true" />
                </span>
                <span className="partner-name">{partner.name}</span>
                <span className="partner-short">{partner.short}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="container">
          <div className="partners-cta">
            <p>Interested in partnering with ESSA Nyarugunga or supporting our students?</p>
            <Link to="/contact" className="btn btn-outline">
              <i className="fas fa-handshake" /> Become a Partner
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════ ADMISSIONS ═══════════════ */}
      <section className="admissions">
        <div className="container">
          <div className="section-title">
            <h2><i className="fas fa-door-open" /> Admissions</h2>
            <div className="underline" />
          </div>
          <div className="admissions-grid">
            <div className="admissions-info">
              <h3>Join Our Family</h3>
              <p>Applications are open for the 2026–2027 academic year. Limited seats available in Technology, Economics, and Computer Science combinations.</p>
              <div className="info-boxes">
                <div className="info-box">
                  <i className="fas fa-calendar-alt" />
                  <h4>Application Period</h4>
                  <p>January – September 2026</p>
                </div>
                <div className="info-box">
                  <i className="fas fa-file-alt" />
                  <h4>Requirements</h4>
                  <p>Report cards, birth certificate, entrance exam</p>
                </div>
                <div className="info-box">
                  <i className="fas fa-dollar-sign" />
                  <h4>Scholarships</h4>
                  <p>Merit-based &amp; need-based available</p>
                </div>
              </div>
              <div className="admissions-buttons">
                <Link to="/admissions" className="btn btn-primary">
                  <i className="fas fa-user-graduate" /> Admissions
                </Link>
                <Link to="/admissions" className="btn btn-outline">
                  <i className="fas fa-globe" /> Apply Online
                </Link>
              </div>
            </div>
            <div className="admissions-image">
              <img src={studentsImage} alt="Students studying" className="admissions-real-image" />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ CTA BANNER ═══════════════ */}
      <section className="cta-banner">
        <div className="container">
          <div className="cta-inner">
            <div className="cta-text">
              <h2>Ready to join ESSA Nyarugunga?</h2>
              <p>Start your journey today — applications for 2026–2027 are open.</p>
            </div>
            <div className="cta-actions">
              <Link to="/admissions" className="btn btn-secondary">
                <i className="fas fa-user-graduate" /> Apply Now
              </Link>
              <Link to="/contact" className="btn btn-outline-light">
                <i className="fas fa-calendar-alt" /> Schedule a Visit
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />

      <style>{`
        /* ═══════════ GLOBAL HELPERS ═══════════ */
        .section-title { text-align: center; margin-bottom: 3rem; }
        .section-title h2 {
          font-size: 2rem; color: #1e3c72;
          display: inline-flex; align-items: center; gap: 12px;
          font-weight: 800; letter-spacing: -.5px;
        }
        .section-title h2 i { color: #ffc107; }
        .underline { width: 80px; height: 3px; background: #ffc107; margin: 12px auto 0; border-radius: 2px; }
        .section-subtitle { color: #64748b; font-size: .92rem; margin-top: .75rem; max-width: 680px; margin-left: auto; margin-right: auto; line-height: 1.6; }

        /* ═══════════ HERO — full-bleed photo, text over it ═══════════ */
        .hero {
          position: relative;
          min-height: 82vh;
          display: flex;
          align-items: center;
          overflow: hidden;
          background: #0a1e3d;
        }

        .hero-slider {
          position: absolute;
          inset: 0;
          z-index: 0;
        }

        .hero-bg {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          opacity: 0;
          transform: scale(1.04);
          transition: opacity 1.3s ease-in-out, transform 6s ease-out;
        }
        .hero-bg.active {
          opacity: 1;
          z-index: 1;
          transform: scale(1);
        }

        /* Soft light overlay — like the reference image */
        .hero-overlay {
          position: absolute;
          inset: 0;
          z-index: 2;
          background:
            linear-gradient(180deg,
              rgba(255, 255, 255, 0.10) 0%,
              rgba(245, 240, 220, 0.20) 45%,
              rgba(20, 40, 80, 0.35) 100%),
            linear-gradient(135deg,
              rgba(30, 60, 114, 0.35) 0%,
              rgba(255, 193, 7, 0.10) 100%);
          mix-blend-mode: normal;
        }

        .hero-content {
          position: relative;
          z-index: 3;
          width: 100%;
          text-align: center;
          color: #fff;
        }

        .hero-inner {
          max-width: 900px;
          margin: 0 auto;
          padding: 3rem 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.4rem;
          animation: heroFade 0.8s ease both;
        }
        @keyframes heroFade {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .hero-eyebrow {
          display: inline-flex; align-items: center; gap: 10px;
          background: rgba(255, 193, 7, 0.85);
          color: #1e3c72;
          padding: 9px 22px;
          border-radius: 30px;
          font-size: .8rem;
          font-weight: 800;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          box-shadow: 0 8px 24px rgba(255, 193, 7, 0.35);
        }
        .hero-eyebrow i { font-size: .85rem; }

        .hero-title {
          font-size: clamp(2rem, 1.4rem + 3.2vw, 3.6rem);
          font-weight: 900;
          letter-spacing: -1px;
          line-height: 1.12;
          color: #fff;
          text-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
          margin: 0;
        }
        .hero-title .highlight { color: #ffc107; }

        .hero-text {
          font-size: clamp(.95rem, .85rem + .4vw, 1.15rem);
          color: rgba(255, 255, 255, 0.94);
          line-height: 1.7;
          max-width: 720px;
          margin: 0;
          text-shadow: 0 2px 14px rgba(0, 0, 0, 0.4);
        }

        .hero-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
          margin-top: .5rem;
        }

        /* Buttons — matches reference (gold primary, glass secondary) */
        .btn-primary {
          background: #ffc107; color: #1e3c72;
          padding: 14px 32px; border-radius: 30px;
          text-decoration: none; font-weight: 800;
          transition: all 0.3s ease;
          display: inline-flex; align-items: center; gap: 10px;
          box-shadow: 0 10px 28px rgba(255, 193, 7, 0.4);
          font-size: 1rem;
          border: 2px solid #ffc107;
        }
        .btn-primary:hover {
          background: #e0a800; border-color: #e0a800;
          transform: translateY(-3px);
          box-shadow: 0 14px 34px rgba(255, 193, 7, 0.55);
        }

        .btn-secondary {
          background: rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(10px);
          color: #fff;
          padding: 14px 32px; border-radius: 30px;
          text-decoration: none; font-weight: 700;
          border: 2px solid rgba(255, 255, 255, 0.75);
          transition: all 0.3s ease;
          display: inline-flex; align-items: center; gap: 10px;
          font-size: 1rem;
        }
        .btn-secondary:hover {
          background: #fff; color: #1e3c72;
          border-color: #fff;
          transform: translateY(-3px);
          box-shadow: 0 12px 30px rgba(255, 255, 255, 0.25);
        }

        /* Hero arrows + dots */
        .hero-arrow {
          position: absolute; top: 50%; transform: translateY(-50%);
          width: 50px; height: 50px; border-radius: 50%;
          background: rgba(255,255,255,0.15);
          border: 1px solid rgba(255,255,255,0.35);
          color: #fff; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.25s ease;
          backdrop-filter: blur(8px);
          z-index: 5;
        }
        .hero-arrow:hover { background: #ffc107; color: #1e3c72; border-color: #ffc107; transform: translateY(-50%) scale(1.05); }
        .hero-arrow.prev { left: 24px; }
        .hero-arrow.next { right: 24px; }

        .hero-dots {
          position: absolute; bottom: 28px; left: 50%;
          transform: translateX(-50%);
          display: flex; gap: 10px; z-index: 6;
        }
        .dot {
          width: 10px; height: 10px;
          background: rgba(255,255,255,0.5);
          border: none; border-radius: 50%;
          cursor: pointer; transition: all 0.3s ease; padding: 0;
        }
        .dot.active { background: #ffc107; width: 30px; border-radius: 6px; }
        .dot:hover { background: #ffc107; }

        /* ═══════════ QUICK ACCESS ═══════════ */
        .quick-strip { background: #fff; padding: 2rem 0 3rem; margin-top: -3rem; position: relative; z-index: 5; }
        .quick-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
        .quick-card {
          display: flex; align-items: center; gap: 14px;
          padding: 1.15rem 1.25rem; background: #fff;
          border-radius: 14px; text-decoration: none;
          box-shadow: 0 10px 30px rgba(30,60,114,0.09);
          border: 1px solid #eef1f6; transition: all 0.3s ease;
        }
        .quick-card:hover { transform: translateY(-4px); border-color: #ffc107; box-shadow: 0 15px 36px rgba(255,193,7,0.18); }
        .quick-icon {
          flex-shrink: 0; width: 44px; height: 44px; border-radius: 12px;
          background: linear-gradient(135deg, #1e3c72, #2a5298);
          color: #ffc107; display: flex; align-items: center; justify-content: center;
          font-size: 1.05rem;
        }
        .quick-text { display: flex; flex-direction: column; min-width: 0; }
        .quick-text strong { font-size: .9rem; color: #1e3c72; font-weight: 700; }
        .quick-text small { font-size: .75rem; color: #64748b; }
        .quick-arrow { margin-left: auto; color: #ffc107; transition: transform 0.3s ease; }
        .quick-card:hover .quick-arrow { transform: translateX(4px); }

        /* ═══════════ ABOUT ═══════════ */
        .about { padding: 4rem 0; background: #fff; }
        .about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; align-items: center; }
        .about-text { text-align: left; }
        .about-text p { line-height: 1.7; color: #475569; margin-bottom: 1rem; font-size: .95rem; }
        .feature-list {
          list-style: none; padding: 0;
          display: grid; grid-template-columns: repeat(2, 1fr); gap: .75rem; margin: 1.5rem 0;
        }
        .feature-list li { display: flex; align-items: center; gap: 8px; font-size: .88rem; color: #1e3c72; font-weight: 500; }
        .feature-list li i { color: #ffc107; font-size: 1rem; }
        .stats { display: flex; gap: 1.5rem; margin-top: 1.5rem; flex-wrap: wrap; }
        .stat { text-align: left; }
        .stat h3 { font-size: 1.85rem; color: #1e3c72; font-weight: 800; margin-bottom: .15rem; letter-spacing: -.5px; }
        .stat p { font-size: .78rem; color: #64748b; text-transform: uppercase; letter-spacing: .5px; display: flex; align-items: center; gap: 6px; }
        .stat p i { color: #ffc107; }
        .about-real-image { width: 100%; border-radius: 20px; box-shadow: 0 20px 50px rgba(30,60,114,0.15); object-fit: cover; height: 420px; }

        /* ═══════════ ACADEMICS ═══════════ */
        .academics { padding: 4rem 0; background: #f8fafc; }
        .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.5rem; }
        .card {
          text-align: left; padding: 1.5rem; background: #fff; border-radius: 16px;
          transition: all 0.3s ease; border: 1px solid #eef1f6;
          display: flex; flex-direction: column;
        }
        .card:hover { transform: translateY(-6px); box-shadow: 0 18px 40px rgba(30,60,114,0.1); border-color: #ffc107; }
        .card-icon i { font-size: 1.6rem; color: #1e3c72; margin-bottom: 1rem; }
        .card-image { width: 100%; height: 160px; object-fit: cover; border-radius: 10px; margin-bottom: 1rem; }
        .card h3 { font-size: 1.05rem; margin-bottom: .6rem; color: #1e3c72; font-weight: 700; }
        .card p { font-size: .85rem; color: #64748b; line-height: 1.55; margin-bottom: 1rem; flex: 1; }
        .card-link {
          display: inline-flex; align-items: center; gap: 6px;
          color: #b8930a; text-decoration: none; font-weight: 700; font-size: .85rem;
          transition: gap 0.3s ease;
        }
        .card-link:hover { gap: 10px; color: #1e3c72; }
        .trades-btn-container { text-align: center; margin-top: 2.5rem; }
        .btn-trades {
          display: inline-flex; align-items: center; gap: 10px;
          padding: 13px 30px; background: #1e3c72; color: #fff;
          border-radius: 30px; text-decoration: none;
          font-weight: 700; font-size: .92rem;
          transition: all 0.3s ease;
          box-shadow: 0 8px 24px rgba(30,60,114,0.25);
        }
        .btn-trades:hover { background: #ffc107; color: #1e3c72; transform: translateY(-2px); box-shadow: 0 12px 30px rgba(255,193,7,0.4); }

        /* ═══════════ STUDENT LIFE ═══════════ */
        .student-life { padding: 4rem 0; background: #fff; }
        .clubs-section { margin-bottom: 3.5rem; }
        .section-heading {
          font-size: 1.25rem; color: #1e3c72; font-weight: 700;
          margin-bottom: 1.5rem;
          display: inline-flex; align-items: center; gap: 10px;
        }
        .section-heading i { color: #ffc107; }
        .clubs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; }
        .club-card {
          background: #fff; border-radius: 16px; overflow: hidden;
          box-shadow: 0 6px 20px rgba(30,60,114,0.08);
          text-align: left; transition: transform 0.3s ease, box-shadow 0.3s ease;
          border: 1px solid #eef1f6;
        }
        .club-card:hover { transform: translateY(-5px); box-shadow: 0 15px 40px rgba(30,60,114,0.12); }
        .club-real-image { width: 100%; height: 190px; object-fit: cover; }
        .club-card h4 { padding: 1.1rem 1.25rem .5rem; margin: 0; color: #1e3c72; font-size: 1.05rem; display: flex; align-items: center; gap: 8px; }
        .club-card h4 i { color: #ffc107; }
        .club-card p { padding: 0 1.25rem; font-size: .85rem; color: #64748b; line-height: 1.6; }
        .club-details, .club-stats {
          padding: .35rem 1.25rem;
          display: flex; gap: 1rem; flex-wrap: wrap;
          font-size: .75rem; color: #64748b;
        }
        .club-details i, .club-stats i { color: #ffc107; margin-right: 4px; }
        .club-stats { padding-top: .5rem; padding-bottom: .75rem; }
        .join-btn {
          margin: .5rem 1.25rem 1.25rem;
          width: calc(100% - 2.5rem);
          background: #1e3c72; color: #fff;
          border: none; padding: 11px; border-radius: 10px; cursor: pointer;
          font-weight: 600; font-size: .88rem;
          transition: all 0.3s ease;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        }
        .join-btn:hover { background: #ffc107; color: #1e3c72; }

        .spiritual-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.2rem; }
        .spiritual-card {
          background: #f8fafc; padding: 1.35rem 1.25rem;
          border-radius: 14px; text-align: left;
          border-left: 4px solid #ffc107;
          transition: all 0.3s ease;
        }
        .spiritual-card:hover { background: #fff; box-shadow: 0 10px 30px rgba(30,60,114,0.08); transform: translateY(-3px); }
        .spiritual-card i { font-size: 1.5rem; color: #1e3c72; margin-bottom: .6rem; }
        .spiritual-card h4 { color: #1e3c72; font-size: 1rem; margin-bottom: .35rem; font-weight: 700; }
        .spiritual-card p { font-size: .82rem; color: #64748b; line-height: 1.55; margin: 0; }

        /* ═══════════ GALLERY ═══════════ */
        .gallery { padding: 4rem 0; background: #f8fafc; }
        .gallery-filters { display: flex; justify-content: center; gap: .6rem; margin-bottom: 2rem; flex-wrap: wrap; }
        .filter-btn {
          padding: 9px 22px; border: 1.5px solid #1e3c72;
          background: transparent; color: #1e3c72;
          border-radius: 30px; cursor: pointer;
          transition: all 0.3s ease; font-weight: 600; font-size: .85rem;
        }
        .filter-btn.active, .filter-btn:hover { background: #1e3c72; color: #fff; transform: translateY(-2px); }
        .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1.1rem; }
        .gallery-item {
          position: relative; border-radius: 14px; overflow: hidden;
          cursor: pointer; aspect-ratio: 4/3; padding: 0; border: none;
          background: #eef1f6; width: 100%;
        }
        .gallery-real-image { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease; }
        .gallery-item:hover .gallery-real-image { transform: scale(1.08); }
        .gallery-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(to top, rgba(10,30,61,0.85), transparent 60%);
          color: #fff; padding: 1rem;
          display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-start;
          gap: 6px; opacity: 0; transition: opacity 0.3s ease;
        }
        .gallery-item:hover .gallery-overlay { opacity: 1; }
        .gallery-overlay i {
          background: #ffc107; color: #1e3c72;
          width: 36px; height: 36px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: .9rem; margin-bottom: 4px;
        }
        .gallery-overlay p { margin: 0; font-weight: 600; font-size: .85rem; text-align: left; }
        .gallery-btn-container { text-align: center; margin-top: 2.5rem; }

        /* ═══════════ STAKEHOLDERS & PARTNERS — SLIDING RAIL ═══════════ */
        .partners { padding: 4rem 0; background: #fff; overflow: hidden; }
        .partners-rail {
          position: relative;
          overflow: hidden;
          padding: 1.5rem 0 2rem;
          mask-image: linear-gradient(90deg, transparent 0, black 5%, black 95%, transparent 100%);
          -webkit-mask-image: linear-gradient(90deg, transparent 0, black 5%, black 95%, transparent 100%);
        }
        .partners-track {
          display: flex;
          gap: 1.25rem;
          width: max-content;
          padding: 0 1.25rem;
          animation: partnerScroll 45s linear infinite;
        }
        .partners-rail:hover .partners-track { animation-play-state: paused; }

        @keyframes partnerScroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }

        .partner-card {
          position: relative;
          flex: 0 0 auto;
          width: 240px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: .6rem;
          padding: 1.75rem 1rem 1.5rem;
          background: #f8fafc;
          border: 1.5px solid #eef1f6;
          border-radius: 16px;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.3s ease;
          text-align: center;
          min-height: 200px;
        }
        .partner-card:hover {
          transform: translateY(-5px);
          background: #fff;
          border-color: #ffc107;
          box-shadow: 0 16px 40px rgba(30,60,114,0.1);
        }

        .partner-type {
          position: absolute;
          top: 10px; left: 10px;
          font-size: .62rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: .8px;
          padding: 4px 9px; border-radius: 20px;
          background: #eef4ff; color: #1d3f7a; border: 1px solid #cfe0fb;
        }
        .partner-type-government { background: #eef4ff; color: #1d3f7a; border-color: #cfe0fb; }
        .partner-type-local-government { background: #e8f5e9; color: #1b5e20; border-color: #c8e6c9; }
        .partner-type-community { background: #fff4e5; color: #7a4a00; border-color: #ffe0b3; }
        .partner-type-private-sector { background: #f3e5f5; color: #4a148c; border-color: #e1bee7; }

        .partner-logo {
          width: 58px; height: 58px; border-radius: 14px;
          background: linear-gradient(135deg, #1e3c72, #2a5298);
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.3s ease;
          box-shadow: 0 8px 20px rgba(30,60,114,0.2);
        }
        .partner-card:hover .partner-logo { transform: scale(1.08) rotate(-3deg); }
        .partner-logo i { color: #ffc107; font-size: 1.4rem; }

        .partner-name {
          font-size: .9rem; font-weight: 700; color: #1e3c72;
          line-height: 1.35; max-width: 100%;
        }
        .partner-short {
          font-size: .72rem; text-transform: uppercase;
          letter-spacing: 1px; color: #94a3b8; font-weight: 600;
        }

        .partners-cta {
          text-align: center; margin-top: 2rem;
          padding-top: 2rem; border-top: 1px solid #eef1f6;
        }
        .partners-cta p { color: #475569; font-size: .95rem; margin-bottom: 1.25rem; }

        /* ═══════════ ADMISSIONS ═══════════ */
        .admissions { padding: 4rem 0; background: #f8fafc; }
        .admissions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; align-items: center; }
        .admissions-info { text-align: left; }
        .admissions-info h3 { font-size: 1.6rem; color: #1e3c72; margin-bottom: 1rem; font-weight: 800; letter-spacing: -.5px; }
        .admissions-info > p { color: #475569; line-height: 1.7; font-size: .95rem; }
        .info-boxes { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 1rem; margin: 1.75rem 0; }
        .info-box {
          text-align: center; padding: 1.35rem 1rem;
          background: #fff; border-radius: 14px;
          border: 1px solid #eef1f6; transition: all 0.3s ease;
        }
        .info-box:hover { border-color: #ffc107; transform: translateY(-3px); box-shadow: 0 10px 24px rgba(30,60,114,0.06); }
        .info-box i { font-size: 1.4rem; color: #ffc107; margin-bottom: .5rem; }
        .info-box h4 { font-size: .88rem; color: #1e3c72; margin-bottom: .35rem; font-weight: 700; }
        .info-box p { font-size: .78rem; color: #64748b; margin: 0; line-height: 1.45; }
        .admissions-buttons { display: flex; gap: 1rem; flex-wrap: wrap; }
        .admissions-real-image { width: 100%; border-radius: 20px; box-shadow: 0 20px 50px rgba(30,60,114,0.15); object-fit: cover; height: 420px; }

        /* ═══════════ CTA BANNER ═══════════ */
        .cta-banner { background: #1e3c72; padding: 3.5rem 0; }
        .cta-inner { display: flex; align-items: center; justify-content: space-between; gap: 2rem; flex-wrap: wrap; }
        .cta-text h2 { color: #fff; font-size: 1.75rem; margin-bottom: .5rem; font-weight: 800; letter-spacing: -.5px; }
        .cta-text p { color: rgba(255,255,255,0.85); font-size: .95rem; }
        .cta-actions { display: flex; gap: 1rem; flex-wrap: wrap; }

        /* ═══════════ RESPONSIVE ═══════════ */
        @media (max-width: 992px) {
          .quick-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 768px) {
          .hero { min-height: 72vh; }
          .hero-arrow { display: none; }
          .about-grid, .admissions-grid { grid-template-columns: 1fr; }
          .about-image { order: -1; }
          .about-real-image, .admissions-real-image { height: 300px; }
          .feature-list { grid-template-columns: 1fr; }
          .stats { justify-content: flex-start; gap: 1.25rem; }
          .quick-grid { grid-template-columns: 1fr; gap: .75rem; }
          .quick-strip { padding: 1.5rem 0 2rem; margin-top: -1.5rem; }
          .cards { grid-template-columns: 1fr; }
          .clubs-grid { grid-template-columns: 1fr; }
          .spiritual-grid { grid-template-columns: 1fr; }
          .cta-inner { flex-direction: column; text-align: center; }
          .cta-text h2 { font-size: 1.4rem; }
          .section-title h2 { font-size: 1.5rem; }

          .partner-card { width: 200px; padding: 1.5rem .75rem 1.25rem; min-height: 180px; }
          .partner-logo { width: 50px; height: 50px; border-radius: 12px; }
          .partner-logo i { font-size: 1.2rem; }
          .partner-name { font-size: .82rem; }
          .partners-track { animation-duration: 35s; }
        }
        @media (max-width: 480px) {
          .hero { min-height: 68vh; }
          .hero-inner { padding: 2rem 1rem; gap: 1.1rem; }
          .hero-eyebrow { font-size: .68rem; padding: 7px 16px; }
          .btn-primary, .btn-secondary, .btn-outline, .btn-outline-light, .btn-trades { padding: 11px 22px; font-size: .85rem; }
          .gallery-grid { grid-template-columns: repeat(2, 1fr); }
          .partner-short { display: none; }
          .partner-card { width: 170px; min-height: 160px; padding: 1.25rem .5rem; }
          .partner-logo { width: 46px; height: 46px; }
        }
      `}</style>
    </>
  );
};

export default HomePage;