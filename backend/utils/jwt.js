const getJWTSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Add it to your .env file.');
  }
  return secret;
};

module.exports = { getJWTSecret };