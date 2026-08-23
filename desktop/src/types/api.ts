export type EmployeeCheckInMethod = 'PHONE' | 'MANUAL' | 'BOTH';

export interface AdminOrganization {
  id: string;
  name: string;
  allowDeviceCheckIn: boolean;
  allowManualCheckIn: boolean;
  hasStudents: boolean;
  openingTime?: string | null;
  timezone?: string | null;
}

export interface AdminUser {
  id: string;
  employeeCode: string | null;
  firstName: string;
  lastName: string;
  email: string;
  role: 'ADMIN' | 'SUPER_ADMIN';
  orgId: string;
  status: string;
  lastLoginAt?: string | null;
  checkInMethod?: EmployeeCheckInMethod | null;
  organization: AdminOrganization;
}

export interface AttendanceSummary {
  id?: string;
  sessionId?: string;
  clockInTime?: string | null;
  clockOutTime?: string | null;
  status?: string | null;
  penalty?: number | null;
  source?: string | null;
  entryMethod?: string | null;
  checkInSource?: string | null;
  checkOutSource?: string | null;
  session?: { office?: { name?: string | null; timezone?: string | null } | null } | null;
}

export interface ManualAttendanceEmployee {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode?: string | null;
  department?: { id?: string; name?: string | null } | string | null;
  checkInMethod: EmployeeCheckInMethod;
  attendance?: AttendanceSummary | null;
}

export interface ManualAttendanceSession {
  id: string;
  sessionName?: string | null;
  sessionId?: string | null;
  officeName?: string | null;
  office?: { name?: string | null; timezone?: string | null } | string | null;
  startTime?: string | null;
  endTime?: string | null;
  status?: string | null;
}

export interface ManualAttendanceDashboard {
  enabled: boolean;
  serverTime: string;
  organization: AdminOrganization;
  activeSessions: ManualAttendanceSession[];
  selectedSession: ManualAttendanceSession | null;
  employees: ManualAttendanceEmployee[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ManualAttendanceResult {
  record?: AttendanceSummary;
  attendance?: AttendanceSummary;
  status?: string | null;
  penalty?: number | null;
  clockInTime?: string | null;
  clockOutTime?: string | null;
  serverTime?: string | null;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
}
