import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

// Import images
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

// API Base URL
const API_URL = import.meta.env.VITE_API_URL;

const AdmissionsPage = () => {
  const [activeFaq, setActiveFaq] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    // Step 1: Student Information
    fullName: '',
    dateOfBirth: '',
    nationality: 'Rwandan',
    nationalId: '',
    email: '',
    phone: '',
    address: '',
    // Step 2: Academic Information
    level: '',
    previousSchool: '',
    lastAverage: '',
    achievements: '',
    // Step 3: Parent/Guardian Information
    parentName: '',
    parentPhone: '',
    parentEmail: '',
    parentOccupation: '',
    // Step 4: Additional Info
    applyScholarship: false,
    hearAboutUs: '',
    agreeTerms: false
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const toggleFaq = (index) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateStep1 = () => {
    const newErrors = {};
    if (!formData.fullName.trim()) newErrors.fullName = 'Full name is required';
    if (!formData.dateOfBirth) newErrors.dateOfBirth = 'Date of birth is required';
    if (!formData.email) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Invalid email format';
    if (!formData.phone) newErrors.phone = 'Phone number is required';
    else if (!/^(\+250|0)[7-9][0-9]{8}$/.test(formData.phone)) newErrors.phone = 'Invalid Rwanda phone number';
    if (!formData.address) newErrors.address = 'Address is required';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors = {};
    if (!formData.level) newErrors.level = 'Please select a level';
    if (!formData.previousSchool) newErrors.previousSchool = 'Previous school is required';
    if (!formData.lastAverage) newErrors.lastAverage = 'Last year average is required';
    else if (formData.lastAverage < 0 || formData.lastAverage > 100) newErrors.lastAverage = 'Average must be between 0 and 100';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep3 = () => {
    const newErrors = {};
    if (!formData.parentName) newErrors.parentName = 'Parent/Guardian name is required';
    if (!formData.parentPhone) newErrors.parentPhone = 'Parent phone is required';
    else if (!/^(\+250|0)[7-9][0-9]{8}$/.test(formData.parentPhone)) newErrors.parentPhone = 'Invalid Rwanda phone number';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep4 = () => {
    const newErrors = {};
    if (!formData.agreeTerms) newErrors.agreeTerms = 'You must agree to the terms and conditions';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    let isValid = false;
    if (currentStep === 1) isValid = validateStep1();
    else if (currentStep === 2) isValid = validateStep2();
    else if (currentStep === 3) isValid = validateStep3();

    if (isValid) {
      setCurrentStep(prev => prev + 1);
      // Scroll only the form section into view (not the whole page to top)
      document.getElementById('application-form')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => prev - 1);
    // Scroll only the form section into view (not the whole page to top)
    document.getElementById('application-form')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateStep4()) return;
    
    setIsSubmitting(true);
    
    try {
      const response = await fetch(`${API_URL}/api/admissions/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const data = await response.json();
      
      if (data.success) {
        Swal.fire({
          title: 'Application Submitted!',
          html: `
            <div style="text-align: left;">
              <p>Thank you <strong>${formData.fullName}</strong> for applying to ESSA Nyarugunga.</p>
              <p><strong>Application Number:</strong> ${data.applicationNumber}</p>
              <p><strong>Status:</strong> <span style="color: #ffc107;">Pending Review</span></p>
              <hr>
              <p>We have sent a confirmation email to <strong>${formData.email}</strong>.</p>
              <p>Our team will contact you within 3-5 business days.</p>
            </div>
          `,
          icon: 'success',
          confirmButtonText: 'OK',
          confirmButtonColor: '#1e3c72'
        });
        
        // Reset form
        setFormData({
          fullName: '',
          dateOfBirth: '',
          nationality: 'Rwandan',
          nationalId: '',
          email: '',
          phone: '',
          address: '',
          level: '',
          previousSchool: '',
          lastAverage: '',
          achievements: '',
          parentName: '',
          parentPhone: '',
          parentEmail: '',
          parentOccupation: '',
          applyScholarship: false,
          hearAboutUs: '',
          agreeTerms: false
        });
        setCurrentStep(1);
      } else {
        throw new Error(data.message || 'Submission failed');
      }
    } catch (error) {
      Swal.fire({
        title: 'Submission Failed',
        text: error.message || 'Failed to submit application. Please try again.',
        icon: 'error',
        confirmButtonColor: '#1e3c72'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScholarshipApply = () => {
    Swal.fire({
      title: 'Scholarship Application',
      text: 'Please complete the online application form below to apply for a scholarship.',
      icon: 'info',
      confirmButtonText: 'Continue to Form',
      confirmButtonColor: '#1e3c72'
    });
    document.getElementById('application-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const faqs = [
    { q: 'When does the application process start?', a: 'Applications open on January 10, 2026 and close on September 30, 2026. We encourage early application as seats are limited.' },
    { q: 'Is there an entrance examination?', a: 'Yes, entrance examinations are held weekly on Saturdays. The exam covers English, Mathematics, and General Knowledge.' },
    { q: 'Can I pay fees in installments?', a: 'Yes, we offer flexible payment plans. Please contact the finance office to discuss an installment plan that works for your family.' },
    { q: 'Is accommodation available?', a: 'Yes, we offer boarding facilities for students who live far from the school. Limited spaces available.' },
    { q: 'What is the school uniform policy?', a: 'All students are required to wear the official ESSA Nyarugunga uniform. Uniforms can be purchased from the school store.' },
    { q: 'How do I check my application status?', a: 'You can check your application status by contacting the admissions office via phone or email with your application reference number.' }
  ];

  const feeStructures = [
    { level: 'Ordinary Level', grades: 'S1 - S3', amount: '304,000', features: ['Tuition', 'Library Access', 'Computer Lab', 'Science Lab Materials', 'Sports Activities'], popular: false, note: '* Additional: Uniform (30,000 RWF) one-time' },
    { level: 'Advanced Level - ICT', grades: 'L3 - L5 SOD and CSA', amount: '349,000', features: ['Tuition', 'Library Access', 'Advanced Computer Labs', 'Internship Placement', 'Career Guidance', 'Certification Prep'], popular: true, note: '* ICT students get laptop learning access' },
    { level: 'Advanced Level - Others', grades: 'Accounting, Tourism, Food and Beverages Operation', amount: '400,000', features: ['Tuition', 'Library Access', 'Laboratory Access', 'Field Trips', 'Study Materials'], popular: false, note: '* Payment plans available upon request' }
  ];

  const hearAboutOptions = ['Social Media', 'Friend/Family', 'School Website', 'Radio/TV', 'School Event', 'Other'];

  const getStepProgress = () => {
    return ((currentStep - 1) / 3) * 100;
  };

  return (
    <>
      <Navbar />

      {/* Hero Section - matches Home page style (static background) */}
      <section className="hero" style={{ backgroundImage: `url(${heroBg})` }}>
        <div className="hero-overlay"></div>

        <div className="container hero-content">
          <div className="hero-badge">
            <i className="fas fa-door-open"></i> BEGIN YOUR JOURNEY
          </div>
          <h1>
            Begin Your Journey to <span className="highlight">Excellence</span> at ESSA Nyarugunga
          </h1>
          <p>
            Join a community of learners shaping the future of Rwanda. Applications are open
            for the 2026–2027 academic year — limited seats available.
          </p>
          <div className="hero-buttons">
            <a href="#application-form" className="btn btn-primary">
              <i className="fas fa-user-graduate"></i> Apply Now
            </a>
            <Link to="/contact" className="btn btn-secondary">
              <i className="fas fa-phone-alt"></i> Contact Admissions
            </Link>
          </div>

          <div className="hero-notice">
            <i className="fas fa-exclamation-triangle"></i> Limited Seats Available - Apply Early!
          </div>
        </div>
      </section>

      {/* Welcome Section */}
      <section className="welcome-section">
        <div className="container">
          <div className="welcome-card">
            <h2><i className="fas fa-star-of-life"></i> Welcome Future Leaders!</h2>
            <p>We are delighted that you are considering ESSA Nyarugunga for your secondary education. Our admissions process is designed to be simple, transparent, and accessible to all qualified students. We look forward to welcoming you to our family!</p>
          </div>
        </div>
      </section>

      {/* Application Process */}
      <section className="application-process">
        <div className="container">
          <div className="section-title">
            <h2><i className="fas fa-clipboard-list"></i> Application Process</h2>
            <div className="underline"></div>
            <p className="section-subtitle">Follow these simple steps to join ESSA Nyarugunga</p>
          </div>
          <div className="process-steps">
            {['Get Application Form', 'Fill & Submit', 'Entrance Assessment', 'Admission Decision', 'Enrollment'].map((step, idx) => (
              <div key={idx} className="step">
                <div className="step-number">{idx + 1}</div>
                <div className="step-content">
                  <h3>{step}</h3>
                  <p>{idx === 0 ? 'Download the form from our website or collect it from the school administration office.' :
                     idx === 1 ? 'Complete the application form with accurate information and attach required documents.' :
                     idx === 2 ? 'Take the entrance examination (English, Mathematics, General Knowledge).' :
                     idx === 3 ? 'Receive admission notification within 7-10 working days.' :
                     'Complete registration, pay fees, and join our academic community.'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Requirements Grid */}
      <section className="requirements-section">
        <div className="container">
          <div className="requirements-grid">
            <div className="requirement-card">
              <i className="fas fa-graduation-cap"></i>
              <h3>Academic Requirements</h3>
              <ul>
                <li><i className="fas fa-check"></i> Completion of Primary 6 (for O-Level)</li>
                <li><i className="fas fa-check"></i> Completion of S3 (for A-Level)</li>
                <li><i className="fas fa-check"></i> Minimum 70% average in previous year</li>
                <li><i className="fas fa-check"></i> Passing score on entrance exam</li>
              </ul>
            </div>
            <div className="requirement-card">
              <i className="fas fa-file-alt"></i>
              <h3>Required Documents</h3>
              <ul>
                <li><i className="fas fa-check"></i> Birth Certificate (2 copies)</li>
                <li><i className="fas fa-check"></i> Last 2 years' Report Cards</li>
                <li><i className="fas fa-check"></i> 4 Passport Photos</li>
                <li><i className="fas fa-check"></i> Medical Certificate</li>
                <li><i className="fas fa-check"></i> Parent/Guardian ID copies</li>
              </ul>
            </div>
            <div className="requirement-card">
              <i className="fas fa-calendar-alt"></i>
              <h3>Important Dates</h3>
              <ul>
                <li><i className="fas fa-check"></i> Applications Open: Jan 10, 2026</li>
                <li><i className="fas fa-check"></i> Deadline: Sept 30, 2026</li>
                <li><i className="fas fa-check"></i> Entrance Exams: Weekly on Saturdays</li>
                <li><i className="fas fa-check"></i> Classes Begin: Oct 15, 2026</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Fee Structure */}
      <section className="fee-structure">
        <div className="container">
          <div className="section-title">
            <h2><i className="fas fa-money-bill-wave"></i> Fee Structure</h2>
            <div className="underline"></div>
            <p className="section-subtitle">Affordable quality education - 2026 Academic Year</p>
          </div>
          <div className="fee-grid">
            {feeStructures.map((fee, index) => (
              <div key={index} className={`fee-card ${fee.popular ? 'popular' : ''}`}>
                {fee.popular && <div className="popular-badge">Most Popular</div>}
                <div className="fee-header">
                  <h3>{fee.level}</h3>
                  <p className="fee-grades">{fee.grades}</p>
                  <div className="fee-amount">
                    <span className="currency">RWF</span>
                    <span className="amount">{fee.amount}</span>
                    <span className="period">per term</span>
                  </div>
                </div>
                <div className="fee-features">
                  <ul>
                    {fee.features.map((feature, idx) => (
                      <li key={idx}><i className="fas fa-check-circle"></i> {feature}</li>
                    ))}
                  </ul>
                </div>
                <div className="fee-note">
                  <p>{fee.note}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="payment-methods">
            <p><i className="fas fa-university"></i> Bank Transfer: Bank of Kigali - Account: 000123456789</p>
            <p><i className="fas fa-mobile-alt"></i> Mobile Money: Airtel Money | MoMo Pay</p>
          </div>
        </div>
      </section>

      {/* Financial Aid */}
      <section className="financial-aid">
        <div className="container">
          <div className="aid-header">
            <i className="fas fa-hand-holding-heart"></i>
            <h2>Scholarships & Financial Aid</h2>
            <p>ESSA Nyarugunga believes that every talented student deserves access to quality education regardless of financial background.</p>
          </div>
          <div className="aid-grid">
            <div className="aid-card">
              <i className="fas fa-trophy"></i>
              <h3>Merit Scholarship</h3>
              <p>For top-performing students</p>
              <span className="aid-percent">50-100% fee waiver</span>
            </div>
            <div className="aid-card">
              <i className="fas fa-heart"></i>
              <h3>Need-Based Scholarship</h3>
              <p>For students from low-income families</p>
              <span className="aid-percent">25-75% fee waiver</span>
            </div>
            <div className="aid-card">
              <i className="fas fa-futbol"></i>
              <h3>Sports & Talent Scholarship</h3>
              <p>For exceptional athletes and artists</p>
              <span className="aid-percent">30% fee waiver</span>
            </div>
          </div>
          <div className="aid-action">
            <button onClick={handleScholarshipApply} className="btn btn-primary">
              <i className="fas fa-graduation-cap"></i> Apply for Scholarship
            </button>
            <p className="scholarship-note">* Limited scholarships available per academic year</p>
          </div>
        </div>
      </section>

      {/* Online Application Form - MULTI-STEP WIZARD */}
      <section id="application-form" className="online-application">
        <div className="container">
          <div className="section-title">
            <h2><i className="fas fa-globe"></i> Online Application</h2>
            <div className="underline"></div>
            <p className="section-subtitle">Complete the multi-step form below to apply for admission</p>
          </div>

          <div className="application-form-container">
            {/* Sticky Progress Header */}
            <div className="progress-card">
              <div className="progress-top">
                <div className="progress-meta">
                  <span className="progress-eyebrow">Step {currentStep} of 4</span>
                  <h3 className="progress-title">
                    {currentStep === 1 && 'Student Information'}
                    {currentStep === 2 && 'Academic Information'}
                    {currentStep === 3 && 'Parent / Guardian Information'}
                    {currentStep === 4 && 'Review & Submit'}
                  </h3>
                </div>
                <span className="progress-percent">{Math.round(getStepProgress())}%</span>
              </div>

              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${getStepProgress()}%` }} />
              </div>

              <div className="progress-steps">
                {[
                  { n: 1, label: 'Student', icon: 'fa-user-graduate' },
                  { n: 2, label: 'Academic', icon: 'fa-graduation-cap' },
                  { n: 3, label: 'Parent', icon: 'fa-users' },
                  { n: 4, label: 'Review', icon: 'fa-clipboard-check' },
                ].map(({ n, label, icon }) => (
                  <div
                    key={n}
                    className={`progress-step ${currentStep >= n ? 'active' : ''} ${currentStep > n ? 'completed' : ''}`}
                  >
                    <div className="step-icon">
                      {currentStep > n ? <i className="fas fa-check" /> : <i className={`fas ${icon}`} />}
                    </div>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="application-form">
              {/* Step 1: Student Information */}
              <div className={`form-step ${currentStep === 1 ? 'active' : ''}`}>
                <div className="form-section">
                  <div className="section-header">
                    <div className="header-icon"><i className="fas fa-user-graduate" /></div>
                    <div className="header-text">
                      <h3>Student Information</h3>
                      <p>Tell us about the applicant</p>
                    </div>
                    <span className="required-badge">* Required fields</span>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Full Name <span className="required">*</span></label>
                      <div className="input-wrapper">
                        <i className="fas fa-user input-icon"></i>
                        <input type="text" name="fullName" value={formData.fullName} onChange={handleInputChange} placeholder="e.g. Mugisha Jean Claude" />
                      </div>
                      {errors.fullName && <span className="error-text"><i className="fas fa-exclamation-circle"></i> {errors.fullName}</span>}
                    </div>
                    <div className="form-group">
                      <label>Date of Birth <span className="required">*</span></label>
                      <div className="input-wrapper">
                        <i className="fas fa-calendar-alt input-icon"></i>
                        <input type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleInputChange} />
                      </div>
                      {errors.dateOfBirth && <span className="error-text"><i className="fas fa-exclamation-circle"></i> {errors.dateOfBirth}</span>}
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Nationality <span className="required">*</span></label>
                      <div className="input-wrapper">
                        <i className="fas fa-flag input-icon"></i>
                        <select name="nationality" value={formData.nationality} onChange={handleInputChange}>
                          <option>Rwandan</option>
                          <option>Other</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>National ID <span className="optional">(optional)</span></label>
                      <div className="input-wrapper">
                        <i className="fas fa-id-card input-icon"></i>
                        <input type="text" name="nationalId" value={formData.nationalId} onChange={handleInputChange} placeholder="1 XXXX X XXXXXXX X XX" />
                      </div>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Email Address <span className="required">*</span></label>
                      <div className="input-wrapper">
                        <i className="fas fa-envelope input-icon"></i>
                        <input type="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="student@example.com" />
                      </div>
                      {errors.email && <span className="error-text"><i className="fas fa-exclamation-circle"></i> {errors.email}</span>}
                    </div>
                    <div className="form-group">
                      <label>Phone Number <span className="required">*</span></label>
                      <div className="input-wrapper">
                        <i className="fas fa-phone input-icon"></i>
                        <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} placeholder="0788 123 456" />
                      </div>
                      {errors.phone && <span className="error-text"><i className="fas fa-exclamation-circle"></i> {errors.phone}</span>}
                    </div>
                  </div>

                  <div className="form-group full-width">
                    <label>Current Address <span className="required">*</span></label>
                    <div className="input-wrapper">
                      <i className="fas fa-map-marker-alt input-icon"></i>
                      <input type="text" name="address" value={formData.address} onChange={handleInputChange} placeholder="Sector, Cell, Village, District" />
                    </div>
                    {errors.address && <span className="error-text"><i className="fas fa-exclamation-circle"></i> {errors.address}</span>}
                  </div>
                </div>
              </div>

              {/* Step 2: Academic Information */}
              <div className={`form-step ${currentStep === 2 ? 'active' : ''}`}>
                <div className="form-section">
                  <div className="section-header">
                    <div className="header-icon"><i className="fas fa-graduation-cap" /></div>
                    <div className="header-text">
                      <h3>Academic Information</h3>
                      <p>Your educational background</p>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Applying for Level <span className="required">*</span></label>
                      <div className="input-wrapper">
                        <i className="fas fa-layer-group input-icon"></i>
                        <select name="level" value={formData.level} onChange={handleInputChange}>
                          <option value="">Select Level</option>
                          <option>Ordinary Level (S1-S3)</option>
                          <option>Advanced Level - Software Development</option>
                          <option>Advanced Level - Accounting</option>
                          <option>Advanced Level - Computer Systems</option>
                          <option>Advanced Level - Tourism</option>
                        </select>
                      </div>
                      {errors.level && <span className="error-text"><i className="fas fa-exclamation-circle"></i> {errors.level}</span>}
                    </div>
                    <div className="form-group">
                      <label>Previous School <span className="required">*</span></label>
                      <div className="input-wrapper">
                        <i className="fas fa-school input-icon"></i>
                        <input type="text" name="previousSchool" value={formData.previousSchool} onChange={handleInputChange} placeholder="Name of previous school" />
                      </div>
                      {errors.previousSchool && <span className="error-text"><i className="fas fa-exclamation-circle"></i> {errors.previousSchool}</span>}
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Last Year Average (%) <span className="required">*</span></label>
                      <div className="input-wrapper">
                        <i className="fas fa-chart-line input-icon"></i>
                        <input type="number" name="lastAverage" value={formData.lastAverage} onChange={handleInputChange} step="0.1" min="0" max="100" placeholder="e.g. 85.5" />
                      </div>
                      {errors.lastAverage && <span className="error-text"><i className="fas fa-exclamation-circle"></i> {errors.lastAverage}</span>}
                    </div>
                    <div className="form-group">
                      <label>Achievements <span className="optional">(optional)</span></label>
                      <div className="input-wrapper">
                        <i className="fas fa-trophy input-icon"></i>
                        <textarea name="achievements" value={formData.achievements} onChange={handleInputChange} rows="2" placeholder="Academic, sports, or other achievements" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3: Parent/Guardian Information */}
              <div className={`form-step ${currentStep === 3 ? 'active' : ''}`}>
                <div className="form-section">
                  <div className="section-header">
                    <div className="header-icon"><i className="fas fa-users" /></div>
                    <div className="header-text">
                      <h3>Parent / Guardian Information</h3>
                      <p>Emergency contact details</p>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Parent / Guardian Name <span className="required">*</span></label>
                      <div className="input-wrapper">
                        <i className="fas fa-user-friends input-icon"></i>
                        <input type="text" name="parentName" value={formData.parentName} onChange={handleInputChange} placeholder="Full name" />
                      </div>
                      {errors.parentName && <span className="error-text"><i className="fas fa-exclamation-circle"></i> {errors.parentName}</span>}
                    </div>
                    <div className="form-group">
                      <label>Parent Phone <span className="required">*</span></label>
                      <div className="input-wrapper">
                        <i className="fas fa-phone-alt input-icon"></i>
                        <input type="tel" name="parentPhone" value={formData.parentPhone} onChange={handleInputChange} placeholder="0788 123 456" />
                      </div>
                      {errors.parentPhone && <span className="error-text"><i className="fas fa-exclamation-circle"></i> {errors.parentPhone}</span>}
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Parent Email <span className="optional">(optional)</span></label>
                      <div className="input-wrapper">
                        <i className="fas fa-envelope input-icon"></i>
                        <input type="email" name="parentEmail" value={formData.parentEmail} onChange={handleInputChange} placeholder="parent@example.com" />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Parent Occupation <span className="optional">(optional)</span></label>
                      <div className="input-wrapper">
                        <i className="fas fa-briefcase input-icon"></i>
                        <input type="text" name="parentOccupation" value={formData.parentOccupation} onChange={handleInputChange} placeholder="Occupation" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 4: Review & Submit */}
              <div className={`form-step ${currentStep === 4 ? 'active' : ''}`}>
                <div className="form-section">
                  <div className="section-header">
                    <div className="header-icon"><i className="fas fa-clipboard-check" /></div>
                    <div className="header-text">
                      <h3>Review Your Application</h3>
                      <p>Double-check before submitting</p>
                    </div>
                    <span className="required-badge">Please review</span>
                  </div>

                  <div className="review-block">
                    <div className="review-block-head">
                      <h4><i className="fas fa-user-graduate"></i> Student Information</h4>
                      <button type="button" className="edit-link" onClick={() => setCurrentStep(1)}>
                        <i className="fas fa-pen"></i> Edit
                      </button>
                    </div>
                    <div className="review-grid">
                      <div className="review-item"><span>Full Name</span><strong>{formData.fullName || '—'}</strong></div>
                      <div className="review-item"><span>Date of Birth</span><strong>{formData.dateOfBirth || '—'}</strong></div>
                      <div className="review-item"><span>Nationality</span><strong>{formData.nationality || '—'}</strong></div>
                      <div className="review-item"><span>Email</span><strong>{formData.email || '—'}</strong></div>
                      <div className="review-item"><span>Phone</span><strong>{formData.phone || '—'}</strong></div>
                      <div className="review-item"><span>Address</span><strong>{formData.address || '—'}</strong></div>
                    </div>
                  </div>

                  <div className="review-block">
                    <div className="review-block-head">
                      <h4><i className="fas fa-graduation-cap"></i> Academic Information</h4>
                      <button type="button" className="edit-link" onClick={() => setCurrentStep(2)}>
                        <i className="fas fa-pen"></i> Edit
                      </button>
                    </div>
                    <div className="review-grid">
                      <div className="review-item"><span>Level</span><strong>{formData.level || '—'}</strong></div>
                      <div className="review-item"><span>Previous School</span><strong>{formData.previousSchool || '—'}</strong></div>
                      <div className="review-item"><span>Last Average</span><strong>{formData.lastAverage ? `${formData.lastAverage}%` : '—'}</strong></div>
                      <div className="review-item"><span>Achievements</span><strong>{formData.achievements || '—'}</strong></div>
                    </div>
                  </div>

                  <div className="review-block">
                    <div className="review-block-head">
                      <h4><i className="fas fa-users"></i> Parent / Guardian</h4>
                      <button type="button" className="edit-link" onClick={() => setCurrentStep(3)}>
                        <i className="fas fa-pen"></i> Edit
                      </button>
                    </div>
                    <div className="review-grid">
                      <div className="review-item"><span>Parent Name</span><strong>{formData.parentName || '—'}</strong></div>
                      <div className="review-item"><span>Parent Phone</span><strong>{formData.parentPhone || '—'}</strong></div>
                      <div className="review-item"><span>Parent Email</span><strong>{formData.parentEmail || '—'}</strong></div>
                      <div className="review-item"><span>Parent Occupation</span><strong>{formData.parentOccupation || '—'}</strong></div>
                    </div>
                  </div>

                  <div className="form-checkboxes">
                    <label className="checkbox-label">
                      <input type="checkbox" name="applyScholarship" checked={formData.applyScholarship} onChange={handleInputChange} />
                      <span className="checkbox-custom"></span>
                      <span className="checkbox-text"><strong>I wish to apply for a scholarship</strong><br /><small>Merit, need-based, or talent-based</small></span>
                    </label>

                    <div className="form-group">
                      <label>How did you hear about us?</label>
                      <div className="input-wrapper">
                        <i className="fas fa-bullhorn input-icon"></i>
                        <select name="hearAboutUs" value={formData.hearAboutUs} onChange={handleInputChange}>
                          <option value="">Select an option</option>
                          {hearAboutOptions.map(option => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <label className="checkbox-label">
                      <input type="checkbox" name="agreeTerms" checked={formData.agreeTerms} onChange={handleInputChange} />
                      <span className="checkbox-custom"></span>
                      <span className="checkbox-text">
                        I confirm that the information provided is accurate and I agree to the <Link to="/terms">terms and conditions</Link>. <span className="required">*</span>
                      </span>
                    </label>
                    {errors.agreeTerms && <span className="error-text"><i className="fas fa-exclamation-circle"></i> {errors.agreeTerms}</span>}
                  </div>
                </div>
              </div>

              {/* Navigation Buttons */}
              <div className="form-navigation">
                {currentStep > 1 ? (
                  <button type="button" className="btn-prev" onClick={prevStep}>
                    <i className="fas fa-arrow-left"></i> Previous
                  </button>
                ) : <span />}

                {currentStep < 4 && (
                  <button type="button" className="btn-next" onClick={nextStep}>
                    Continue <i className="fas fa-arrow-right"></i>
                  </button>
                )}
                {currentStep === 4 && (
                  <button type="submit" className="submit-btn" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <><i className="fas fa-spinner fa-spin"></i> Submitting...</>
                    ) : (
                      <><i className="fas fa-paper-plane"></i> Submit Application</>
                    )}
                  </button>
                )}
              </div>

              <p className="form-footnote">
                <i className="fas fa-lock"></i> Your information is secure and will only be used for admission purposes.
              </p>
            </form>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="faq-section">
        <div className="container">
          <div className="section-title">
            <h2><i className="fas fa-question-circle"></i> Frequently Asked Questions</h2>
            <div className="underline"></div>
          </div>
          <div className="faq-grid">
            {faqs.map((faq, index) => (
              <div key={index} className="faq-item">
                <div className="faq-question" onClick={() => toggleFaq(index)}>
                  <h3>{faq.q}</h3>
                  <i className={`fas fa-chevron-${activeFaq === index ? 'up' : 'down'}`}></i>
                </div>
                <div className={`faq-answer ${activeFaq === index ? 'active' : ''}`}>
                  <p>{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Support */}
      <section className="support-section">
        <div className="container">
          <div className="support-card">
            <i className="fas fa-headset"></i>
            <h3>Need Help with Your Application?</h3>
            <p>Contact our admissions office for assistance. We're here to help you every step of the way.</p>
            <div className="support-contact">
              <div><i className="fas fa-phone-alt"></i> +250 788 123 456</div>
              <div><i className="fas fa-envelope"></i> admissions@essanyarugunga.rw</div>
              <div><i className="fas fa-clock"></i> Mon-Fri: 8AM - 5PM</div>
            </div>
            <Link to="/contact" className="btn btn-primary">Contact Us <i className="fas fa-arrow-right"></i></Link>
          </div>
        </div>
      </section>

      <Footer />

      <style>{`
        /* ========== HERO STYLES (matches Home) ========== */
        .hero {
          position: relative;
          min-height: 90vh;
          display: flex;
          align-items: center;
          overflow: hidden;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
        }

        .hero-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            135deg,
            hsla(220, 60%, 18%, 0.80) 0%,
            hsla(45, 90%, 70%, 0.45) 100%
          );
          z-index: 2;
        }

        .hero-content {
          position: relative;
          z-index: 3;
          text-align: center;
          color: white;
          width: 100%;
        }

        .hero-badge {
          display: inline-block;
          background: rgba(255,193,7,0.2);
          color: #ffc107;
          padding: 8px 20px;
          border-radius: 30px;
          font-size: 0.85rem;
          margin-bottom: 1rem;
          backdrop-filter: blur(5px);
        }

        .hero-content h1 {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .hero-content .highlight {
          color: #ffc107;
        }

        .hero-content p {
          font-size: 1.2rem;
          opacity: 0.95;
          margin-bottom: 2rem;
          max-width: 700px;
          margin-left: auto;
          margin-right: auto;
        }

        .hero-buttons {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .btn-primary {
          background: #ffc107;
          color: #1e3c72;
          padding: 12px 28px;
          border-radius: 30px;
          text-decoration: none;
          font-weight: 600;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: none;
          cursor: pointer;
        }

        .btn-primary:hover {
          background: #e0a800;
          transform: translateY(-2px);
        }

        .btn-secondary {
          background: transparent;
          color: white;
          padding: 12px 28px;
          border-radius: 30px;
          text-decoration: none;
          font-weight: 600;
          border: 2px solid white;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .btn-secondary:hover {
          background: white;
          color: #1e3c72;
          transform: translateY(-2px);
        }

        .hero-notice {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 1.5rem;
          background: rgba(255,193,7,0.2);
          color: #ffc107;
          padding: 10px 20px;
          border-radius: 30px;
          font-size: 0.85rem;
          font-weight: 600;
          backdrop-filter: blur(5px);
          border: 1px solid rgba(255,193,7,0.4);
        }

        /* ========== FORM ANCHOR OFFSET ========== */
        #application-form {
          scroll-margin-top: 90px;
        }

        /* ========== ONLINE APPLICATION WRAPPER ========== */
        .online-application {
          padding: 4rem 0 5rem;
          background: linear-gradient(180deg, #f7f9fc 0%, #eef2f8 100%);
        }

        .application-form-container {
          max-width: 980px;
          margin: 0 auto;
          position: relative;
        }

        /* ========== STICKY PROGRESS CARD ========== */
        .progress-card {
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(26, 58, 92, 0.08);
          border-radius: 20px;
          padding: 1.4rem 1.6rem 1.6rem;
          margin-bottom: 1.8rem;
          box-shadow: 0 10px 30px rgba(26, 58, 92, 0.08);
        }

        .progress-top {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          margin-bottom: 1rem;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .progress-eyebrow {
          display: inline-block;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #ffc107;
          background: rgba(255, 193, 7, 0.12);
          padding: 4px 10px;
          border-radius: 20px;
          margin-bottom: 0.5rem;
        }

        .progress-title {
          margin: 0;
          font-size: 1.15rem;
          color: #1a3a5c;
          font-weight: 700;
        }

        .progress-percent {
          font-size: 1.6rem;
          font-weight: 800;
          color: #1a3a5c;
          line-height: 1;
        }

        .progress-track {
          height: 8px;
          background: #e8ecf3;
          border-radius: 999px;
          overflow: hidden;
          margin-bottom: 1.2rem;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #1a3a5c 0%, #ffc107 100%);
          border-radius: 999px;
          transition: width 0.45s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .progress-steps {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.5rem;
        }

        .progress-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          opacity: 0.5;
          transition: all 0.3s ease;
        }

        .progress-step.active,
        .progress-step.completed {
          opacity: 1;
        }

        .progress-step .step-icon {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: #eef2f8;
          color: #94a3b8;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.95rem;
          transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
          border: 2px solid transparent;
        }

        .progress-step.active .step-icon {
          background: #1a3a5c;
          color: #ffc107;
          border-color: #1a3a5c;
          box-shadow: 0 0 0 6px rgba(26, 58, 92, 0.1);
          transform: translateY(-2px);
        }

        .progress-step.completed .step-icon {
          background: #ffc107;
          color: #1a3a5c;
          border-color: #ffc107;
        }

        .progress-step span {
          font-size: 0.78rem;
          font-weight: 600;
          color: #64748b;
        }

        .progress-step.active span { color: #1a3a5c; }
        .progress-step.completed span { color: #1a3a5c; }

        /* ========== FORM CARD ========== */
        .application-form {
          background: #ffffff;
          border-radius: 22px;
          padding: 2rem;
          box-shadow: 0 20px 50px rgba(26, 58, 92, 0.10);
          border: 1px solid rgba(26, 58, 92, 0.05);
        }

        .form-step {
          display: none;
        }

        .form-step.active {
          display: block;
          animation: stepIn 0.45s cubic-bezier(0.4, 0, 0.2, 1);
        }

        @keyframes stepIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ========== SECTION HEADER ========== */
        .section-header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 1.8rem;
          padding-bottom: 1.2rem;
          border-bottom: 1px solid #eef2f8;
          flex-wrap: wrap;
        }

        .header-icon {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          background: linear-gradient(135deg, #1a3a5c 0%, #2a5298 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 6px 14px rgba(26, 58, 92, 0.25);
        }

        .header-icon i {
          color: #ffc107;
          font-size: 1.35rem;
        }

        .header-text { flex: 1; min-width: 160px; }

        .header-text h3 {
          margin: 0 0 2px;
          font-size: 1.25rem;
          color: #1a3a5c;
          font-weight: 700;
        }

        .header-text p {
          margin: 0;
          font-size: 0.82rem;
          color: #94a3b8;
        }

        .required-badge {
          font-size: 0.7rem;
          font-weight: 600;
          color: #1a3a5c;
          background: rgba(255, 193, 7, 0.18);
          padding: 5px 12px;
          border-radius: 20px;
        }

        /* ========== FORM ROWS & GROUPS ========== */
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.2rem;
          margin-bottom: 1.1rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
        }

        .form-group.full-width { grid-column: span 2; }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 600;
          font-size: 0.82rem;
          color: #334155;
          letter-spacing: 0.01em;
        }

        .form-group .optional {
          font-weight: 400;
          color: #94a3b8;
          font-size: 0.75rem;
        }

        .required { color: #dc2626; }

        /* ========== INPUTS ========== */
        .input-wrapper {
          position: relative;
        }

        .input-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          font-size: 0.9rem;
          pointer-events: none;
          transition: color 0.25s ease;
          z-index: 1;
        }

        .input-wrapper:focus-within .input-icon {
          color: #1a3a5c;
        }

        .input-wrapper input,
        .input-wrapper select,
        .input-wrapper textarea {
          width: 100%;
          padding: 13px 14px 13px 42px;
          border: 1.5px solid #e2e8f0;
          border-radius: 12px;
          font-size: 0.92rem;
          color: #1e293b;
          background: #fbfcfe;
          transition: all 0.25s ease;
          font-family: inherit;
        }

        .input-wrapper textarea {
          resize: vertical;
          min-height: 60px;
          padding-top: 14px;
        }

        .input-wrapper input::placeholder,
        .input-wrapper textarea::placeholder {
          color: #b0bac7;
        }

        .input-wrapper input:hover,
        .input-wrapper select:hover,
        .input-wrapper textarea:hover {
          border-color: #cbd5e1;
          background: #ffffff;
        }

        .input-wrapper input:focus,
        .input-wrapper select:focus,
        .input-wrapper textarea:focus {
          outline: none;
          border-color: #1a3a5c;
          background: #ffffff;
          box-shadow: 0 0 0 4px rgba(26, 58, 92, 0.12);
        }

        .input-wrapper select {
          appearance: none;
          background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e");
          background-repeat: no-repeat;
          background-position: right 14px center;
          background-size: 16px;
          padding-right: 40px;
        }

        /* ========== ERROR / HELP ========== */
        .error-text {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #dc2626;
          font-size: 0.75rem;
          margin-top: 6px;
          font-weight: 500;
        }

        /* ========== CHECKBOXES ========== */
        .form-checkboxes {
          margin-top: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
        }

        .checkbox-label {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          cursor: pointer;
          padding: 14px 16px;
          border: 1.5px solid #e2e8f0;
          border-radius: 12px;
          background: #fbfcfe;
          transition: all 0.25s ease;
        }

        .checkbox-label:hover {
          border-color: #cbd5e1;
          background: #ffffff;
        }

        .checkbox-label input { display: none; }

        .checkbox-custom {
          width: 22px;
          height: 22px;
          border: 2px solid #cbd5e1;
          border-radius: 6px;
          position: relative;
          transition: all 0.2s ease;
          flex-shrink: 0;
          margin-top: 1px;
          background: #ffffff;
        }

        .checkbox-label input:checked + .checkbox-custom {
          background: linear-gradient(135deg, #1a3a5c 0%, #2a5298 100%);
          border-color: #1a3a5c;
        }

        .checkbox-label input:checked + .checkbox-custom::after {
          content: '';
          position: absolute;
          top: 3px;
          left: 6px;
          width: 5px;
          height: 10px;
          border: solid #ffc107;
          border-width: 0 2.5px 2.5px 0;
          transform: rotate(45deg);
        }

        .checkbox-label:has(input:checked) {
          border-color: #1a3a5c;
          background: rgba(26, 58, 92, 0.04);
        }

        .checkbox-text {
          font-size: 0.88rem;
          color: #334155;
          line-height: 1.45;
        }

        .checkbox-text strong { color: #1a3a5c; }
        .checkbox-text small { color: #94a3b8; font-size: 0.75rem; }
        .checkbox-text a { color: #1a3a5c; font-weight: 600; text-decoration: underline; }

        /* ========== REVIEW BLOCKS ========== */
        .review-block {
          background: #fbfcfe;
          border: 1px solid #eef2f8;
          border-radius: 14px;
          padding: 1.2rem 1.3rem;
          margin-bottom: 1rem;
        }

        .review-block-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .review-block-head h4 {
          margin: 0;
          font-size: 0.95rem;
          color: #1a3a5c;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .review-block-head h4 i { color: #ffc107; }

        .edit-link {
          background: rgba(26, 58, 92, 0.06);
          border: none;
          color: #1a3a5c;
          font-size: 0.78rem;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 20px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s ease;
        }

        .edit-link:hover {
          background: #1a3a5c;
          color: #ffc107;
        }

        .review-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.7rem;
        }

        .review-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 8px 12px;
          background: #ffffff;
          border-radius: 10px;
          border: 1px solid #eef2f8;
        }

        .review-item span {
          font-size: 0.7rem;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 600;
        }

        .review-item strong {
          font-size: 0.87rem;
          color: #1e293b;
          font-weight: 600;
          word-break: break-word;
        }

        /* ========== NAV BUTTONS ========== */
        .form-navigation {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 2rem;
          gap: 1rem;
        }

        .btn-prev,
        .btn-next,
        .submit-btn {
          padding: 14px 30px;
          border-radius: 999px;
          font-size: 0.92rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border: none;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          letter-spacing: 0.02em;
        }

        .btn-prev {
          background: transparent;
          color: #64748b;
          border: 1.5px solid #e2e8f0;
        }

        .btn-prev:hover {
          background: #f1f5f9;
          color: #1a3a5c;
          border-color: #cbd5e1;
        }

        .btn-prev i { transition: transform 0.3s ease; }
        .btn-prev:hover i { transform: translateX(-4px); }

        .btn-next {
          background: linear-gradient(135deg, #1a3a5c 0%, #2a5298 100%);
          color: #ffffff;
          margin-left: auto;
          box-shadow: 0 8px 20px rgba(26, 58, 92, 0.25);
        }

        .btn-next:hover {
          background: linear-gradient(135deg, #ffc107 0%, #e0a800 100%);
          color: #1a3a5c;
          transform: translateY(-2px);
          box-shadow: 0 12px 26px rgba(255, 193, 7, 0.4);
        }

        .btn-next i { transition: transform 0.3s ease; }
        .btn-next:hover i { transform: translateX(4px); }

        .submit-btn {
          background: linear-gradient(135deg, #1a3a5c 0%, #2a5298 100%);
          color: #ffffff;
          margin-left: auto;
          box-shadow: 0 10px 24px rgba(26, 58, 92, 0.28);
        }

        .submit-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #ffc107 0%, #e0a800 100%);
          color: #1a3a5c;
          transform: translateY(-2px);
          box-shadow: 0 14px 30px rgba(255, 193, 7, 0.45);
        }

        .submit-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .form-footnote {
          margin-top: 1.2rem;
          text-align: center;
          font-size: 0.78rem;
          color: #94a3b8;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .form-footnote i { color: #ffc107; }

        /* ========== RESPONSIVE ========== */
        @media (max-width: 768px) {
          .hero { min-height: 70vh; }
          .hero-content h1 { font-size: 1.8rem; }
          .hero-content p { font-size: 0.9rem; }

          .online-application { padding: 3rem 0 4rem; }
          .application-form { padding: 1.4rem; border-radius: 18px; }
          .progress-card { padding: 1.1rem 1rem 1.2rem; border-radius: 16px; }
          .progress-percent { font-size: 1.3rem; }

          .progress-step .step-icon { width: 34px; height: 34px; font-size: 0.8rem; }
          .progress-step span { font-size: 0.68rem; }

          .form-row { grid-template-columns: 1fr; gap: 0.9rem; }
          .form-group.full-width { grid-column: span 1; }
          .review-grid { grid-template-columns: 1fr; }

          .header-icon { width: 44px; height: 44px; border-radius: 12px; }
          .header-icon i { font-size: 1.15rem; }
          .header-text h3 { font-size: 1.05rem; }

          .btn-prev, .btn-next, .submit-btn {
            padding: 12px 22px;
            font-size: 0.85rem;
            flex: 1;
            justify-content: center;
          }

          .form-navigation { gap: 0.6rem; }
        }
      `}</style>
    </>
  );
};

export default AdmissionsPage;