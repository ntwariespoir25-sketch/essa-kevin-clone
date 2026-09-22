import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';

const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('portalToken');
    const role = localStorage.getItem('userRole');
    if (token) {
      setIsLoggedIn(true);
      setUserRole(role);
    }
  }, [location]);

  const handleLogout = () => {
    localStorage.clear();
    setIsLoggedIn(false);
    setUserRole(null);
    navigate('/');
  };

  const getDashboardLink = () => {
    switch(userRole) {
      case 'student': return '/portal/student';
      case 'teacher': return '/portal/teacher';
      case 'parent': return '/portal/parent';
      case 'admin': return '/portal/admin';
      default: return '/portal/login';
    }
  };

  return (
    <nav className="navbar">
      <div className="container">
        <div className="logo">
          <Link to="/">
            <div className="logo-placeholder">
              <img src={logo} alt="ESSA Logo" />
            </div>
            <div className="logo-text">
              <h1>ESSA Nyarugunga</h1>
              <p>Ecole Secondaire Des Science et Administrative</p>
            </div>
          </Link>
        </div>
        
        <button 
          className={`hamburger ${mobileMenuOpen ? 'active' : ''}`} 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
        
        <div className={`mobile-menu ${mobileMenuOpen ? 'active' : ''}`}>
          <ul className="nav-links">
            <li><Link to="/" className={location.pathname === '/' ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>Home</Link></li>
            <li><Link to="/about" className={location.pathname === '/about' ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>About</Link></li>
            <li><Link to="/academics" className={location.pathname === '/academics' ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>Academics</Link></li>
            <li><Link to="/admissions" className={location.pathname === '/admissions' ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>Admissions</Link></li>
            <li><Link to="/news" className={location.pathname === '/news' ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>News</Link></li>
            <li><Link to="/gallery" className={location.pathname === '/gallery' ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>Gallery</Link></li>
            <li><Link to="/contact" className={location.pathname === '/contact' ? 'active' : ''} onClick={() => setMobileMenuOpen(false)}>Contact</Link></li>
            {isLoggedIn ? (
              <>
                <li><Link to={getDashboardLink()} onClick={() => setMobileMenuOpen(false)}>Dashboard</Link></li>
                <li><button onClick={handleLogout} className="logout-nav-btn">Logout</button></li>
              </>
            ) : (
              <li><Link to="/portal/login" onClick={() => setMobileMenuOpen(false)}><i className="fas fa-sign-in-alt"></i> Portal Login</Link></li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;