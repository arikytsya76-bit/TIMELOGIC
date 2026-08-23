import { api } from './api';

export interface LeaveBalance {
  type: string;
  label: string;
  entitled: number;
  used: number;
  pending: number;
  remaining: number;
  color: string;
}

const LEAVE_COLORS: Record<string, string> = {
  ANNUAL: '#1D4ED8', SICK: '#10B981', CASUAL: '#F59E0B',
  MATERNITY: '#EC4899', PATERNITY: '#8B5CF6', UNPAID: '#64748B', COMPASSIONATE: '#F97316',
};
const LEAVE_LABELS: Record<string, string> = {
  ANNUAL: 'Annual Leave', SICK: 'Sick Leave', CASUAL: 'Casual Leave',
  MATERNITY: 'Maternity', PATERNITY: 'Paternity', UNPAID: 'Unpaid Leave', COMPASSIONATE: 'Compassionate',
};

export async function getLeaveBalances(): Promise<LeaveBalance[]> {
  const res = await api.get<any[]>('/leaves/balance');
  return (res ?? []).map((b: any) => ({
    type: b.leaveType,
    label: LEAVE_LABELS[b.leaveType] ?? b.leaveType,
    entitled: b.totalEntitled,
    used: b.used,
    pending: b.pending,
    remaining: b.remaining,
    color: LEAVE_COLORS[b.leaveType] ?? '#64748B',
  }));
}

export async function submitLeaveRequest(body: {
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
}): Promise<void> {
  await api.post('/leaves', body);
}
