import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  GraduationCap,
  LogIn,
  LogOut,
  Pencil,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import Header from '../components/Header';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

type StudentStatus = 'ACTIVE' | 'INACTIVE';

interface StudentAttendance {
  id: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  clockInTime?: string | null;
  clockOutTime?: string | null;
}

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  studentCode: string;
  className: string | null;
  status: StudentStatus;
  createdAt?: string;
  todayAttendance: StudentAttendance | null;
}

interface StudentFormValues {
  firstName: string;
  lastName: string;
  studentCode: string;
  className: string;
  status: StudentStatus;
}

interface StudentListResult {
  rows: Student[];
  total: number;
  sunday: boolean;
}

interface StudentHistoryRecord {
  id: string;
  date: string;
  checkInTime: string;
  checkOutTime?: string | null;
  student: { firstName: string; lastName: string; studentCode: string };
}

const EMPTY_FORM: StudentFormValues = {
  firstName: '',
  lastName: '',
  studentCode: '',
  className: '',
  status: 'ACTIVE',
};

const INPUT_CLASS =
  'w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-primary-500';
const LABEL_CLASS = 'mb-1.5 block text-xs font-semibold text-[var(--text-muted)]';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStudents(response: unknown): StudentListResult {
  const outer = isRecord(response) ? response : {};
  const data = 'data' in outer ? outer.data : response;

  if (Array.isArray(data)) {
    return { rows: data as Student[], total: typeof outer.total === 'number' ? outer.total : data.length, sunday: Boolean(outer.sunday) };
  }
  if (!isRecord(data)) return { rows: [], total: 0, sunday: false };

  const candidate = data.rows ?? data.items ?? data.students;
  const rows = Array.isArray(candidate) ? (candidate as Student[]) : [];
  const suppliedTotal = typeof data.total === 'number'
    ? data.total
    : typeof outer.total === 'number'
      ? outer.total
      : rows.length;

  return { rows, total: suppliedTotal, sunday: Boolean(data.sunday) };
}

function formatServerTime(value: string | null | undefined, timezone?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  try {
    return parsed.toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit',
      timeZone: timezone || 'Africa/Lagos',
    });
  } catch {
    return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

function Spinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
    </div>
  );
}

function StudentModal({
  student,
  onClose,
  onSave,
}: {
  student: Student | null;
  onClose: () => void;
  onSave: (values: StudentFormValues) => Promise<void>;
}) {
  const [form, setForm] = useState<StudentFormValues>(() => student
    ? {
        firstName: student.firstName,
        lastName: student.lastName,
        studentCode: student.studentCode,
        className: student.className ?? '',
        status: student.status,
      }
    : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (field: keyof StudentFormValues, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim() || !form.studentCode.trim()) {
      setError('First name, last name, and student code are required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave({
        ...form,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        studentCode: form.studentCode.trim(),
        className: form.className.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the student.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="w-full max-w-lg rounded-3xl bg-[var(--card-bg)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-main)]">
              {student ? 'Edit Student' : 'Add Student'}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {student ? 'Update this student’s organization record.' : 'Create a student in your organization.'}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close"
            className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-main)] disabled:opacity-50">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS} htmlFor="student-first-name">First Name *</label>
              <input id="student-first-name" autoFocus className={INPUT_CLASS} value={form.firstName}
                onChange={(event) => update('firstName', event.target.value)} placeholder="First name" />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="student-last-name">Last Name *</label>
              <input id="student-last-name" className={INPUT_CLASS} value={form.lastName}
                onChange={(event) => update('lastName', event.target.value)} placeholder="Last name" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASS} htmlFor="student-code">Student Code *</label>
              <input id="student-code" className={INPUT_CLASS} value={form.studentCode}
                onChange={(event) => update('studentCode', event.target.value)} placeholder="e.g. STU-001" />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="student-class">Class / Group</label>
              <input id="student-class" className={INPUT_CLASS} value={form.className}
                onChange={(event) => update('className', event.target.value)} placeholder="e.g. Year 2A" />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="student-status">Status</label>
            <select id="student-status" className={INPUT_CLASS} value={form.status}
              onChange={(event) => update('status', event.target.value)}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 pb-6">
          <button type="button" onClick={onClose} disabled={saving}
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-main)] transition hover:bg-[var(--hover-bg)] disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="rounded-xl bg-primary-700 px-6 py-2 text-sm font-bold text-white transition hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? 'Saving...' : student ? 'Save Changes' : 'Add Student'}
          </button>
        </div>
      </form>
    </div>
  );
}

