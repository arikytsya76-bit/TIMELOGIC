const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: 'Scan rate limit exceeded' },
  keyGenerator: (req) => req.user?.id || req.ip,
});

// Admin stations process many different people in quick succession. Limit
// repeated attempts per subject instead of blocking the whole organization.
const stationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many attempts for this person. Please wait a minute and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.user?.id || req.ip}:${req.body?.employeeId || req.params?.studentId || 'station'}`,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { success: false, message: 'API rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, scanLimiter, stationLimiter, apiLimiter };
