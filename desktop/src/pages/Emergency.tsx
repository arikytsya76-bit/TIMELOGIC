import React, { useState, useEffect } from 'react';
import { StopCircle, Lock, RefreshCw, RotateCcw, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import Header from '../components/Header';
import { stopAllAttendance, lockSystem, invalidateQR, revertEmergency, fetchLiveStats } from '../services';
import { useAuth } from '../context/AuthContext';

interface ActionLog {
  id: string;
  action: string;
  label: string;
  reason: string;
  by: string;
  at: string;
  isReverted: boolean;
  controlId?: string;
  status: 'success' | 'pending' | 'failed';
}

const ACTIONS = [
  {
    key: 'stop',
    label: 'Stop All Attendance',
    icon: StopCircle,
    description: 'Lock all active and paused sessions for this office immediately. Employees currently in the building cannot check in.',
    btnClass: 'bg-red-600 hover:bg-red-700 text-white',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600',
    severity: 'high',
  },
  {
    key: 'qr',
    label: 'Invalidate All QR Codes',
    icon: RefreshCw,
    description: 'Rotate all QR tokens immediately. All employees must wait for new QR codes. Use if tokens are suspected to be compromised.',
    btnClass: 'bg-amber-600 hover:bg-amber-700 text-white',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600',
    severity: 'medium',
  },
  {
    key: 'lock',
    label: 'Lock Entire System',
    icon: Lock,
    description: 'Lock all sessions across the ENTIRE organization. Requires Super Admin permission. Cannot be auto-reverted.',
    btnClass: 'bg-red-900 hover:bg-red-950 text-white',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-900',
    severity: 'critical',
  },
];

export default function Emergency() {
  const { user, currentTime, organizationTimezone } = useAuth();
  const [log, setLog] = useState<ActionLog[]>([]);
  const [modal, setModal] = useState<typeof ACTIONS[0] | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [liveStats, setLiveStats] = useState<any>(null);
  const [revertBusy, setRevertBusy] = useState<string | null>(null);
  const visibleActions = ACTIONS.filter((action) => action.key !== 'lock' || user?.role === 'SUPER_ADMIN');

  // Refresh live stats every 5 seconds
  useEffect(() => {
    const load = () => fetchLiveStats().then(setLiveStats).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const trigger = async () => {
    if (!reason.trim() || !modal) return;
    setBusy(true);
    const newEntry: ActionLog = {
      id: Date.now().toString(),
      action: modal.key.toUpperCase(),
      label: modal.label,
      reason,
      by: `${user?.firstName} ${user?.lastName}`,
      at: currentTime()?.toLocaleString('en-GB', { timeZone: organizationTimezone }) ?? 'Server time unavailable',
      isReverted: false,
      status: 'pending',
    };
    setLog((p) => [newEntry, ...p]);
    setModal(null);
    setReason('');

    try {
      let res: any;
      if (modal.key === 'stop') {
        // Pass empty string — backend auto-resolves the office from the admin's org
        res = await stopAllAttendance('', reason);
      } else if (modal.key === 'qr') {
        res = await invalidateQR('', reason);
      } else if (modal.key === 'lock') {
        res = await lockSystem(reason);
      }
      const controlId = res?.data?.id ?? res?.id;
      setLog((p) => p.map((e) => e.id === newEntry.id ? { ...e, status: 'success', controlId } : e));
      // Refresh live stats after action
      fetchLiveStats().then(setLiveStats).catch(() => {});
    } catch (err: any) {
      setLog((p) => p.map((e) => e.id === newEntry.id ? { ...e, status: 'failed' } : e));
      alert(`Action failed: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const revert = async (entry: ActionLog) => {
    if (!entry.controlId) { alert('No control ID — cannot revert this action.'); return; }
    setRevertBusy(entry.id);
    try {
      await revertEmergency(entry.controlId);
      setLog((p) => p.map((e) => e.id === entry.id ? { ...e, isReverted: true } : e));
      fetchLiveStats().then(setLiveStats).catch(() => {});
    } catch (err: any) {
      alert(`Revert failed: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setRevertBusy(null);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Emergency Controls" subtitle="Real-time actions affecting all active sessions" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Live status banner */}
        <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] shadow-sm p-4 flex items-center gap-6 transition-colors">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full animate-pulse ${(liveStats?.activeSessions ?? 0) > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span className="text-sm font-semibold text-[var(--text-main)]">Live Status</span>
          </div>
          {[
            { label: 'Active Sessions', value: liveStats?.activeSessions ?? 0 },
            { label: 'Checked In', value: liveStats?.present ?? 0 },
            { label: 'Open Alerts', value: liveStats?.openAlerts ?? 0 },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-xl font-black text-[var(--text-main)]">{s.value}</p>
              <p className="text-xs text-[var(--text-muted)]">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Warning banner */}
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">
            All emergency actions are <strong>real-time</strong> — they take effect immediately. Actions are permanently logged. Revert is available for session-locking actions.
          </p>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-4">
          {visibleActions.map((a) => (
            <div key={a.key} className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] shadow-sm p-5 transition-colors">
              <div className="flex items-start gap-3 mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${a.iconBg}`}>
                  <a.icon size={20} className={a.iconColor} />
                </div>
                <div>
                  <h3 className="font-bold text-[var(--text-main)]">{a.label}</h3>
                  <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{a.description}</p>
                </div>
              </div>
              <button
                onClick={() => { setModal(a); setReason(''); }}
                disabled={busy}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition disabled:opacity-40 ${a.btnClass}`}
              >
                <a.icon size={15} /> Trigger
              </button>
            </div>
          ))}
        </div>

        {/* Action History */}
        <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden transition-colors">
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <h2 className="font-bold text-[var(--text-main)]">Action History (this session)</h2>
          </div>
          {log.length === 0 ? (
            <div className="text-center py-10 text-sm text-[var(--text-muted)]">No emergency actions taken in this session</div>
          ) : log.map((h) => (
            <div key={h.id} className="px-5 py-4 flex items-center justify-between border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                {h.status === 'pending' && <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-600 border-t-transparent flex-shrink-0" />}
                {h.status === 'success' && <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />}
                {h.status === 'failed'  && <XCircle size={16} className="text-red-500 flex-shrink-0" />}
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${h.isReverted ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' : h.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-slate-100 dark:bg-slate-700 text-[var(--text-main)]'}`}>
                      {h.isReverted ? 'REVERTED' : h.action}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-[var(--text-main)]">{h.reason}</p>
                  <p className="text-xs text-[var(--text-muted)]">By {h.by} · {h.at}</p>
                </div>
              </div>
              {!h.isReverted && h.status === 'success' && h.controlId && (
                <button
                  onClick={() => revert(h)}
                  disabled={revertBusy === h.id}
                  className="flex items-center gap-1.5 border border-[var(--border)] text-[var(--text-main)] hover:bg-[var(--hover-bg)] text-xs font-semibold px-3 py-2 rounded-xl transition disabled:opacity-50"
                >
                  {revertBusy === h.id ? <RefreshCw size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                  Revert
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Confirm Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--card-bg)] rounded-3xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${modal.iconBg}`}>
                <modal.icon size={20} className={modal.iconColor} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--text-main)]">{modal.label}</h2>
                <p className="text-xs text-[var(--text-muted)]">This action takes effect immediately</p>
              </div>
            </div>
            <p className="text-sm text-[var(--text-muted)] mb-4 leading-relaxed">{modal.description}</p>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-[var(--text-main)] mb-1.5">Reason (required)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Describe the reason for this emergency action..."
                className="w-full border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-main)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModal(null)}
                className="flex-1 border border-[var(--border)] text-[var(--text-main)] font-semibold py-2.5 rounded-xl hover:bg-[var(--hover-bg)] transition">
                Cancel
              </button>
              <button
                onClick={trigger}
                disabled={!reason.trim() || busy}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl transition disabled:opacity-40"
              >
                {busy ? 'Processing...' : 'Confirm — Execute Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
