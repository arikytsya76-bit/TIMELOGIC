const path = require('path');

// Always load backend/.env, regardless of the terminal's current directory.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

const required = (key) => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

const isPrivateHost = (hostname) => {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (/^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const match = host.match(/^172\.(\d{1,2})\./);
  return !!match && Number(match[1]) >= 16 && Number(match[1]) <= 31;
};

const localServiceUrl = (key, fallback) => {
  const value = process.env[key] || fallback;
  if (!value) throw new Error(`Missing required env var: ${key}`);
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${key} must be a valid URL`); }
  if (!isProduction && !isPrivateHost(parsed.hostname)) {
    throw new Error(`${key} must point to localhost or a private LAN address while TimeLogic is local-only`);
  }
  return value;
};

const defaultCorsOrigins = isProduction
  ? 'https://timelogic-superadmin.pages.dev,https://timelogic.pages.dev,https://timelogic-app.pages.dev,https://timelogic-fill-form.pages.dev'
  : 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5180,http://127.0.0.1:5180';
const localCorsOrigins = `${defaultCorsOrigins},${process.env.CORS_ORIGINS || ''}`
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((origin) => {
    let parsed;
    try { parsed = new URL(origin); } catch { throw new Error(`Invalid CORS origin: ${origin}`); }
    if (!isProduction && !isPrivateHost(parsed.hostname)) {
      throw new Error(`CORS origin must be local while TimeLogic is local-only: ${origin}`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`CORS origin must use http or https: ${origin}`);
    return origin;
  });

const LOCAL_FRONTEND_PORTS = new Set(['', '80', '443', '3000', '3001', '5173', '5180', '5190']);
const isAllowedFrontendOrigin = (origin) => {
  if (localCorsOrigins.includes(origin)) return true;
  if (isProduction) return false;
  let parsed;
  try { parsed = new URL(origin); } catch { return false; }
  return ['http:', 'https:'].includes(parsed.protocol)
    && isPrivateHost(parsed.hostname)
    && LOCAL_FRONTEND_PORTS.has(parsed.port || (parsed.protocol === 'https:' ? '443' : '80'));
};

module.exports = {
  NODE_ENV,
  PORT: parseInt(process.env.PORT || '5000', 10),

  DATABASE_URL: localServiceUrl('DATABASE_URL'),

  REDIS_URL: localServiceUrl('REDIS_URL', 'redis://localhost:6379'),

  JWT_ACCESS_SECRET: required('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  QR_SECRET_KEY: required('QR_SECRET_KEY'),
  QR_DEFAULT_ROTATION_SECONDS: parseInt(process.env.QR_DEFAULT_ROTATION_SECONDS || '30', 10),

  // NOTE: Wi-Fi SSID, work hours, grace windows and penalties are NOT fixed in
  // code — they live per-office in the database, set from the Super Admin panel.
  // ── Session automation windows (minutes) ──
  CHECKIN_WINDOW_MIN:     parseInt(process.env.CHECKIN_WINDOW_MIN || '40', 10),  // fallback when an office has no late-after policy
    AUTO_SESSION_LEAD_MIN:  parseInt(process.env.AUTO_SESSION_LEAD_MIN || '40', 10), // auto-create before office opening
  AUTO_CHECKOUT_LAG_MIN:  parseInt(process.env.AUTO_CHECKOUT_LAG_MIN || '40', 10), // auto check-out at closeTime+40

  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads',
  MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10),

  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),

  CORS_ORIGINS: localCorsOrigins,
  isAllowedFrontendOrigin,

  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM || 'noreply@attendance.local',

  FCM_SERVER_KEY: process.env.FCM_SERVER_KEY,
};
