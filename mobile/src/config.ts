import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Dynamically derive the backend API URL from the Expo dev server host, so the
// phone always reaches the backend on the same WiFi. We check every field Expo
// has used across SDK versions — `hostUri` is the current one (SDK 54), the
// others are older fallbacks.
function getDevHost(): string | null {
  const c: any = Constants;
  const candidates: (string | undefined)[] = [
    c.expoConfig?.hostUri,                       // SDK 49+ (current)
    c.expoGoConfig?.debuggerHost,                // SDK 48-ish
    c.expoGoConfig?.hostUri,
    c.manifest2?.extra?.expoGo?.debuggerHost,    // manifest2
    c.manifest?.debuggerHost,                    // classic manifest
    c.manifest?.hostUri,
  ];
  for (const h of candidates) {
    if (h && typeof h === 'string') return h;
  }
  return null;
}

function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '10.0.2.2') return true;
  if (/^10\./.test(hostname) || /^192\.168\./.test(hostname)) return true;
  const match = hostname.match(/^172\.(\d{1,2})\./);
  return !!match && Number(match[1]) >= 16 && Number(match[1]) <= 31;
}

function normalizeLocalApiUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, '');
  const match = trimmed.match(/^http:\/\/([^/:]+)(?::\d+)?\/api$/i);
  if (!match || !isPrivateHost(match[1].toLowerCase())) {
    throw new Error(`[config] Refusing non-local backend URL: ${trimmed}`);
  }
  return trimmed;
}

function getExpoDevApiUrl(): string | null {
  const hostUri = getDevHost();
  if (!hostUri) return null;

  // Expo normally supplies "192.168.x.x:8081". It may include a scheme in
  // some clients, so normalize both shapes before replacing Metro's port with
  // the local backend port.
  let hostname: string;
  try {
    hostname = hostUri.includes('://')
      ? new URL(hostUri).hostname
      : hostUri.split(':')[0];
  } catch {
    return null;
  }

  hostname = hostname.toLowerCase();
  if (!isPrivateHost(hostname)) return null;

  // Android emulators cannot reach the Windows host through localhost.
  if (Platform.OS === 'android' && (hostname === 'localhost' || hostname === '127.0.0.1')) {
    hostname = '10.0.2.2';
  }

  return `http://${hostname}:5000/api`;
}

function getApiUrl(): string {
  // 1. During Expo development, always follow Metro's current LAN address.
  // This prevents an old .env.local IP from breaking login when Wi-Fi changes.
  if (__DEV__) {
    const expoDevApiUrl = getExpoDevApiUrl();
    if (expoDevApiUrl) return expoDevApiUrl;
  }

  // 2. Standalone/local-build override. Public hosts are rejected.
  if (process.env.EXPO_PUBLIC_API_URL) {
    return normalizeLocalApiUrl(process.env.EXPO_PUBLIC_API_URL);
  }

  // 3. Android Studio's emulator reaches the Windows host through 10.0.2.2.
  // A physical phone should set EXPO_PUBLIC_API_URL to the computer's LAN IP.
  return Platform.OS === 'android'
    ? 'http://10.0.2.2:5000/api'
    : 'http://localhost:5000/api';
}

export const API_URL = getApiUrl();
export const SOCKET_URL = API_URL.replace('/api', '');

// Visible in the Metro logs so you can confirm the phone is hitting the right IP
console.log('[config] API_URL =', API_URL);
