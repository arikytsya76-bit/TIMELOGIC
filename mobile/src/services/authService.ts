import { api } from './api';
import { tokenStore } from './tokenStore';
import { getDeviceId } from './deviceInfo';

export interface AuthUser {
  id: string;
  employeeCode: string | null;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: string;
  shiftType: string;
  orgId: string;
  departmentId?: string | null;
  profileImageUrl?: string | null;  // path to face photo (used for avatar + face verification)
  checkInMethod?: 'PHONE' | 'MANUAL' | 'BOTH';
  phone?: string | null;
  organization?: {
    id: string;
    name: string;
    allowDeviceCheckIn: boolean;
    allowManualCheckIn: boolean;
    hasStudents: boolean;
    openingTime?: string | null;
    timezone?: string | null;
  };
}

export function canUseDeviceCheckIn(user: AuthUser) {
  const method = user.checkInMethod ?? 'PHONE';
  return user.organization?.allowDeviceCheckIn !== false && (method === 'PHONE' || method === 'BOTH');
}

interface LoginResponse {
  success: boolean;
  data: { accessToken: string; refreshToken: string; user: AuthUser };
}

export async function loginApi(identifier: string, password: string) {
  // Bind this phone to the account (one device per employee, enforced server-side)
  const deviceFingerprint = await getDeviceId();
  const body = { email: identifier, password, deviceFingerprint };
  const res = await api.post<LoginResponse['data']>('/auth/login', body);
  const { accessToken, refreshToken, user } = res;
  tokenStore.set(accessToken, refreshToken);
  if (user.role !== 'EMPLOYEE') {
    await logoutApi();
    throw new Error('This Android app is for employee accounts. Organization administrators must use the Desktop app.');
  }
  if (!canUseDeviceCheckIn(user)) {
    await logoutApi();
    throw new Error('This account uses manual check-in at the Admin station and cannot sign in on a phone.');
  }
  return user;
}

export async function logoutApi() {
  const refresh = tokenStore.getRefresh();
  if (refresh) {
    await api.post('/auth/logout', { refreshToken: refresh }).catch(() => {});
  }
  tokenStore.clear();
}

export async function getMeApi(): Promise<AuthUser> {
  return api.get<AuthUser>('/auth/me');
}
