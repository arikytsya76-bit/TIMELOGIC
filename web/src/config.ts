const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '');
if (!configuredApiUrl) throw new Error('VITE_API_URL is required.');
export const API_URL = configuredApiUrl;
export const SOCKET_URL = API_URL.replace(/\/api$/, '');
