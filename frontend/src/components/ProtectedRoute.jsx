import React from 'react';
import { Navigate } from 'react-router-dom';
import Swal from 'sweetalert2';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = localStorage.getItem('portalToken');
  const userRole = localStorage.getItem('userRole');
  
  if (!token) {
    Swal.fire({
      title: 'Access Denied',
      text: 'Please login to access this page.',
      icon: 'warning',
      confirmButtonColor: '#1e3c72',
      timer: 2000
    });
    return <Navigate to="/portal/login" replace />;
  }
  
  if (allowedRoles && !allowedRoles.includes(userRole)) {
    // Redirect to appropriate dashboard based on role instead of showing error
    let redirectPath = '/portal/login';
    
    switch(userRole) {
      case 'super_admin':
        redirectPath = '/portal/super-admin';
        break;
      case 'academic_admin':
        redirectPath = '/portal/academic-admin';
        break;
      case 'accounts_admin':
        redirectPath = '/portal/accounts-admin';
        break;
      case 'discipline_admin':
        redirectPath = '/portal/discipline-admin';
        break;
      case 'teacher':
        redirectPath = '/portal/teacher';
        break;
      case 'student':
        redirectPath = '/portal/student';
        break;
      case 'parent':
        redirectPath = '/portal/parent';
        break;
      default:
        redirectPath = '/portal/login';
    }
    
    Swal.fire({
      title: 'Unauthorized',
      text: `You don't have permission to access this page. Redirecting to your dashboard.`,
      icon: 'error',
      confirmButtonColor: '#1e3c72',
      timer: 2000
    });
    return <Navigate to={redirectPath} replace />;
  }
  
  return children;
};

export default ProtectedRoute;