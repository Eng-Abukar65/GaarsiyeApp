const jwt = require('jsonwebtoken');
const DriverModel = require('../models/driverModel');
const jwtSecret = require('../config/jwt');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      try {
        const decoded = jwt.verify(token, jwtSecret, { ignoreExpiration: true });
        const driverId = decoded?.driver_id || (decoded?.role === 'driver' ? decoded?.id : null);
        if (driverId) {
          await DriverModel.markOffline(driverId);
          console.log(`[AUTH] Expired driver token marked offline driver_id=${driverId}`);
        }
      } catch (markError) {
        console.warn('[AUTH] Could not mark expired driver token offline:', markError.message);
      }
    }
    res.status(403).json({ message: 'Invalid or expired token.' });
  }
};

const authorizeAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admins only.' });
  }
  next();
};

const authorizeRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied.' });
  }
  next();
};

module.exports = { authenticateToken, authorizeAdmin, authorizeRole };
