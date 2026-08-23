import React, { useEffect, useState, useRef } from 'react';
import { Search, UserPlus, Smartphone, X, Eye, Camera, Pencil, Settings2 } from 'lucide-react';
import Header from '../components/Header';
import { fetchEmployees, createEmployee, updateEmployee, suspendUser, activateUser, deleteEmployee, resetDevice, fetchDepartments, fetchPlanInfo } from '../services';
import { API_URL, SOCKET_URL } from '../config';
import { getToken, authenticatedFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { AdminOrganization, EmployeeCheckInMethod } from '../types/api';

const STATUS_STYLE: Record<string, string> = {
  ACTIVE:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30',
  SUSPENDED:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
  ON_LEAVE:   'bg-violet-100 text-violet-700 dark:bg-violet-900/30',
  TERMINATED: 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
};

const SHIFTS = ['MORNING', 'AFTERNOON', 'NIGHT', 'FLEXIBLE'];

const METHOD_LABEL: Record<EmployeeCheckInMethod, string> = {
  PHONE: 'Phone / Device',
  MANUAL: 'Manual by Admin',
  BOTH: 'Phone + Manual',
};

function availableMethods(organization: AdminOrganization | null): EmployeeCheckInMethod[] {
  if (!organization) return [];
  const methods: EmployeeCheckInMethod[] = [];
  if (organization.allowDeviceCheckIn) methods.push('PHONE');
  if (organization.allowManualCheckIn) methods.push('MANUAL');
  if (organization.allowDeviceCheckIn && organization.allowManualCheckIn) methods.push('BOTH');
  return methods;
}

function defaultMethod(organization: AdminOrganization | null): EmployeeCheckInMethod {
  return availableMethods(organization)[0] ?? 'PHONE';
}

interface AddForm {
  firstName: string; lastName: string; email: string; password: string;
  employeeCode: string; shiftType: string; departmentId: string; phone: string;
  checkInMethod: EmployeeCheckInMethod;
}
const defaultForm = (organization: AdminOrganization | null): AddForm => ({ firstName: '', lastName: '', email: '', password: '', employeeCode: '', shiftType: 'MORNING', departmentId: '', phone: '', checkInMethod: defaultMethod(organization) });

function AddEmployeeModal({ depts, organization, onClose, onSaved }: { depts: any[]; organization: AdminOrganization; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<AddForm>(() => defaultForm(organization));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const methods = availableMethods(organization);
  const up = <K extends keyof AddForm,>(k: K, v: AddForm[K]) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.firstName || !form.lastName || !form.email || !form.password) { setError('First name, last name, email and password are required.'); return; }
    if (!methods.includes(form.checkInMethod)) { setError('Choose a check-in method enabled for this organization.'); return; }
    setLoading(true); setError('');
    try {
      await createEmployee({ ...form, departmentId: form.departmentId || undefined });
      onSaved(); onClose();
    } catch (err: any) { setError(err?.message ?? 'Failed to add employee'); }
    finally { setLoading(false); }
  };

  const inputCls = 'w-full border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-main)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder-[var(--text-muted)]';
  const labelCls = 'block text-xs font-semibold text-[var(--text-muted)] mb-1.5';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--card-bg)] rounded-3xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border)]">
          <h2 className="text-lg font-bold text-[var(--text-main)]">Add New Employee</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)]"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelCls}>First Name *</label><input className={inputCls} value={form.firstName} onChange={(e) => up('firstName', e.target.value)} placeholder="First name" /></div>
            <div><label className={labelCls}>Last Name *</label><input className={inputCls} value={form.lastName} onChange={(e) => up('lastName', e.target.value)} placeholder="Last name" /></div>
          </div>
          <div><label className={labelCls}>Work Email *</label><input className={inputCls} type="email" value={form.email} onChange={(e) => up('email', e.target.value)} placeholder="employee@company.com" /></div>
          <div><label className={labelCls}>Password * (min 8 chars)</label><input className={inputCls} type="password" value={form.password} onChange={(e) => up('password', e.target.value)} placeholder="Employee login password" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelCls}>Employee Code</label><input className={inputCls} value={form.employeeCode} onChange={(e) => up('employeeCode', e.target.value)} placeholder="e.g. EMP002" /></div>
            <div><label className={labelCls}>Phone</label><input className={inputCls} value={form.phone} onChange={(e) => up('phone', e.target.value)} placeholder="+234..." /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Shift Type</label>
              <select className={inputCls} value={form.shiftType} onChange={(e) => up('shiftType', e.target.value)}>
                {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Department</label>
              <select className={inputCls} value={form.departmentId} onChange={(e) => up('departmentId', e.target.value)}>
                <option value="">None</option>
                {depts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>Employee Check-In Method *</label>
            <select className={inputCls} value={form.checkInMethod} onChange={(e) => up('checkInMethod', e.target.value as EmployeeCheckInMethod)} disabled={methods.length === 0}>
              {methods.map((method) => <option key={method} value={method}>{METHOD_LABEL[method]}</option>)}
            </select>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              Only methods enabled by the Super Admin are available. At the Admin station, the employee confirms each manual action with their own password.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 pb-6">
          <button onClick={onClose} className="px-4 py-2 border border-[var(--border)] text-[var(--text-main)] text-sm font-semibold rounded-xl hover:bg-[var(--hover-bg)] transition">Cancel</button>
          <button onClick={submit} disabled={loading} className="px-6 py-2 bg-primary-700 hover:bg-primary-800 text-white text-sm font-bold rounded-xl transition disabled:opacity-60">
            {loading ? 'Adding...' : 'Add Employee'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditCheckInMethodModal({
  employee,
  organization,
  onClose,
  onSaved,
}: {
  employee: any;
  organization: AdminOrganization;
  onClose: () => void;
  onSaved: () => void;
}) {
  const methods = availableMethods(organization);
  const current = employee.checkInMethod as EmployeeCheckInMethod | undefined;
  const [method, setMethod] = useState<EmployeeCheckInMethod>(() => (
    current && methods.includes(current) ? current : defaultMethod(organization)
  ));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!methods.includes(method)) {
      setError('No enabled check-in method is available for this organization.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await updateEmployee(employee.id, { checkInMethod: method });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the employee.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-3xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border)]">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-main)]">Edit Check-In Method</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{employee.firstName} {employee.lastName}</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)]"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">{error}</div>}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">Allowed method</label>
            <select value={method} onChange={(event) => setMethod(event.target.value as EmployeeCheckInMethod)} disabled={methods.length === 0}
              className="w-full border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-main)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50">
              {methods.map((option) => <option key={option} value={option}>{METHOD_LABEL[option]}</option>)}
            </select>
          </div>
          {current && !methods.includes(current) && (
            <p className="text-xs text-amber-700 dark:text-amber-400">The current {METHOD_LABEL[current]} method is no longer enabled organization-wide. Saving will move this employee to an available method.</p>
          )}
          <div className="rounded-xl bg-[var(--hover-bg)] p-3 text-xs text-[var(--text-muted)]">
            Effective channels are always the intersection of this employee setting and the organization-wide permissions.
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 pb-6">
          <button onClick={onClose} className="px-4 py-2 border border-[var(--border)] text-[var(--text-main)] rounded-xl text-sm font-semibold">Cancel</button>
          <button onClick={() => void save()} disabled={loading || methods.length === 0}
            className="px-5 py-2 bg-primary-700 hover:bg-primary-800 text-white rounded-xl text-sm font-bold disabled:opacity-50">
            {loading ? 'Saving...' : 'Save Method'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmployeeDetailModal({ emp: initialEmp, onClose, onRefresh }: { emp: any; onClose: () => void; onRefresh: () => void }) {
  const [emp, setEmp] = useState(initialEmp);
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError] = useState(false);
  // Stable cache-bust version — only increments when a new photo is uploaded
  const [imgVersion, setImgVersion] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync if parent refreshes and passes new data
  React.useEffect(() => { setEmp(initialEmp); setImgError(false); }, [initialEmp]);

  const uploadFace = async (file: File) => {
    const token = getToken();
    if (!token) { alert('Session expired. Please log in again.'); return; }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);  // field name must match upload.single('photo')

      const res = await authenticatedFetch(`${API_URL}/admin/users/${emp.id}/face`, {
        method: 'POST',
        // DO NOT set Content-Type manually — browser sets it with multipart boundary
        body: fd,
      });

      const data = await res.json().catch(() => ({ success: false, message: `HTTP ${res.status}` }));

      if (data.success) {
        setImgError(false);
        setImgVersion((v) => v + 1);  // force browser to re-fetch the new image
        setEmp((p: any) => ({ ...p, profileImageUrl: data.data.profileImageUrl }));
        onRefresh();
        alert('✓ Face photo saved. Employee can now use face verification at check-in.');
      } else {
        alert(`Upload failed: ${data.message ?? 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Upload error: ${err?.message ?? 'Network error — is the backend running?'}`);
    } finally {
      setUploading(false);
    }
  };

  const rows = [
    { label: 'Email',              value: emp.email },
    { label: 'Employee Code',      value: emp.employeeCode ?? '—' },
    { label: 'Department',         value: emp.department?.name ?? '—' },
    { label: 'Shift Type',         value: emp.shiftType ?? '—' },
    { label: 'Check-In Method',    value: METHOD_LABEL[(emp.checkInMethod as EmployeeCheckInMethod) ?? 'PHONE'] ?? emp.checkInMethod ?? '—' },
    { label: 'Role',               value: emp.role },
    { label: 'Status',             value: emp.status },
    { label: 'Face Registered',    value: emp.profileImageUrl ? '✓ Yes' : '✗ No (required for check-in)' },
    { label: 'Last Login',         value: emp.lastLoginAt ? new Date(emp.lastLoginAt).toLocaleString() : 'Never' },
    { label: 'Joined',             value: new Date(emp.createdAt).toLocaleDateString('en-GB') },
    { label: 'Registered Devices', value: String(emp._count?.devices ?? 0) },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--card-bg)] rounded-3xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border)]">
          <h2 className="text-lg font-bold text-[var(--text-main)]">Employee Profile</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)]"><X size={20} /></button>
        </div>
        <div className="p-6">
          {/* Avatar + face photo */}
          <div className="flex items-center gap-4 mb-5">
            <div className="relative">
              {emp.profileImageUrl && !imgError ? (
                <img
                  src={`${SOCKET_URL}${emp.profileImageUrl}?v=${imgVersion}`}
                  alt={`${emp.firstName?.[0] ?? ''}${emp.lastName?.[0] ?? ''}`}
                  className="w-16 h-16 rounded-full object-cover border-2 border-emerald-500 flex-shrink-0"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className={`w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 ${emp.profileImageUrl && !imgError ? 'border-2 border-emerald-500 bg-emerald-50' : 'bg-primary-100 dark:bg-primary-900/40 border-2 border-dashed border-[var(--border)]'}`}>
                  <span className="text-xl font-bold text-primary-700">{emp.firstName?.[0]}{emp.lastName?.[0]}</span>
                </div>
              )}
              <button onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary-700 rounded-full flex items-center justify-center text-white hover:bg-primary-800"
                title="Upload face photo">
                <Camera size={12} />
              </button>
            </div>
            <div>
              <h3 className="text-xl font-bold text-[var(--text-main)]">{emp.firstName} {emp.lastName}</h3>
              <p className="text-sm text-[var(--text-muted)]">{emp.email}</p>
              {!emp.profileImageUrl && (
                <p className="text-xs text-amber-600 mt-0.5">⚠ No face photo — click camera icon to upload</p>
              )}
              {emp.profileImageUrl && imgError && (
                <p className="text-xs text-red-500 mt-0.5">⚠ Photo saved but failed to display</p>
              )}
            </div>
          </div>

          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFace(f); }} />

          {uploading && (
            <div className="mb-3 p-2 bg-primary-50 dark:bg-primary-900/20 rounded-xl text-xs text-primary-700 text-center">Uploading face photo...</div>
          )}

          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.label} className="flex justify-between py-2 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--text-muted)]">{r.label}</span>
                <span className={`text-sm font-semibold ${r.label === 'Face Registered' && !emp.profileImageUrl ? 'text-amber-600' : 'text-[var(--text-main)]'}`}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          {/* Only show upload button if no face photo is registered yet */}
          {!emp.profileImageUrl && (
            <button onClick={() => fileRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary-50 dark:bg-primary-900/20 text-primary-700 text-sm font-semibold rounded-xl hover:bg-primary-100 transition">
              <Camera size={15} />Upload Face Photo
            </button>
          )}
          <button onClick={onClose}
            className={`${!emp.profileImageUrl ? 'flex-1' : 'w-full'} py-2.5 border border-[var(--border)] text-[var(--text-main)] text-sm font-semibold rounded-xl hover:bg-[var(--hover-bg)] transition`}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 border-t-transparent" /></div>;
}

