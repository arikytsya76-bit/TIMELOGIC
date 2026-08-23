const Redis = require('ioredis');
const env = require('./env');
const logger = require('./logger');

const redis = new Redis(env.REDIS_URL, {
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error('Redis error:', err.message));
redis.on('reconnecting', () => logger.warn('Redis reconnecting...'));

const PREFIXES = {
  QR_TOKEN:        'qr:',
  SESSION:         'session:',
  RATE_LIMIT:      'rl:',
  FAILED_ATTEMPTS: 'fa:',
  SOCKET:          'sock:',
  CHALLENGE:       'challenge:',
  PRESENCE:        'presence:',
  ADMIN_PRESENT:   'adminpresent:',
  SESSION_AUTO_LOCK: 'session-auto-lock:',
};

module.exports = { redis, PREFIXES };
