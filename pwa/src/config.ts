// Local-first mode: use localhost on this PC, or the same private LAN host that
// served the PWA when it is opened from a phone/tablet.
function isPrivateHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) return true;
  const match = hostname.match(/^172\.(\d{1,2})\./);
  return !!match && Number(match[1]) >= 16 && Number(match[1]) <= 31;
}

const pageHost = window.location.hostname.toLowerCase();
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '');
const API_ORIGIN = "https://timelogic.onrender.com/api";
const backendHost = isPrivateHost(pageHost) ? pageHost : "localhost";
export const API_URL = configuredApiUrl || (isPrivateHost(pageHost) ? `http://${backendHost}:5000/api` : API_ORIGIN);

// This client is the iOS / web PWA. The backend uses this to verify attendance
// by office network IP (browsers cannot read the Wi-Fi SSID) + device + time.
export const PLATFORM = "web" as const;

// Backend origin (for /uploads face photos) = API without the /api suffix.
export const FILE_BASE = API_URL.replace(/\/api\/?$/, "");
