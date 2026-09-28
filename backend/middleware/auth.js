const jwt = require('jsonwebtoken');

const { getJWTSecret } = require('../utils/jwt');

// While a forced password change is outstanding the account is deliberately
// useless, so the token only unlocks the endpoints needed to clear the flag.
// Without this a student could ignore the modal and keep using a password the
// school never chose.
const ALLOWED_WHILE_PASSWORD_PENDING = [
  '/auth/change-password',
  '/auth/student/login',
  '/auth/me'
];

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    const decoded = jwt.verify(token, getJWTSecret());
    req.userId   = decoded.id;
    req.userRole = decoded.role;
    req.userName = decoded.name;
    req.mustChangePassword = decoded.pwd === 1;

    if (req.mustChangePassword && !ALLOWED_WHILE_PASSWORD_PENDING.includes(req.path)) {
      return res.status(403).json({
        message: 'Password change required',
        code: 'PASSWORD_CHANGE_REQUIRED'
      });
    }
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

module.exports = authMiddleware;