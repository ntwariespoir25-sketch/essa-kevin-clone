// One password rule for the whole school.
//
// Before this, /auth/set-password accepted six characters while
// /auth/change-password demanded eight, and neither asked for a digit or a
// letter. The shortest path to a weak account was whichever endpoint the user
// happened to be sent to. Everything that writes a password now runs through
// passwordProblems(), so tightening one screen tightens all of them.

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;   // bcrypt only looks at the first 72 bytes
const HISTORY_DEPTH = 5;  // previous passwords that may not be reused

// Deliberately not a composition rule. "P@ssw0rd" satisfies every character
// class below and is trivially guessed, while a four-word passphrase satisfies
// none of them and is strong. The length floor plus bcrypt cost is doing the
// real work here.
const passwordProblems = (password, { email, fullName } = {}) => {
  const pw = typeof password === 'string' ? password : '';
  const problems = [];

  if (pw.length < MIN_LENGTH) {
    problems.push(`Password must be at least ${MIN_LENGTH} characters`);
  }
  if (pw.length > MAX_LENGTH) {
    problems.push(`Password must be ${MAX_LENGTH} characters or fewer`);
  }
  if (pw && !/[a-zA-Z]/.test(pw)) {
    problems.push('Password must contain at least one letter');
  }
  if (pw && !/[0-9]/.test(pw)) {
    problems.push('Password must contain at least one digit');
  }
  if (pw && /^\s|\s$/.test(pw)) {
    problems.push('Password must not start or end with a space');
  }

  // Personal details are the first thing anyone tries, so reject them outright
  // rather than merely discouraging them.
  if (pw) {
    const localPart = String(email || '').split('@')[0].toLowerCase();
    const lowered = pw.toLowerCase();
    if (localPart && localPart.length >= 4 && lowered.includes(localPart)) {
      problems.push('Password must not contain your email address');
    }
    const name = String(fullName || '').toLowerCase().trim();
    if (name) {
      for (const part of name.split(/\s+/).filter((p) => p.length >= 4)) {
        if (lowered.includes(part)) {
          problems.push('Password must not contain your name');
          break;
        }
      }
    }
  }

  return problems;
};

const isAcceptablePassword = (password, meta) => passwordProblems(password, meta).length === 0;

// Kept only ever hashing what bcrypt will actually use, so a reused-password
// check can never be fooled by a difference past byte 72.
const bcryptComparable = (password) =>
  Buffer.from(String(password).slice(0, 72), 'utf8');

// Every projection that hides `password` must hide this too. passwordHistory is
// a list of bcrypt hashes, so forgetting it once turns a read-only user list
// endpoint into a credential dump. Grep for SAFE_USER_SELECT rather than
// retyping the string, and note that the same has to happen for any `.lean()`.
const SAFE_USER_SELECT = '-password -passwordHistory -lockedUntil -lockReason';

module.exports = {
  passwordProblems,
  isAcceptablePassword,
  bcryptComparable,
  SAFE_USER_SELECT,
  MIN_LENGTH,
  MAX_LENGTH,
  HISTORY_DEPTH
};
