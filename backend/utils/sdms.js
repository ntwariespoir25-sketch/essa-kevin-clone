const crypto = require('crypto');

const Student = require('../models/Student');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { getJWTSecret } = require('../utils/jwt');

// Ambiguous glyphs (0/O, 1/I) are excluded so a code read off a printed slip
// can be typed back without guessing.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const normalizeCode = (code) => String(code || '').trim().toUpperCase().replace(/\s+/g, '');

const randomCode = (length = 8) => {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
};

// Issues a unique SDMS code, retrying on the (very unlikely) collision.
const issueCode = async (student) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const sdmsCode = randomCode();
    const taken = await Student.exists({ sdmsCode, _id: { $ne: student._id } });
    if (taken) continue;
    student.sdmsCode = sdmsCode;
    student.sdmsCodeIssuedAt = new Date();
    await student.save();
    return sdmsCode;
  }
  throw new Error('Could not generate a unique SDMS code, please try again');
};

// The linked portal account, created on first SDMS login. The placeholder
// password is random and never disclosed, so the only way in is the code.
const ensureUser = async (student) => {
  let user = student.userId ? await User.findById(student.userId) : null;
  if (!user) user = await User.findOne({ email: student.email });
  if (!user) {
    user = await User.create({
      fullName: student.fullName,
      email: student.email || `${student.studentId.toLowerCase()}@student.essa.rw`,
      password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
      role: 'student',
      phone: student.parentPhone,
      mustChangePassword: true
    });
    student.userId = user._id;
    await student.save();
  }
  return user;
};

const sessionToken = (user, mustChangePassword) =>
  jwt.sign(
    { id: user._id, role: user.role, name: user.fullName, pwd: mustChangePassword ? 1 : 0 },
    getJWTSecret(),
    { expiresIn: mustChangePassword ? '2h' : '7d' }
  );

module.exports = { normalizeCode, issueCode, ensureUser, sessionToken };
