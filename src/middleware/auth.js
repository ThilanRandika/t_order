const axios = require('axios');

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';

/**
 * Authenticates requests by calling user-service /auth/verify.
 * Demonstrates inter-service communication: order-service → user-service.
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token missing' });
  }

  try {
    const { data } = await axios.get(`${USER_SERVICE_URL}/auth/verify`, {
      headers: { Authorization: authHeader },
      timeout: 5000,
    });
    req.user = data.user;
    next();
  } catch (err) {
    if (err.response) return res.status(401).json({ error: 'Invalid or expired token' });
    return res.status(503).json({ error: 'Authentication service unavailable' });
  }
};

/**
 * Middleware to restrict access to admin role only.
 * Must be used after authenticate().
 */
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = { authenticate, requireAdmin };
