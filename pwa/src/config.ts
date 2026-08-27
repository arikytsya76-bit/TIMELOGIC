const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '');
export const API_URL = configuredApiUrl || "https://timelogic.onrender.com/api";

// This client is the iOS / web PWA. The backend uses this to verify attendance
// by office network IP (browsers cannot read the Wi-Fi SSID) + device + time.
export const PLATFORM = "web" as const;

// Backend origin (for /uploads face photos) = API without the /api suffix.
export const FILE_BASE = API_URL.replace(/\/api\/?$/, "");
