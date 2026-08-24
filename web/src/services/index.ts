import { api } from './api';

// ─── Super Admin ────────────────────────────────────────────────────────────
export const fetchSystemStats = () => api.get<any>('/super/stats').then((r) => r.data);
export const fetchAllOrgs     = () => api.get<any>('/super/organizations').then((r) => r.data ?? []);
export const createOrg        = (body: any) => api.post<any>('/super/organizations', body).then((r) => r.data);
export const updateOrg        = (id: string, body: any) => api.put<any>(`/super/organizations/${id}`, body).then((r) => r.data);
export const deleteOrg        = (id: string) => api.delete<any>(`/super/organizations/${id}`);
export const updateOfficeSecurity = (officeId: string, body: any) => api.put<any>(`/super/offices/${officeId}/settings`, body).then((r) => r.data);
export const fetchOrgUsers          = (id: string) => api.get<any>(`/super/organizations/${id}/users`).then((r) => r.data ?? []);
export const fetchLeavePolicy       = (id: string) => api.get<any>(`/super/organizations/${id}/leave-policy`).then((r) => r.data);
export const saveLeavePolicy        = (id: string, policy: Record<string, number>) => api.put<any>(`/super/organizations/${id}/leave-policy`, { policy }).then((r) => r.data);
export const addOrgDepartment       = (orgId: string, name: string, policy: Record<string, unknown> = {}) => api.post<any>(`/super/organizations/${orgId}/departments`, { name, ...policy }).then((r) => r.data);
export const updateOrgDepartmentBreakPolicy = (departmentId: string, body: any) => api.put<any>(`/super/departments/${departmentId}/break-policy`, body).then((r) => r.data);
export const fetchEmployeeRecords   = (userId: string) => api.get<any>(`/super/employees/${userId}/records`).then((r) => r.data);
export const reemployEmployee       = (userId: string) => api.put<any>(`/super/employees/${userId}/reemploy`, {});

// ─── Existing ────────────────────────────────────────────────────────────────
export const fetchOrg         = () => api.get<any>('/admin/org').then((r) => r.data);
export const fetchAllUsers    = () => api.get<any>('/admin/users').then((r) => r.data ?? []);
export const suspendUser      = (id: string) => api.put<any>(`/admin/users/${id}/suspend`, {});
export const activateUser     = (id: string) => api.put<any>(`/admin/users/${id}`, { status: 'ACTIVE' });
// Super Admin user management: suspend/activate ADMINS only, reassign EMPLOYEES only
export const suspendAdmin     = (id: string) => api.put<any>(`/super/users/${id}/suspend`, {});
export const activateAdmin    = (id: string) => api.put<any>(`/super/users/${id}/activate`, {});
export const reassignEmployee = (id: string, orgId: string) => api.put<any>(`/super/users/${id}/reassign`, { orgId });
export const resetUserDevice  = (id: string) => api.post<any>(`/admin/users/${id}/reset-device`, {});
export const updateProfile    = (body: { firstName?: string; lastName?: string; email?: string }) => api.put<any>('/super/profile', body).then((r) => r.data);
export const changePassword   = (currentPassword: string, newPassword: string) => api.put<any>('/auth/change-password', { currentPassword, newPassword });
export const resetSystem      = () => api.post<any>('/super/reset', { confirm: 'RESET' });
export const fetchSettings    = (officeId: string) => api.get<any>(`/admin/offices/${officeId}/settings`).then((r) => r.data);
export const updateSettings   = (officeId: string, body: any) => api.put<any>(`/admin/offices/${officeId}/settings`, body);
export const fetchMonthly     = () => api.get<any>('/reports/monthly').then((r) => r.data);
