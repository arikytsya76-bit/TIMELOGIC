const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '');
export const API_URL = configuredApiUrl || 'https://timelogic.onrender.com/api';
export const SOCKET_URL = API_URL.replace(/\/api$/, '');
