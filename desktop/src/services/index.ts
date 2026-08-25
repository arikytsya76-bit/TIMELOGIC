import { api } from './api';
import { API_URL } from '../config';
import type {
  ApiEnvelope,
  EmployeeCheckInMethod,
  ManualAttendanceDashboard,
  ManualAttendanceResult,
} from '../types/api';

// ─── Dashboard ───────────────────────────────────────────────────────────────
export const fetchLiveStats   = () => api.get<any>('/reports/live-stats').then((r) => r.data ?? r);

// ─── Sessions ────────────────────────────────────────────────────────────────
export const fetchSessions    = () => api.get<any>('/sessions').then((r) => r.data ?? []);
export const createSession    = (body: any) => api.post<any>('/sessions', body).then((r) => r.data);
export const startSession     = (id: string) => api.post<any>(`/sessions/${id}/start`, {}).then((r) => r.data);
export const pauseSession     = (id: string) => api.post<any>(`/sessions/${id}/pause`, {}).then((r) => r.data);
export const resumeSession    = (id: string) => api.post<any>(`/sessions/${id}/resume`, {}).then((r) => r.data);
export const endSession       = (id: string) => api.post<any>(`/sessions/${id}/end`, {}).then((r) => r.data);
export const lockSession      = (id: string) => api.post<any>(`/sessions/${id}/lock`, {}).then((r) => r.data);
export const refreshQR        = (id: string) => api.post<any>(`/sessions/${id}/refresh-qr`, {}).then((r) => r.data);

