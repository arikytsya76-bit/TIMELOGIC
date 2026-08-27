const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const hpp = require('hpp');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

const env = require('./env');
const { apiLimiter } = require('../middleware/rateLimiter');
const { errorHandler, notFound } = require('../middleware/errorHandler');

const authRoutes       = require('../routes/auth');
const attendanceRoutes = require('../routes/attendance');
const sessionRoutes    = require('../routes/sessions');
const breakRoutes      = require('../routes/breaks');
const leaveRoutes      = require('../routes/leaves');
const fraudRoutes      = require('../routes/fraud');
const reportRoutes     = require('../routes/reports');
const adminRoutes      = require('../routes/admin');
const superAdminRoutes = require('../routes/superAdmin');
const publicRegistrationRoutes = require('../routes/publicRegistration');

function createApp() {
  const app = express();

  // Don't advertise the framework, and trust the proxy (correct client IPs for rate limiting)
  app.disable('x-powered-by');
  // Local-first mode connects directly to Express. Do not trust spoofable
  // X-Forwarded-* headers until a known hosting proxy is configured later.
  app.set('trust proxy', false);

  // Security headers
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow /uploads images in apps
  }));
  app.use(cors({
    // Allow the whitelisted web origins, plus native clients with no Origin and
    // the Electron desktop app (file:// sends Origin "null"). Auth is a Bearer
    // JWT (not cookies), so permitting null-origin native apps is safe here.
    origin: (origin, cb) => {
      if (!origin || origin === 'null' || env.isAllowedFrontendOrigin(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }));
  app.use(compression());

  // Logging
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  // Body parsing — capped to blunt large-payload DoS
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Protect against HTTP Parameter Pollution (?a=1&a=2 attacks)
  app.use(hpp());

  // Static file serving (uploaded profile images). UPLOAD_DIR may be absolute
  // (production persistent disk) or relative (dev).
  const _up = env.UPLOAD_DIR || 'uploads';
  const uploadRoot = path.isAbsolute(_up) ? _up : path.resolve(__dirname, '../../', _up);
  app.use('/uploads', express.static(uploadRoot, {
    setHeaders: (res) => res.set('Cache-Control', 'no-store'),
  }));

  // Global per-IP rate limit (anti-DDoS / abuse). The login route has its own
  // stricter brute-force limiter (see routes/auth.js → authLimiter).
  app.use('/api', apiLimiter);
  // Attendance and session views are live data; never turn an empty 304 into
  // a blank client view when the browser has cached an older response.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Health check (unauthenticated)
  app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

  // API routes
  app.use('/api/auth',       authRoutes);
  app.use('/api/attendance', attendanceRoutes);
  app.use('/api/sessions',   sessionRoutes);
  app.use('/api/breaks',     breakRoutes);
  app.use('/api/leaves',     leaveRoutes);
  app.use('/api/fraud',      fraudRoutes);
  app.use('/api/reports',    reportRoutes);
  app.use('/api/admin',      adminRoutes);
  app.use('/api/super',      superAdminRoutes);
  app.use('/api/register',   publicRegistrationRoutes);

  // 404 & error handling
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
