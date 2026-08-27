import { api } from './api';
import { collectCheckInContext } from './deviceInfo';

export interface AttendanceStatus {
  hasCheckedIn: boolean;
  hasCheckedOut: boolean;
  status: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  totalWorkHours: string | null;
  onBreak: boolean;
  breakType: string | null;
  breakStartTime: string | null;
  penalty?: number;
  record?: any;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  clockInTime: string | null;
  clockOutTime: string | null;
  status: string;
  totalWorkHours: string | null;
  totalBreakMinutes: number;
  flagged: boolean;
  wifiVerified: boolean;
  deviceVerified: boolean;
}

export async function getTodayStatus(): Promise<AttendanceStatus> {
  const d = await api.get<any>(`/attendance/status?_live=${Date.now()}`);
    const timezone = d?.session?.office?.timezone || 'Africa/Lagos';
  return {
    hasCheckedIn: !!d?.clockInTime,
    hasCheckedOut: !!d?.clockOutTime,
    status: d?.status ?? null,
    checkInTime: d?.clockInTime
      ? new Date(d.clockInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: timezone })
      : null,
    checkOutTime: d?.clockOutTime
      ? new Date(d.clockOutTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: timezone })
      : null,
    totalWorkHours: d?.totalWorkHours ?? null,
    onBreak: false,
    breakType: null,
    breakStartTime: null,
    record: d,
  };
}

// Step 1 — send Wi-Fi/device context; backend validates the network BEFORE
// returning a code. If they're on the wrong Wi-Fi, this throws with a message
// telling them to connect to the company network (no code is shown).
export async function requestChallenge(sessionId: string): Promise<{ code: string; expiresIn: number }> {
  const ctx = await collectCheckInContext();
  return api.post<{ code: string; expiresIn: number }>(
    '/attendance/check-in/challenge', { sessionId, ...ctx }
  );
}

// Step 2 — submit check-in with the code the user entered + device/wifi context
export async function checkInApi(payload: {
  sessionId: string;
  challengeCode: string;
}): Promise<AttendanceStatus> {
  // Collect device + wifi context for backend enforcement
  const ctx = await collectCheckInContext();
  const res = await api.post<any>('/attendance/check-in', { ...payload, ...ctx });
  const d = res?.record;
  const timezone = res?.timezone || d?.session?.office?.timezone || 'Africa/Lagos';
  return {
    hasCheckedIn: true,
    hasCheckedOut: false,
    status: d?.status ?? 'PRESENT',
    checkInTime: d?.clockInTime
      ? new Date(d.clockInTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: timezone })
      : new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: timezone }),
    checkOutTime: null,
    totalWorkHours: null,
    onBreak: false,
    breakType: null,
    breakStartTime: null,
    penalty: res?.penalty ?? d?.penalty ?? 0,
    record: d,
  };
}

export async function checkOutApi(): Promise<{ checkOutTime: string; totalWorkHours: string | null }> {
  // Same device / wifi / location enforcement applies on check-out
  const ctx = await collectCheckInContext();
  const d = await api.post<any>('/attendance/check-out', ctx);
  const timezone = d?.session?.office?.timezone || 'Africa/Lagos';
  return {
    checkOutTime: d?.clockOutTime
      ? new Date(d.clockOutTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: timezone })
      : new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: timezone }),
    totalWorkHours: d?.totalWorkHours ?? null,
  };
}

export async function getHistoryApi(page = 1, limit = 200): Promise<AttendanceRecord[]> {
  const res = await api.get<any>(`/attendance/history?page=${page}&limit=${limit}&_live=${Date.now()}`);
  const rows: any[] = Array.isArray(res) ? res : Array.isArray((res as any)?.records) ? (res as any).records : Array.isArray((res as any)?.data) ? (res as any).data : [];
  const totalPages = Math.max(1, Number((res as any)?.totalPages) || 1);
  const rest = totalPages > 1 ? await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) =>
    api.get<any>(`/attendance/history?page=${index + 2}&limit=${limit}&_live=${Date.now()}`).then((pageResponse) =>
      Array.isArray(pageResponse) ? pageResponse : Array.isArray(pageResponse?.records) ? pageResponse.records : Array.isArray(pageResponse?.data) ? pageResponse.data : []),
  )) : [];
  rows.push(...rest.flat());
  return rows.map((r: any) => ({
    id: r.id,
    date: r.date,
    clockInTime: r.clockInTime,
    clockOutTime: r.clockOutTime,
    status: r.status,
    totalWorkHours: r.totalWorkHours ?? r.total_work_hours ?? null,
    totalBreakMinutes: r.totalBreakMinutes ?? 0,
    flagged: r.flagged ?? false,
    wifiVerified: r.wifiVerified ?? false,
    deviceVerified: r.deviceVerified ?? false,
  }));
}