// ─── Attendance ──────────────────────────────────────────────────────────────
export const fetchAttendance = async (query = '') => {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  params.set('page', '1');
  params.set('limit', '200');
  params.set('_live', String(Date.now()));
  const first = await api.get<any>(`/attendance/history?${params.toString()}`);
  const rows = Array.isArray(first.data) ? first.data : Array.isArray(first.records) ? first.records : [];
  const totalPages = Math.max(1, Number(first.totalPages) || 1);
  if (totalPages === 1) return rows;
  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => {
      const next = new URLSearchParams(params);
      next.set('page', String(index + 2));
      return api.get<any>(`/attendance/history?${next.toString()}`).then((r) => Array.isArray(r.data) ? r.data : Array.isArray(r.records) ? r.records : []);
    }),
  );
  return [...rows, ...rest.flat()];
};
export const fetchAttendanceHistory = (startDate: string, endDate: string) =>
  fetchAttendance(`startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
export const fetchAttendanceForDate = (date: string) => fetchAttendanceHistory(date, date);
export const fetchMonthlyPenalties = (month: string) => api.get<any>(`/attendance/penalties/monthly?month=${encodeURIComponent(month)}`).then((r) => r.data);
export const fetchLiveAttendance = () =>
  api.get<any>(`/attendance/live?_live=${Date.now()}`).then((response) =>
    Array.isArray(response.data) ? response.data : Array.isArray(response.records) ? response.records : []
  );
export const fetchFlagged     = () => api.get<any>('/attendance/flagged').then((r) => r.data ?? []);
export const flagRecord       = (id: string, reason: string) => api.put<any>(`/attendance/records/${id}/flag`, { reason });
export const approveRecord    = (id: string) => api.put<any>(`/attendance/records/${id}/approve`, {});
export const fetchManualAttendance = (params: { sessionId?: string; search?: string } = {}) => {
  const query = new URLSearchParams({ page: '1', limit: '200' });
  if (params.sessionId) query.set('sessionId', params.sessionId);
  if (params.search?.trim()) query.set('search', params.search.trim());
  return api.get<ApiEnvelope<ManualAttendanceDashboard>>(`/admin/manual-attendance?${query.toString()}`).then(async (first) => {
    const dashboard = first.data;
    if ((dashboard.totalPages ?? 1) <= 1) return dashboard;
    const rest = await Promise.all(
      Array.from({ length: dashboard.totalPages - 1 }, (_, index) => {
        const next = new URLSearchParams(query);
        next.set('page', String(index + 2));
        return api.get<ApiEnvelope<ManualAttendanceDashboard>>(`/admin/manual-attendance?${next.toString()}`).then((r) => r.data.employees);
      }),
    );
    return { ...dashboard, employees: [...dashboard.employees, ...rest.flat()] };
  });
};
export const manualEmployeeCheckIn = (body: { employeeId: string; sessionId: string; password: string }) =>
  api.post<ApiEnvelope<ManualAttendanceResult>>('/admin/manual-attendance/check-in', body).then((r) => r.data);
export const manualEmployeeCheckOut = (body: { employeeId: string; sessionId?: string; password: string }) =>
  api.post<ApiEnvelope<ManualAttendanceResult>>('/admin/manual-attendance/check-out', body).then((r) => r.data);

// ─── Employees ───────────────────────────────────────────────────────────────
export const fetchEmployees = async () => {
  const first = await api.get<any>('/admin/users?role=EMPLOYEE&page=1&limit=100');
  const rows = Array.isArray(first) ? first : Array.isArray(first.data) ? first.data : Array.isArray(first.data?.users) ? first.data.users : Array.isArray(first.records) ? first.records : [];
  const totalPages = Math.max(1, Number(first.totalPages) || 1);
  if (totalPages === 1) return rows;
  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      api.get<any>(`/admin/users?role=EMPLOYEE&page=${index + 2}&limit=100`).then((r) => Array.isArray(r) ? r : Array.isArray(r.data) ? r.data : Array.isArray(r.data?.users) ? r.data.users : []),
    ),
  );
  return [...rows, ...rest.flat()];
};
export const fetchEmployeeSummary = (id: string) => api.get<any>(`/admin/users/${id}/summary`).then((r) => r.data);
export const fetchPlanInfo    = () => api.get<any>('/admin/plan').then((r) => r.data);
export const createEmployee   = (body: any) => api.post<any>('/admin/employees', body).then((r) => r.data);
export const updateEmployee   = (id: string, body: { checkInMethod: EmployeeCheckInMethod; departmentId?: string }) =>
  api.put<any>(`/admin/users/${id}`, body).then((r) => r.data);
export const suspendUser      = (id: string) => api.put<any>(`/admin/users/${id}/suspend`, {});
export const activateUser     = (id: string) => api.put<any>(`/admin/users/${id}`, { status: 'ACTIVE' });
export const deleteEmployee   = (id: string) => api.delete<any>(`/admin/users/${id}`);
export const resetDevice      = (id: string) => api.post<any>(`/admin/users/${id}/reset-device`, {}).then((r) => r.data);
export const fetchDepartments = () => api.get<any>('/admin/org').then((r) => (r.data?.departments ?? []));

// ─── Leaves ──────────────────────────────────────────────────────────────────
export const fetchPendingLeaves = () => api.get<any>('/leaves/pending').then((r) => r.data ?? []);
export const approveLeave       = (id: string) => api.put<any>(`/leaves/${id}/approve`, {});
export const rejectLeave        = (id: string, reason: string) => api.put<any>(`/leaves/${id}/reject`, { reason });

// ─── Breaks ──────────────────────────────────────────────────────────────────
export const fetchDailyBreaks  = (date?: string) => api.get<any>(`/breaks/daily${date ? `?date=${encodeURIComponent(date)}` : ''}`).then((r) => r.data ?? []);
export const startEmployeeBreak = (employeeId: string, breakType: string, notes?: string) => api.post<any>(`/admin/breaks/${employeeId}/start`, { breakType, notes }).then((r) => r.data);
export const endEmployeeBreak = (employeeId: string, breakId: string) => api.put<any>(`/admin/breaks/${employeeId}/${breakId}/end`, {}).then((r) => r.data);

// ─── Fraud Alerts ────────────────────────────────────────────────────────────
export const fetchAlerts      = () => api.get<any>('/fraud').then((r) => r.data ?? []);
export const resolveAlert     = (id: string, resolution: string) => api.put<any>(`/fraud/${id}/resolve`, { resolution });
export const dismissAlert     = (id: string) => api.put<any>(`/fraud/${id}/dismiss`, { reason: 'Dismissed by organization admin' });
export const escalateAlert    = (id: string) => api.put<any>(`/fraud/${id}/escalate`, {});

// ─── Reports ─────────────────────────────────────────────────────────────────
export const fetchDailyReport = () => api.get<any>('/reports/daily').then((r) => r.data);
export const fetchMonthlyReport= () => api.get<any>('/reports/monthly').then((r) => r.data);
export const getExcelUrl      = () => `${API_URL}/reports/export/excel`;
export const getCsvUrl        = () => `${API_URL}/reports/export/csv`;

// ─── Office / Check-In Enforcement Settings ──────────────────────────────────
export const fetchAdminOrg       = () => api.get<any>('/admin/org').then((r) => r.data);
export const updateOfficeSettings = (officeId: string, body: any) =>
  api.put<any>(`/admin/offices/${officeId}/settings`, body).then((r) => r.data);

// ─── Emergency ───────────────────────────────────────────────────────────────
export const stopAllAttendance = (officeId: string, reason: string) => api.post<any>('/admin/emergency/stop-all', { officeId, reason });
export const lockSystem        = (reason: string) => api.post<any>('/admin/emergency/lock-system', { reason });
export const invalidateQR      = (officeId: string, reason: string) => api.post<any>('/admin/emergency/invalidate-qr', { officeId, reason });
export const revertEmergency   = (controlId: string) => api.post<any>(`/admin/emergency/${controlId}/revert`, {});
