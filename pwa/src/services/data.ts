import { api } from "./api";
import { getDeviceId } from "./device";
import { PLATFORM } from "../config";
import { LEAVE_COLORS, LEAVE_LABELS } from "../lib/constants";

export interface SessionInfo {
  sessionId: string; sessionName: string; office?: string; status: string;
  timezone?: string; openTime?: string; closeTime?: string; lateAfterMinutes?: number;
  startTime?: string; endTime?: string; elapsedMinutes?: number; remainingMinutes?: number | null;
}
export interface BreakRec { id: string; breakType: string; startTime: string; endTime: string | null; durationMinutes: number | null }
export interface StatusRec {
  id: string; sessionId: string; clockInTime: string | null; clockOutTime: string | null;
  status: string; totalWorkHours: string | null; totalBreakMinutes?: number; breakRecords?: BreakRec[];
  session?: { office?: { timezone?: string | null } | null } | null;
}
export interface HistRec {
  id: string; date: string; status: string; clockInTime: string | null; clockOutTime: string | null;
  totalWorkHours: string | null; totalBreakMinutes?: number; wifiVerified?: boolean; deviceVerified?: boolean;
  timezone?: string | null;
  session?: { office?: { timezone?: string | null } | null } | null;
}
export interface LeaveBalance { type: string; label: string; entitled: number; used: number; pending: number; remaining: number; color: string }

const dev = () => ({ platform: PLATFORM, deviceId: getDeviceId() });

export const getCurrentSession = () => api.get<SessionInfo>("/attendance/current-session");
export const getStatus = () => api.get<StatusRec | null>(`/attendance/status?_live=${Date.now()}`);
export async function getHistory(): Promise<HistRec[]> {
  const first = await api.get<any>(`/attendance/history?page=1&limit=200&_live=${Date.now()}`);
  const firstRows = Array.isArray(first) ? first : Array.isArray(first.records) ? first.records : [];
  const totalPages = Math.max(1, Number(first.totalPages) || 1);
  if (totalPages === 1) return firstRows;
  const rest = await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) =>
    api.get<any>(`/attendance/history?page=${index + 2}&limit=200&_live=${Date.now()}`).then((page) =>
      Array.isArray(page) ? page : Array.isArray(page.records) ? page.records : []),
  ));
  return [...firstRows, ...rest.flat()];
}

export const requestChallenge = (sessionId: string) =>
  api.post<{ code: string; expiresIn: number }>("/attendance/check-in/challenge", { sessionId, ...dev() });

export const checkIn = (sessionId: string, challengeCode: string) =>
  api.post<any>("/attendance/check-in", { sessionId, challengeCode, ...dev() });

export const checkOut = (sessionId: string) =>
  api.post<any>("/attendance/check-out", { sessionId, ...dev() });

export const getActiveBreak = () => api.get<BreakRec | null>("/breaks/active");
export const startBreak = (breakType: string) => api.post<BreakRec>("/breaks", { breakType });
export const endBreak = (breakId: string) => api.put<any>(`/breaks/${breakId}/end`, {});

export async function getLeaveBalances(): Promise<LeaveBalance[]> {
  const rows = await api.get<any[]>("/leaves/balance");
  return (rows ?? []).map((b) => ({
    type: b.leaveType,
    label: LEAVE_LABELS[b.leaveType] ?? b.leaveType,
    entitled: b.totalEntitled,
    used: b.used,
    pending: b.pending,
    remaining: b.remaining,
    color: LEAVE_COLORS[b.leaveType] ?? "#64748B",
  }));
}

export const submitLeave = (body: { leaveType: string; startDate: string; endDate: string; reason: string }) =>
  api.post("/leaves", body);
