const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
if (!configuredApiUrl) throw new Error('[config] EXPO_PUBLIC_API_URL is required.');
export const API_URL = configuredApiUrl;
export const SOCKET_URL = API_URL.replace('/api', '');

// Visible in the Metro logs so you can confirm the phone is hitting the right IP
console.log('[config] API_URL =', API_URL);
