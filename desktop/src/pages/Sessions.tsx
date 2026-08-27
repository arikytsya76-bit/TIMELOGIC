import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pause, Square, Lock, RefreshCw, QrCode, Clock, Users } from 'lucide-react';
import Header from '../components/Header';
import { fetchSessions, createSession, pauseSession, resumeSession, endSession, lockSession, refreshQR } from '../services';
import { useAuth } from '../context/AuthContext';

const STATUS_STYLE: Record<string, string> = {
  ACTIVE:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30',
  SCHEDULED: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30',
  PAUSED:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30',
  LOCKED:    'bg-red-100 text-red-700 dark:bg-red-900/30',
  ENDED:     'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

function Spinner() {
  return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 border-t-transparent" /></div>;
}

function formatOfficeTime(value: string | null | undefined, timezone?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  try {
    return parsed.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true,
      timeZone: timezone || 'Africa/Lagos',
    });
  } catch {
    return parsed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
}

function CountdownTimer({ endTime, currentTime }: { endTime: string | null; currentTime: () => Date | null }) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    if (!endTime) return;
    const tick = () => {
      const now = currentTime();
      if (!now) return;
      const diff = new Date(endTime).getTime() - now.getTime();
      if (diff <= 0) { setRemaining('Expiring...'); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}m ${s.toString().padStart(2, '0')}s`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endTime]);
  return remaining ? <span className="text-xs font-mono text-emerald-600 font-semibold">{remaining} left</span> : null;
}

export default function Sessions() {
  const { currentTime } = useAuth();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('Morning Session');
  const [newDuration, setNewDuration] = useState(30);
  const [newInterval, setNewInterval] = useState(120);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    fetchSessions().then(setSessions).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const act = async (fn: () => Promise<any>) => { await fn(); load(); };

  const handleCreate = async () => {
    if (!newName.trim()) { alert('Session name is required'); return; }
    setCreating(true);
    try {
      await createSession({
        sessionName: newName,
        qrRefreshInterval: newInterval,
        durationMinutes: newDuration,
      });
      setShowCreate(false);
      load();
    } catch (err: any) {
      alert(err?.message ?? 'Failed to create session');
    } finally { setCreating(false); }
  };

  const inputCls = 'w-full border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-main)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500';
  const labelCls = 'block text-xs font-semibold text-[var(--text-muted)] mb-1.5';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Sessions" subtitle="Sessions follow each office opening, late-after, and closing rules"
        action={
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition">
            <Plus size={16} /> Create Session
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">

        {/* Create form */}
        {showCreate && (
          <div className="mb-6 bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] shadow-sm p-5">
            <h3 className="font-bold text-[var(--text-main)] mb-4">New Attendance Session</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className={labelCls}>Session Name</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Duration (minutes)</label>
                <input type="number" value={newDuration} onChange={(e) => setNewDuration(Number(e.target.value))} className={inputCls} min={5} max={120} />
              </div>
              <div>
                <label className={labelCls}>QR Refresh (seconds)</label>
                <input type="number" value={newInterval} onChange={(e) => setNewInterval(Number(e.target.value))} className={inputCls} min={30} max={300} />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleCreate} disabled={creating}
                className="px-6 py-2.5 bg-primary-700 hover:bg-primary-800 text-white text-sm font-bold rounded-xl transition disabled:opacity-60">
                {creating ? 'Creating...' : '▶ Create & Start Session'}
              </button>
              <button onClick={() => setShowCreate(false)}
                className="px-4 py-2.5 border border-[var(--border)] text-[var(--text-main)] text-sm font-semibold rounded-xl hover:bg-[var(--hover-bg)] transition">
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? <Spinner /> : sessions.length === 0 ? (
          <div className="text-center py-20 text-[var(--text-muted)]">
            <QrCode size={48} className="mx-auto mb-4 opacity-30" />
            <p className="font-medium">No sessions yet</p>
            <p className="text-sm mt-1">Click "Create Session" to start an attendance session.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sessions.map((s: any) => (
              <div key={s.id} className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] shadow-sm p-5 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-bold text-[var(--text-main)]">{s.sessionName}</h3>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${STATUS_STYLE[s.status] ?? 'bg-slate-100 text-slate-500'}`}>{s.status}</span>
                      {s.status === 'ACTIVE' && <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                      <span>{s.office?.name ?? 'Office'}</span>
                      <span className="flex items-center gap-1"><Clock size={11} />QR every {s.qrRefreshInterval}s</span>
                      <span className="flex items-center gap-1"><Users size={11} />{s._count?.attendanceRecords ?? 0} checked in</span>
                      {s.status === 'ACTIVE' && s.endTime && <CountdownTimer endTime={s.endTime} currentTime={currentTime} />}
                      {s.endTime && <span>Ends {formatOfficeTime(s.endTime, s.office?.timezone || 'Africa/Lagos')}</span>}
                      {s.office?.openTime && <span>Check-in from {s.office.openTime} until office close at {s.office.closeTime ?? 'closing time'}</span>}
                      {s.office?.closeTime && <span>Checkout after {s.office.closeTime}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap justify-end">
                    {s.status === 'ACTIVE' && <>
                      <button onClick={() => act(() => pauseSession(s.id))} className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-2 rounded-xl transition"><Pause size={13} />Pause</button>
                      <button onClick={() => act(() => refreshQR(s.id))} className="flex items-center gap-1.5 bg-[var(--hover-bg)] hover:bg-[var(--border)] text-[var(--text-main)] text-xs font-semibold px-3 py-2 rounded-xl transition"><RefreshCw size={13} />Refresh QR</button>
                      <button onClick={() => act(() => endSession(s.id))} className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold px-3 py-2 rounded-xl transition"><Square size={13} />End</button>
                    </>}
                    {s.status === 'PAUSED' && <>
                      <button onClick={() => act(() => resumeSession(s.id))} className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-xl transition">▶ Resume</button>
                      <button onClick={() => act(() => endSession(s.id))} className="flex items-center gap-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold px-3 py-2 rounded-xl transition"><Square size={13} />End</button>
                    </>}
                    {(s.status === 'ACTIVE' || s.status === 'PAUSED') && (
                      <button onClick={() => act(() => lockSession(s.id))} className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold px-3 py-2 rounded-xl transition"><Lock size={13} />Lock</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
