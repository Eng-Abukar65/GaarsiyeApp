require('dotenv').config();

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Set it in backend/.env before starting the server.');
}

module.exports = jwtSecret;
