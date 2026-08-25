import React, { useEffect, useState, useCallback } from 'react';
import { FileSpreadsheet, FileText, RefreshCw, Download, Users, Clock, CheckCircle, XCircle, AlertTriangle, BarChart3 } from 'lucide-react';
import Header from '../components/Header';
import { API_URL } from '../config';
import { getToken, api, authenticatedFetch } from '../services/api';

function Spinner() {
  return <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-7 w-7 border-2 border-primary-600 border-t-transparent" /></div>;
}

async function downloadAuth(path: string, filename: string) {
  const token = getToken();
  if (!token) { alert('Session expired.'); return; }
  try {
    const res = await authenticatedFetch(`${API_URL}${path}`);
    if (!res.ok) {
      const errorBody = await res.json().catch(() => null);
      throw new Error(errorBody?.message ?? `Export failed (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  } catch (err: any) { alert(`Download failed: ${err?.message}`); }
}

export default function Reports() {
  const [liveStats, setLiveStats] = useState<any>(null);
  const [monthlyData, setMonthlyData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [serverNow, setServerNow] = useState<Date | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [downloading, setDownloading] = useState<'excel' | 'csv' | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    try {
      const [stats, monthly, serverTime] = await Promise.all([
        api.get<any>('/reports/live-stats').then((r) => r.data ?? r).catch(() => null),
        api.get<any>('/reports/monthly').then((r) => r.data).catch(() => null),
        api.get<any>('/reports/server-time').then((r) => r.data?.now ? new Date(r.data.now) : null).catch(() => null),
      ]);
      setLiveStats(stats);
      setMonthlyData(monthly);
      setServerNow(serverTime);
      if (serverTime) setLastRefresh(serverTime);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  const download = async (type: 'excel' | 'csv') => {
    setDownloading(type);
    const now = serverNow;
    if (!now) { alert('Server time is unavailable. Try refreshing before exporting.'); return; }
    const today = new Date(now).toISOString().split('T')[0];
    await downloadAuth(`/reports/export/${type}`, `full-report-${today}.${type === 'excel' ? 'xlsx' : 'csv'}`);
    setDownloading(null);
  };

  const displayRefreshedAt = serverNow
    ? new Intl.DateTimeFormat('en-GB', { timeZone: liveStats?.timezone ?? 'Africa/Lagos', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(serverNow)
    : 'Server time unavailable';

  const statCards = liveStats ? [
    { label: 'Total Employees', value: liveStats.total ?? 0, icon: Users, color: 'text-primary-700', bg: 'bg-primary-100 dark:bg-primary-900/30' },
    { label: 'Present Today', value: liveStats.present ?? 0, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30', sub: `${liveStats.attendanceRate ?? 0}% rate` },
    { label: 'Late Today', value: liveStats.late ?? 0, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' },
    { label: 'Absent Today', value: liveStats.absent ?? 0, icon: XCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30' },
    { label: 'On Leave', value: liveStats.onLeave ?? 0, icon: BarChart3, color: 'text-violet-600', bg: 'bg-violet-100 dark:bg-violet-900/30' },
    { label: 'Open Alerts', value: liveStats.openAlerts ?? 0, icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  ] : [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Reports & Analytics"
        subtitle={`Live data · Last updated ${displayRefreshedAt} WAT`}
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => setAutoRefresh(!autoRefresh)}
              className={`text-xs font-semibold px-3 py-2 rounded-xl transition border ${autoRefresh ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 border-primary-200 dark:border-primary-700' : 'border-[var(--border)] text-[var(--text-muted)] bg-[var(--hover-bg)]'}`}>
              {autoRefresh ? '⬤ Live' : '○ Paused'}
            </button>
            <button onClick={load} className="p-2 rounded-xl border border-[var(--border)] hover:bg-[var(--hover-bg)] text-[var(--text-muted)] transition" title="Refresh now">
              <RefreshCw size={15} />
            </button>
            <button onClick={() => download('excel')} disabled={downloading === 'excel'}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition disabled:opacity-60">
              {downloading === 'excel' ? <RefreshCw size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
              Excel
            </button>
            <button onClick={() => download('csv')} disabled={downloading === 'csv'}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold px-4 py-2 rounded-xl transition disabled:opacity-60">
              {downloading === 'csv' ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={14} />}
              CSV
            </button>
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Live stats grid */}
        {loading ? <Spinner /> : (
          <div className="grid grid-cols-3 gap-4">
            {statCards.map((s) => (
              <div key={s.label} className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] shadow-sm p-4 transition-colors">
                <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center mb-2`}>
                  <s.icon size={18} className={s.color} />
                </div>
                <p className="text-2xl font-black text-[var(--text-main)]">{s.value}</p>
                <p className="text-sm text-[var(--text-muted)]">{s.label}</p>
                {s.sub && <p className="text-xs text-[var(--text-muted)] mt-0.5">{s.sub}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Monthly breakdown */}
        {monthlyData && (
          <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] shadow-sm p-5 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-[var(--text-main)]">
                Monthly Summary — {monthlyData.period ?? new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </h3>
              {monthlyData.period && <span className="text-xs text-[var(--text-muted)]">{monthlyData.period}</span>}
            </div>
            <div className="grid grid-cols-4 gap-4 mb-4">
              {[
                { label: 'Total Present', value: monthlyData.totalPresent ?? 0, color: 'text-emerald-600' },
                { label: 'Total Late', value: monthlyData.totalLate ?? 0, color: 'text-amber-600' },
                { label: 'Total Absent', value: monthlyData.totalAbsent ?? 0, color: 'text-red-500' },
                { label: 'Avg Work Hours', value: monthlyData.avgWorkHours ? `${monthlyData.avgWorkHours}h` : '—', color: 'text-primary-700' },
              ].map((s) => (
                <div key={s.label} className="bg-[var(--hover-bg)] rounded-xl p-3 text-center">
                  <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            {monthlyData.departmentStats && monthlyData.departmentStats.length > 0 && (
              <div className="space-y-2 mt-4">
                <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Department Performance</p>
                {monthlyData.departmentStats.map((d: any) => (
                  <div key={d.department} className="flex items-center gap-3">
                    <span className="text-sm text-[var(--text-muted)] w-28 flex-shrink-0 truncate">{d.department}</span>
                    <div className="flex-1 h-3 bg-[var(--hover-bg)] rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full" style={{ width: `${d.attendanceRate ?? 0}%` }} />
                    </div>
                    <span className="text-sm font-bold text-[var(--text-main)] w-10 text-right">{d.attendanceRate ?? 0}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Export info */}
        <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] shadow-sm p-5 transition-colors">
          <h3 className="font-bold text-[var(--text-main)] mb-3">Full Database Export</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">Downloads include: <strong>all attendance records</strong> (check-in, check-out, status), <strong>all employees</strong>, <strong>leave requests</strong>, <strong>break records</strong>, and <strong>fraud alerts</strong>.</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { type: 'excel' as const, label: 'Excel (Multi-Sheet)', sub: 'One sheet per data type', icon: FileSpreadsheet, color: 'text-emerald-600' },
              { type: 'csv'   as const, label: 'CSV (All Records)',   sub: 'Flat file — all attendance data', icon: FileText,       color: 'text-slate-600' },
            ].map((e) => (
              <button key={e.type} onClick={() => download(e.type)} disabled={downloading === e.type}
                className="flex items-center gap-3 p-4 border border-[var(--border)] bg-[var(--hover-bg)] rounded-xl text-left transition hover:bg-[var(--border)] disabled:opacity-60 group">
                <div className="w-9 h-9 rounded-xl bg-[var(--card-bg)] flex items-center justify-center flex-shrink-0">
                  {downloading === e.type ? <RefreshCw size={16} className={`${e.color} animate-spin`} /> : <e.icon size={16} className={e.color} />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-main)]">{e.label}</p>
                  <p className="text-xs text-[var(--text-muted)]">{downloading === e.type ? 'Generating...' : e.sub}</p>
                </div>
                {downloading !== e.type && <Download size={13} className="ml-auto text-[var(--text-muted)]" />}
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