export default function Employees() {
  const { organization } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [depts, setDepts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [shift, setShift] = useState('All');
  const [showAdd, setShowAdd] = useState(false);
  const [viewEmp, setViewEmp] = useState<any>(null);
  const [editEmp, setEditEmp] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);

  const load = () => {
    Promise.all([fetchEmployees(), fetchDepartments(), fetchPlanInfo().catch(() => null)])
      .then(([e, d, p]) => {
        const emps = e.filter((u: any) => u.role === 'EMPLOYEE');
        setEmployees(emps);
        setDepts(d);
        setPlan(p);
        if (viewEmp) {
          const fresh = emps.find((u: any) => u.id === viewEmp.id);
          if (fresh) setViewEmp(fresh);
        }
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = employees.filter((e) => {
    const name = `${e.firstName} ${e.lastName} ${e.email} ${e.employeeCode ?? ''}`.toLowerCase();
    return name.includes(search.toLowerCase()) && (shift === 'All' || e.shiftType === shift);
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Employees"
        subtitle={plan
          ? `${employees.filter((e: any) => e.status !== 'TERMINATED').length} active · ${plan.planName} plan${plan.limit ? ` (${plan.activeEmployees}/${plan.limit} slots used)` : ' · Unlimited'}`
          : `${employees.length} total`
        }
        action={
          availableMethods(organization).length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm font-semibold rounded-xl">
              <Settings2 size={15} />No check-in channel enabled
            </div>
          ) : plan && plan.limit && plan.activeEmployees >= plan.limit ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm font-semibold rounded-xl">
              ⚠ Limit reached — upgrade plan
            </div>
          ) : (
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">
              <UserPlus size={15} />Add Employee
            </button>
          )
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employees..."
              className="w-full pl-9 pr-4 py-2.5 border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-main)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          {['All', ...SHIFTS].map((s) => (
            <button key={s} onClick={() => setShift(s)}
              className={`text-xs font-semibold px-3 py-2 rounded-xl transition ${shift === s ? 'bg-primary-700 text-white' : 'bg-[var(--card-bg)] border border-[var(--border)] text-[var(--text-main)] hover:bg-[var(--hover-bg)]'}`}>
              {s}
            </button>
          ))}
        </div>
        {loading ? <Spinner /> : (
          <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden transition-colors">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--hover-bg)]">
                  {['Employee','Code','Department','Shift','Method','Face','Status','Actions'].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-[var(--text-muted)] px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map((e: any) => (
                  <tr key={e.id} className="hover:bg-[var(--hover-bg)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        {/* Face photo avatar — shows photo if uploaded, initials otherwise */}
                        {e.profileImageUrl ? (
                          <img src={`${SOCKET_URL}${e.profileImageUrl}`} alt="face"
                            className="w-9 h-9 rounded-full object-cover border-2 border-emerald-500 flex-shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0 border-2 border-dashed border-slate-300">
                            <span className="text-xs font-bold text-primary-700">{e.firstName?.[0]}{e.lastName?.[0]}</span>
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-[var(--text-main)]">{e.firstName} {e.lastName}</p>
                          <p className="text-xs text-[var(--text-muted)]">{e.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-primary-600">{e.employeeCode ?? '—'}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{e.department?.name ?? '—'}</td>
                    <td className="px-4 py-3"><span className="text-xs font-medium text-[var(--text-muted)] bg-[var(--hover-bg)] px-2 py-0.5 rounded-full border border-[var(--border)]">{e.shiftType}</span></td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-bold text-primary-700 bg-primary-100 dark:bg-primary-900/30 px-2 py-1 rounded-full whitespace-nowrap">
                        {METHOD_LABEL[(e.checkInMethod as EmployeeCheckInMethod) ?? 'PHONE'] ?? e.checkInMethod ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {e.profileImageUrl
                        ? <span className="text-xs font-semibold text-emerald-600">✓ Registered</span>
                        : <span className="text-xs text-amber-600">⚠ Not set</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_STYLE[e.status] ?? 'bg-slate-100 text-slate-500'}`}>
                        {e.status === 'TERMINATED' ? '🚫 SACKED' : e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button onClick={() => setViewEmp(e)} className="p-1.5 rounded-lg hover:bg-[var(--hover-bg)] text-[var(--text-muted)] transition" title="View profile"><Eye size={14} /></button>
                        {e.status !== 'TERMINATED' && (
                          <>
                            <button onClick={() => setEditEmp(e)} className="p-1.5 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/20 text-primary-600 transition" title="Edit check-in method"><Pencil size={14} /></button>
                            <button onClick={async () => { e.status === 'ACTIVE' ? await suspendUser(e.id) : await activateUser(e.id); load(); }}
                              className={`text-xs font-semibold px-2 py-1 rounded-lg transition ${e.status === 'ACTIVE' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 hover:bg-amber-100' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 hover:bg-emerald-100'}`}>
                              {e.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                            </button>
                            {organization?.allowDeviceCheckIn && ['PHONE', 'BOTH'].includes(e.checkInMethod ?? 'PHONE') && <button onClick={async () => {
                              if (!window.confirm(`Reset device for ${e.firstName} ${e.lastName}?\n\nThis unlinks their current phone. The NEXT device they sign in on becomes their bound device, and the old one will stop working. Use this when an employee gets a new phone.`)) return;
                              try { await resetDevice(e.id); alert('Device unlinked. The employee can now sign in on their new phone.'); } catch (err: any) { alert(err?.message ?? 'Could not reset device.'); }
                            }} className="p-1.5 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/20 text-primary-600 transition" title="Reset device (allow login on a new phone)">
                              <Smartphone size={14} />
                            </button>}
                            <button onClick={async () => {
                              if (!window.confirm(`Terminate ${e.firstName} ${e.lastName}?\n\nThey will be marked as SACKED and can no longer log in.\nAll their records (attendance, leaves, breaks) are preserved and visible only to Super Admin.`)) return;
                              await deleteEmployee(e.id);
                              load();
                            }} className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 text-red-500 transition" title="Terminate employee (soft delete)">
                              <X size={14} />
                            </button>
                          </>
                        )}
                        {e.status === 'TERMINATED' && (
                          <span className="text-[10px] text-slate-400 italic px-1">Record only</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="text-center py-12 text-[var(--text-muted)] text-sm">No employees found</div>}
          </div>
        )}
      </div>
      {showAdd && organization && <AddEmployeeModal depts={depts} organization={organization} onClose={() => setShowAdd(false)} onSaved={load} />}
      {editEmp && organization && <EditCheckInMethodModal employee={editEmp} organization={organization} onClose={() => setEditEmp(null)} onSaved={load} />}
      {viewEmp && <EmployeeDetailModal emp={viewEmp} onClose={() => setViewEmp(null)} onRefresh={load} />}
    </div>
  );
}
