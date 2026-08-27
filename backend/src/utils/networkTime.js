const https = require('https');

const TIME_API_URLS = [
  'https://worldtimeapi.org/api/timezone/Africa/Lagos',
  'https://timeapi.io/api/Time/current/zone?timeZone=Africa/Lagos',
  'https://www.google.com',
];

function parseTimeApiDateTime(payload) {
  if (!payload) return null;
  const utcValue = payload.utcDateTime || payload.utc_datetime;
  if (utcValue) {
    const parsedUtc = new Date(utcValue);
    if (!Number.isNaN(parsedUtc.getTime())) return parsedUtc;
  }

  const localValue = payload.dateTime;
  if (!localValue || !payload.timeZone) return null;
  const match = String(localValue).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/);
  if (!match) return null;

  const parts = match.slice(1, 7).map(Number);
  const milliseconds = Number((match[7] || '').padEnd(3, '0')) || 0;
  const wallClock = Date.UTC(...parts, milliseconds);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: payload.timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const zoned = Object.fromEntries(formatter.formatToParts(new Date(wallClock))
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]));
  const representedUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
  const offset = representedUtc - wallClock;
  return new Date(wallClock - offset);
}

let clockOffsetMs = 0;
let lastSyncAt = 0;
let syncPromise = null;
const MAX_CLOCK_DRIFT_MS = 5 * 60 * 1000;

function getHttpResponse(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 5000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(getHttpResponse(res.headers.location));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${url}`));
          return;
        }
        resolve({ text, dateHeader: res.headers.date });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });

    req.on('error', reject);
  });
}

async function fetchLagosNetworkTime() {
  for (const url of TIME_API_URLS) {
    try {
      const response = await getHttpResponse(url);
      const body = response.text;

      if (url.includes('worldtimeapi.org')) {
        const payload = JSON.parse(body);
        if (payload && payload.utc_datetime) {
          return new Date(payload.utc_datetime);
        }
      }

      if (url.includes('timeapi.io')) {
        const payload = JSON.parse(body);
        const parsed = parseTimeApiDateTime(payload);
        if (parsed) return parsed;
      }

      if (url.includes('google.com')) {
        const networkDate = response.dateHeader ? new Date(response.dateHeader) : null;
        if (networkDate && !Number.isNaN(networkDate.getTime())) return networkDate;
      }
    } catch (_) {
      // Try the next source.
    }
  }

  return new Date();
}

async function getCurrentServerTime() {
  const now = Date.now();
  if (now - lastSyncAt < 60_000) return new Date(now + clockOffsetMs);
  if (!syncPromise) {
    syncPromise = fetchLagosNetworkTime()
      .then((networkTime) => {
        const drift = networkTime.getTime() - Date.now();
        // A cached or malformed time provider must not move the workday to a
        // different calendar date. Hosted servers already maintain a synced clock.
        clockOffsetMs = Number.isFinite(drift) && Math.abs(drift) <= MAX_CLOCK_DRIFT_MS ? drift : 0;
        lastSyncAt = Date.now();
        return new Date(Date.now() + clockOffsetMs);
      })
      .catch(() => {
        lastSyncAt = Date.now();
        return new Date(Date.now() + clockOffsetMs);
      })
      .finally(() => { syncPromise = null; });
  }
  return syncPromise;
}

function getLagosNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
}

module.exports = {
  fetchLagosNetworkTime,
  getCurrentServerTime,
  getLagosNow,
};
