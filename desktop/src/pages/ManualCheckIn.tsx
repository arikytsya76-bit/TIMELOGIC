import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, CalendarClock, CheckCircle2, Clock3, LogIn, LogOut,
  LockKeyhole, RefreshCw, Search, UserCheck, X,
} from 'lucide-react';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import {
  fetchManualAttendance,
  manualEmployeeCheckIn,
  manualEmployeeCheckOut,
} from '../services';
import type {
  ManualAttendanceEmployee,
  ManualAttendanceResult,
  ManualAttendanceSession,
} from '../types/api';

type PendingAction = { kind: 'check-in' | 'check-out'; employee: ManualAttendanceEmployee };
type ResultNotice = {
  employeeName: string;
  kind: 'check-in' | 'check-out';
  status?: string | null;
  penalty?: number | null;
  time?: string | null;
};

function formatTime(value?: string | null, timezone?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  try {
    return parsed.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
      ...(timezone ? { timeZone: timezone } : {}),
    });
  } catch {
    return parsed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  }
}

function sessionOffice(session: ManualAttendanceSession) {
  if (typeof session.office === 'string') return session.office;
  return session.office?.name ?? session.officeName ?? 'Office';
}

function sessionLabel(session: ManualAttendanceSession) {
  return `${session.sessionName ?? 'Attendance session'} · ${sessionOffice(session)}`;
}

function departmentName(employee: ManualAttendanceEmployee) {
  if (typeof employee.department === 'string') return employee.department;
  return employee.department?.name ?? 'No department';
}

function resultRecord(result: ManualAttendanceResult) {
  return result.record ?? result.attendance;
}

async function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load the camera photo.'));
    image.src = dataUrl;
  });
}

async function buildFaceSignatureFromDataUrl(dataUrl: string): Promise<number[]> {
  const image = await loadImageFromDataUrl(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Camera capture could not be processed.');
  context.drawImage(image, 0, 0, 32, 32);
  const pixels = context.getImageData(0, 0, 32, 32).data;
  const values: number[] = [];

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    values.push(Number(brightness.toFixed(4)));
  }

  return values;
}

