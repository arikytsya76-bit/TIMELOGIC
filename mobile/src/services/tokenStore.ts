// Token store: in-memory cache for speed, mirrored to SecureStore so a background
// task (which runs in a fresh JS context with no in-memory state) can re-hydrate
// the token and authenticate its Wi-Fi heartbeat.
import * as SecureStore from 'expo-secure-store';

const K_ACCESS = 'tl_access';
const K_REFRESH = 'tl_refresh';

let _access: string | null = null;
let _refresh: string | null = null;

export const tokenStore = {
  getAccess: () => _access,
  getRefresh: () => _refresh,
  set: (access: string, refresh: string) => {
    _access = access; _refresh = refresh;
    SecureStore.setItemAsync(K_ACCESS, access).catch(() => {});
    SecureStore.setItemAsync(K_REFRESH, refresh).catch(() => {});
  },
  setAccess: (access: string) => {
    _access = access;
    SecureStore.setItemAsync(K_ACCESS, access).catch(() => {});
  },
  clear: () => {
    _access = null; _refresh = null;
    SecureStore.deleteItemAsync(K_ACCESS).catch(() => {});
    SecureStore.deleteItemAsync(K_REFRESH).catch(() => {});
  },
  // Re-hydrate the in-memory cache from SecureStore (used by the background task).
  loadFromSecureStore: async (): Promise<string | null> => {
    try {
      _access = (await SecureStore.getItemAsync(K_ACCESS)) ?? _access;
      _refresh = (await SecureStore.getItemAsync(K_REFRESH)) ?? _refresh;
    } catch { /* ignore */ }
    return _access;
  },
};