function DeleteModal({
  student,
  deleting,
  onCancel,
  onConfirm,
}: {
  student: Student;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="alertdialog" aria-modal="true">
      <div className="w-full max-w-md rounded-3xl bg-[var(--card-bg)] p-6 shadow-2xl">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
          <Trash2 size={20} />
        </div>
        <h2 className="text-lg font-bold text-[var(--text-main)]">Archive student?</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          This will mark <span className="font-semibold text-[var(--text-main)]">{student.firstName} {student.lastName}</span>
          {' '}inactive while preserving their historical attendance. You can reactivate them from this list.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel} disabled={deleting}
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-main)] transition hover:bg-[var(--hover-bg)] disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting}
            className="rounded-xl bg-red-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
            {deleting ? 'Archiving...' : 'Archive Student'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Students() {
  const { organization } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
    const [sunday, setSunday] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | StudentStatus>('ALL');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [attendancePending, setAttendancePending] = useState<string | null>(null);
  const [view, setView] = useState<'today' | 'history'>('today');
  const [history, setHistory] = useState<StudentHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    setError('');
    try {
      const firstResponse = await api.get<unknown>('/admin/students?status=ALL&page=1&limit=200');
      const first = normalizeStudents(firstResponse);
      const outer = isRecord(firstResponse) ? firstResponse : {};
      const pagination = isRecord(outer.data) ? outer.data : outer;
      const totalPages = Math.max(1, Number(pagination.totalPages) || 1);
      const remaining = totalPages > 1
        ? await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) =>
            api.get<unknown>(`/admin/students?status=ALL&page=${index + 2}&limit=200`).then((response) => normalizeStudents(response).rows),
          ))
        : [];
      setStudents([...first.rows, ...remaining.flat()]);
      setTotal(first.total);
      setSunday(first.sunday);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load students.');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await api.get<unknown>('/admin/students/history?limit=200');
      const outer = isRecord(response) ? response : {};
      const data = isRecord(outer.data) ? outer.data : outer;
      setHistory(Array.isArray(data.records) ? data.records as StudentHistoryRecord[] : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load student history.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'history') void loadHistory();
  }, [loadHistory, view]);

  useEffect(() => {
    if (!success) return;
    const timeout = window.setTimeout(() => setSuccess(''), 4000);
    return () => window.clearTimeout(timeout);
  }, [success]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter((student) => {
      const searchable = `${student.firstName} ${student.lastName} ${student.studentCode} ${student.className ?? ''}`.toLowerCase();
      const matchesSearch = !query || searchable.includes(query);
      const matchesStatus = statusFilter === 'ALL' || student.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [search, statusFilter, students]);

  const saveStudent = async (values: StudentFormValues, student?: Student) => {
    const payload = {
      ...values,
      className: values.className || null,
    };

    if (student) {
      await api.put<unknown>(`/admin/students/${student.id}`, payload);
      setSuccess(`${values.firstName} ${values.lastName} was updated.`);
      setEditing(null);
    } else {
      await api.post<unknown>('/admin/students', payload);
      setSuccess(`${values.firstName} ${values.lastName} was added.`);
      setShowAdd(false);
    }
    await load();
  };

  const deleteStudent = async () => {
    if (!deleting) return;
    setDeletePending(true);
    setError('');
    try {
      await api.delete<unknown>(`/admin/students/${deleting.id}`);
      setSuccess(`${deleting.firstName} ${deleting.lastName} was archived.`);
      setDeleting(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete the student.');
    } finally {
      setDeletePending(false);
    }
  };

  const updateAttendance = async (student: Student, action: 'check-in' | 'check-out') => {
    setAttendancePending(`${student.id}:${action}`);
    setError('');
    try {
      await api.post<unknown>(`/admin/students/${student.id}/${action}`, {});
      setSuccess(`${student.firstName} ${student.lastName} checked ${action === 'check-in' ? 'in' : 'out'} successfully.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to ${action} the student.`);
    } finally {
      setAttendancePending(null);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header
        title="Students"
        subtitle={`${total} ${total === 1 ? 'student' : 'students'} in your organization`}
        action={(
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-800">
            <UserPlus size={15} /> Add Student
          </button>
        )}
      />

      <div className="flex-1 overflow-y-auto p-6">
        {success && (
          <div className="mb-5 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
            <span className="flex items-center gap-2"><CheckCircle2 size={16} />{success}</span>
            <button onClick={() => setSuccess('')} aria-label="Dismiss message" className="rounded p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"><X size={15} /></button>
          </div>
        )}
        {error && (
          <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            <span>{error}</span>
            <button onClick={() => void load(true)} className="shrink-0 font-semibold underline underline-offset-2">Retry</button>
          </div>
        )}
        {sunday && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Student attendance is unavailable on Sundays. Check-in returns at 12:00 AM Nigeria time.
          </div>
        )}

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <button onClick={() => setView('today')} className={`rounded-xl px-3 py-2 text-xs font-semibold ${view === 'today' ? 'bg-primary-700 text-white' : 'border border-[var(--border)] text-[var(--text-main)]'}`}>Today</button>
          <button onClick={() => setView('history')} className={`rounded-xl px-3 py-2 text-xs font-semibold ${view === 'history' ? 'bg-primary-700 text-white' : 'border border-[var(--border)] text-[var(--text-main)]'}`}>Past Attendance</button>
        </div>
        {view === 'today' && <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] max-w-sm flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, code, or class..."
              className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] py-2.5 pl-9 pr-4 text-sm text-[var(--text-main)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((status) => (
            <button key={status} onClick={() => setStatusFilter(status)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                statusFilter === status
                  ? 'bg-primary-700 text-white'
                  : 'border border-[var(--border)] bg-[var(--card-bg)] text-[var(--text-main)] hover:bg-[var(--hover-bg)]'
              }`}>
              {status === 'ALL' ? 'All' : status === 'ACTIVE' ? 'Active' : 'Inactive'}
            </button>
          ))}
        </div>}

        {view === 'history' ? (historyLoading ? <Spinner /> : (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] shadow-sm">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--border)] bg-[var(--hover-bg)]">
                {['Date', 'Student', 'Code', 'Check In', 'Check Out'].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">{heading}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-[var(--border)]">
                {history.map((record) => <tr key={record.id} className="hover:bg-[var(--hover-bg)]">
                  <td className="px-4 py-3 text-[var(--text-muted)]">{new Date(record.date).toLocaleDateString('en-NG', { timeZone: organization?.timezone || 'Africa/Lagos' })}</td>
                  <td className="px-4 py-3 font-semibold text-[var(--text-main)]">{record.student.firstName} {record.student.lastName}</td>
                  <td className="px-4 py-3 font-mono text-primary-600">{record.student.studentCode}</td>
                  <td className="px-4 py-3 text-[var(--text-main)]">{formatServerTime(record.checkInTime, organization?.timezone)}</td>
                  <td className="px-4 py-3 text-[var(--text-main)]">{formatServerTime(record.checkOutTime, organization?.timezone)}</td>
                </tr>)}
              </tbody>
            </table>
            {!history.length && <div className="py-12 text-center text-sm text-[var(--text-muted)]">No student attendance records found.</div>}
          </div>
        )) : loading ? <Spinner /> : (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] shadow-sm transition-colors">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--hover-bg)]">
                    {['Student', 'Code', 'Class / Group', 'Status', 'Today’s Attendance', 'Manual Attendance', 'Actions'].map((heading) => (
                      <th key={heading} className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)]">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredStudents.map((student) => {
                    const attendance = student.todayAttendance;
                    const checkInPending = attendancePending === `${student.id}:check-in`;
                    const checkOutPending = attendancePending === `${student.id}:check-out`;
                    const anotherAttendancePending = attendancePending !== null && !checkInPending && !checkOutPending;

                    return (
                      <tr key={student.id} className="transition-colors hover:bg-[var(--hover-bg)]">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                              <span className="text-xs font-bold">{student.firstName[0]}{student.lastName[0]}</span>
                            </div>
                            <div>
                              <p className="font-semibold text-[var(--text-main)]">{student.firstName} {student.lastName}</p>
                              <p className="text-xs text-[var(--text-muted)]">Student</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-primary-600 dark:text-primary-400">{student.studentCode}</td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{student.className || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                            student.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                          }`}>
                            {student.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {attendance ? (
                            <div className="space-y-0.5 text-xs">
                              <p className="text-[var(--text-main)]"><span className="text-[var(--text-muted)]">In:</span> {formatServerTime(attendance.clockInTime ?? attendance.checkInTime, organization?.timezone)}</p>
                              <p className="text-[var(--text-main)]"><span className="text-[var(--text-muted)]">Out:</span> {formatServerTime(attendance.clockOutTime ?? attendance.checkOutTime, organization?.timezone)}</p>
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">Not checked in</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {!attendance ? (
                            <button onClick={() => void updateAttendance(student, 'check-in')}
                              disabled={sunday || student.status !== 'ACTIVE' || attendancePending !== null}
                              title={student.status !== 'ACTIVE' ? 'Activate this student before checking in' : 'Record check-in using server time'}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50">
                              <LogIn size={13} /> {checkInPending ? 'Checking in...' : 'Check In'}
                            </button>
                          ) : !(attendance.clockOutTime ?? attendance.checkOutTime) ? (
                            <button onClick={() => void updateAttendance(student, 'check-out')}
                              disabled={anotherAttendancePending || checkOutPending}
                              title="Record check-out using server time"
                              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50">
                              <LogOut size={13} /> {checkOutPending ? 'Checking out...' : 'Check Out'}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 size={14} /> Complete
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setEditing(student)} title="Edit student" aria-label={`Edit ${student.firstName} ${student.lastName}`}
                              className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:bg-primary-50 hover:text-primary-700 dark:hover:bg-primary-900/30">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => setDeleting(student)} title="Delete student" aria-label={`Delete ${student.firstName} ${student.lastName}`}
                              className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredStudents.length === 0 && (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                  <GraduationCap size={23} />
                </div>
                <p className="font-semibold text-[var(--text-main)]">{students.length === 0 ? 'No students yet' : 'No matching students'}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {students.length === 0 ? 'Add your first student to begin recording attendance.' : 'Try changing your search or status filter.'}
                </p>
                {students.length === 0 && (
                  <button onClick={() => setShowAdd(true)} className="mt-4 text-sm font-semibold text-primary-600 hover:text-primary-700">
                    Add a student
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Student check-in and check-out times are recorded by the server.
        </p>
      </div>

      {showAdd && (
        <StudentModal student={null} onClose={() => setShowAdd(false)}
          onSave={(values) => saveStudent(values)} />
      )}
      {editing && (
        <StudentModal student={editing} onClose={() => setEditing(null)}
          onSave={(values) => saveStudent(values, editing)} />
      )}
      {deleting && (
        <DeleteModal student={deleting} deleting={deletePending}
          onCancel={() => setDeleting(null)} onConfirm={() => void deleteStudent()} />
      )}
    </div>
  );
}