async function openCameraCapture(): Promise<number[]> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('This desktop app does not have camera access enabled.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });

  const video = document.createElement('video');
  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;
  await video.play();

  const overlay = document.createElement('div');
  overlay.innerHTML = `
    <div style="position:fixed; inset:0; background:rgba(0,0,0,0.82); display:flex; align-items:center; justify-content:center; z-index:999999; font-family:Arial,sans-serif;">
      <div style="background:#111827; border:1px solid rgba(255,255,255,0.1); border-radius:22px; padding:24px; width:min(90vw, 520px); text-align:center; color:#fff; box-shadow:0 20px 60px rgba(0,0,0,0.6);">
        <div style="font-size:13px; letter-spacing:0.12em; text-transform:uppercase; color:#cbd5e1; margin-bottom:12px;">Verify identity</div>
        <div id="countdown" style="font-size:54px; font-weight:700; line-height:1; margin:14px 0 18px; color:#f8fafc;">5</div>
        <video id="camera-video" autoplay playsinline muted style="width:100%; max-width:420px; border-radius:16px; background:#000; border:1px solid rgba(255,255,255,0.08); display:block; margin:0 auto 18px;"></video>
        <button id="cancel-btn" style="border:1px solid rgba(255,255,255,0.18); background:transparent; color:#fff; border-radius:10px; padding:10px 18px; font-weight:600; cursor:pointer;">Cancel</button>
      </div>
    </div>
  `;

  const cancelButton = overlay.querySelector('#cancel-btn') as HTMLButtonElement;
  const countdownEl = overlay.querySelector('#countdown') as HTMLElement;
  const cameraVideo = overlay.querySelector('#camera-video') as HTMLVideoElement;
  cameraVideo.srcObject = stream;

  const cleanup = () => {
    stream.getTracks().forEach((track) => track.stop());
    overlay.remove();
  };

  let cancelled = false;
  cancelButton.addEventListener('click', () => {
    cancelled = true;
    cleanup();
  }, { once: true });

  document.body.appendChild(overlay);

  if (cancelled) {
    throw new Error('Camera verification was cancelled.');
  }

  try {
    for (let seconds = 5; seconds >= 1; seconds -= 1) {
      countdownEl.textContent = String(seconds);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not process the camera photo.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    cleanup();
    return await buildFaceSignatureFromDataUrl(dataUrl);
  } catch (error) {
    cleanup();
    throw error;
  }
}

export default function ManualCheckIn() {
  const { organization } = useAuth();
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof fetchManualAttendance>> | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [password, setPassword] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ResultNotice | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (quiet = false) => {
    if (!organization?.allowManualCheckIn) {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError('');
    try {
      const next = await fetchManualAttendance({
        sessionId: selectedSessionId || undefined,
        search: debouncedSearch || undefined,
      });
      setDashboard(next);
      if (!selectedSessionId && next.selectedSession?.id) setSelectedSessionId(next.selectedSession.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the manual attendance station.');
    } finally {
      setLoading(false);
    }
  }, [organization?.allowManualCheckIn, selectedSessionId, debouncedSearch]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const activeSessionId = selectedSessionId || dashboard?.selectedSession?.id || '';
  const selectedSession = useMemo(
    () => dashboard?.activeSessions.find((session) => session.id === activeSessionId) ?? dashboard?.selectedSession ?? null,
    [dashboard, activeSessionId],
  );

  const closeConfirmation = () => {
    if (submitting) return;
    setPending(null);
    setPassword('');
    setConfirmError('');
  };

  const confirmAction = async () => {
    if (!pending || (pending.kind === 'check-in' && !activeSessionId)) return;
    if (!password) {
      setConfirmError('The employee must enter their own password to confirm this action.');
      return;
    }
    setSubmitting(true);
    setConfirmError('');
    try {
      const body = { employeeId: pending.employee.id, sessionId: activeSessionId, password };
      const faceSignature = pending.kind === 'check-in' ? await openCameraCapture() : undefined;
      const response = pending.kind === 'check-in'
        ? await manualEmployeeCheckIn({ ...body, faceSignature })
        : await manualEmployeeCheckOut({
            employeeId: pending.employee.id,
            sessionId: pending.employee.attendance?.sessionId || undefined,
            password,
          });
      const record = resultRecord(response);
      setResult({
        employeeName: `${pending.employee.firstName} ${pending.employee.lastName}`,
        kind: pending.kind,
        status: response.status ?? record?.status,
        penalty: response.penalty ?? record?.penalty,
        time: pending.kind === 'check-in'
          ? response.clockInTime ?? record?.clockInTime ?? response.serverTime
          : response.clockOutTime ?? record?.clockOutTime ?? response.serverTime,
      });
      setPending(null);
      setPassword('');
      await load(true);
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'The attendance action failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!organization?.allowManualCheckIn) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <Header title="Manual Check-In" subtitle="Administrator-assisted employee attendance" />
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="max-w-lg text-center bg-[var(--card-bg)] border border-[var(--border)] rounded-3xl p-10 shadow-sm">
            <UserCheck size={42} className="mx-auto text-[var(--text-muted)] opacity-40 mb-4" />
            <h2 className="text-lg font-bold text-[var(--text-main)]">Manual check-in is disabled</h2>
            <p className="text-sm text-[var(--text-muted)] mt-2">A Super Admin must enable manual employee attendance for this organization.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Manual Check-In"
        subtitle="Secure administrator-assisted attendance using server time"
        action={(
          <button onClick={() => void load()} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--hover-bg)] disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh
          </button>
        )}
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {result && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4">
            <CheckCircle2 size={19} className="text-emerald-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                {result.employeeName} checked {result.kind === 'check-in' ? 'in' : 'out'} successfully
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                <span>Server time: {formatTime(result.time, selectedSession && typeof selectedSession.office !== 'string' ? selectedSession.office?.timezone : dashboard?.organization?.timezone)}</span>
                {result.status && <span>Status: <b>{result.status.replace(/_/g, ' ')}</b></span>}
                {result.penalty != null && <span>Penalty: <b>{result.penalty}</b></span>}
              </div>
            </div>
            <button onClick={() => setResult(null)} className="text-emerald-700"><X size={15} /></button>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-400">
            <AlertCircle size={17} />{error}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <CalendarClock size={17} className="text-primary-600" />
              <h2 className="font-bold text-[var(--text-main)]">Active attendance session</h2>
            </div>
            {dashboard?.activeSessions?.length ? (
              <select value={activeSessionId} onChange={(event) => setSelectedSessionId(event.target.value)}
                className="w-full border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-main)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                {dashboard.activeSessions.map((session) => <option key={session.id} value={session.id}>{sessionLabel(session)}</option>)}
              </select>
            ) : (
              <p className="text-sm text-amber-700 dark:text-amber-400">No active session is available. Start a session before checking in an employee.</p>
            )}
            {selectedSession && (
              <p className="text-xs text-[var(--text-muted)] mt-2">
                {sessionOffice(selectedSession)} · {formatTime(selectedSession.startTime, typeof selectedSession.office !== 'string' ? selectedSession.office?.timezone : dashboard?.organization?.timezone)}–{formatTime(selectedSession.endTime, typeof selectedSession.office !== 'string' ? selectedSession.office?.timezone : dashboard?.organization?.timezone)}
              </p>
            )}
          </div>

          <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-5">
            <div className="flex items-center gap-2 text-[var(--text-muted)]"><Clock3 size={16} /><span className="text-xs font-bold uppercase tracking-wide">Backend server time</span></div>
            <p className="text-2xl font-black text-[var(--text-main)] mt-2">{formatTime(dashboard?.serverTime, dashboard?.organization?.timezone)}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">{dashboard?.organization?.timezone ?? organization.timezone ?? 'Server timezone'}</p>
          </div>
        </div>

        {dashboard && !dashboard.enabled ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-5 text-sm text-amber-800 dark:text-amber-300">
            The backend reports that manual attendance is disabled for this organization.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative max-w-md">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee name or code..."
                className="w-full pl-9 pr-4 py-2.5 border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-main)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>

            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
              {loading && !dashboard ? (
                <div className="h-64 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 border-t-transparent" /></div>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="bg-[var(--hover-bg)] border-b border-[var(--border)]">
                    {['Employee', 'Department', 'Method', 'Clock In', 'Clock Out', 'Status', 'Action'].map((heading) => (
                      <th key={heading} className="text-left text-xs font-semibold text-[var(--text-muted)] px-4 py-3">{heading}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {(dashboard?.employees ?? []).map((employee) => {
                      const attendance = employee.attendance;
                      const hasCheckedIn = Boolean(attendance?.clockInTime);
                      const hasCheckedOut = Boolean(attendance?.clockOutTime);
                      return (
                        <tr key={employee.id} className="hover:bg-[var(--hover-bg)] transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-xs font-bold text-primary-700">
                                {employee.firstName?.[0]}{employee.lastName?.[0]}
                              </div>
                              <div><p className="font-semibold text-[var(--text-main)]">{employee.firstName} {employee.lastName}</p><p className="text-xs text-[var(--text-muted)]">{employee.employeeCode ?? 'No code'}</p></div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[var(--text-muted)]">{departmentName(employee)}</td>
                          <td className="px-4 py-3"><span className="text-[11px] font-bold rounded-full px-2 py-1 bg-primary-100 text-primary-700 dark:bg-primary-900/30">{employee.checkInMethod}</span></td>
                          <td className="px-4 py-3 font-medium text-[var(--text-main)]">{formatTime(attendance?.clockInTime, attendance?.session?.office?.timezone ?? dashboard?.organization?.timezone)}</td>
                          <td className="px-4 py-3 font-medium text-[var(--text-main)]">{formatTime(attendance?.clockOutTime, attendance?.session?.office?.timezone ?? dashboard?.organization?.timezone)}</td>
                          <td className="px-4 py-3"><span className="text-xs font-bold text-[var(--text-muted)]">{attendance?.status?.replace(/_/g, ' ') ?? 'NOT CHECKED IN'}</span></td>
                          <td className="px-4 py-3">
                            {!hasCheckedIn ? (
                              <button disabled={!activeSessionId} onClick={() => setPending({ kind: 'check-in', employee })}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-700 hover:bg-primary-800 text-white text-xs font-bold px-3 py-2 disabled:opacity-40">
                                <LogIn size={13} />Check In
                              </button>
                            ) : !hasCheckedOut ? (
                              <button onClick={() => setPending({ kind: 'check-out', employee })}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3 py-2 disabled:opacity-40">
                                <LogOut size={13} />Check Out
                              </button>
                            ) : <span className="text-xs font-semibold text-emerald-600">Completed</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {!loading && (dashboard?.employees?.length ?? 0) === 0 && (
                <div className="text-center py-14 text-sm text-[var(--text-muted)]">No manual-enabled employees match this search.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center">
          <div className="w-full max-w-md bg-[var(--card-bg)] border border-[var(--border)] rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border)]">
              <div className="flex items-center gap-2"><LockKeyhole size={18} className="text-primary-600" /><h2 className="font-bold text-[var(--text-main)]">Employee confirmation</h2></div>
              <button onClick={closeConfirmation} className="text-[var(--text-muted)]"><X size={19} /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-[var(--text-muted)]">
                <b className="text-[var(--text-main)]">{pending.employee.firstName} {pending.employee.lastName}</b> must enter their own account password to check {pending.kind === 'check-in' ? 'in' : 'out'}. The backend uses server time and records the signed-in administrator as the operator.
              </p>
              {confirmError && <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">{confirmError}</div>}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5">Employee password</label>
                <input autoFocus type="password" autoComplete="current-password" value={password}
                  onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void confirmAction(); }}
                  className="w-full border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-main)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button onClick={closeConfirmation} disabled={submitting} className="px-4 py-2 border border-[var(--border)] rounded-xl text-sm font-semibold text-[var(--text-main)]">Cancel</button>
              <button onClick={() => void confirmAction()} disabled={submitting || !password}
                className="px-5 py-2 bg-primary-700 hover:bg-primary-800 text-white rounded-xl text-sm font-bold disabled:opacity-50">
                {submitting ? 'Authorizing...' : `Confirm ${pending.kind === 'check-in' ? 'Check In' : 'Check Out'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
