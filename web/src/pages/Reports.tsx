import React, { useEffect, useState, useCallback } from 'react';
import { FileSpreadsheet, FileText, RefreshCw, Download, Users, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
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
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  } catch (err: any) { alert(`Download failed: ${err?.message}`); }
}

export default function Reports() {
  const [sysReport, setSysReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [serverNow, setServerNow] = useState<Date | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [downloading, setDownloading] = useState<'excel' | 'csv' | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    try {
      const [reportRes, serverRes] = await Promise.all([
        api.get<any>('/super/reports'),
        api.get<any>('/reports/server-time').catch(() => null),
      ]);
      setSysReport(reportRes.data);
      if (serverRes?.data?.now) setServerNow(new Date(serverRes.data.now));
      setLastRefresh(serverRes?.data?.now ? new Date(serverRes.data.now) : new Date());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  const download = async (type: 'excel' | 'csv') => {
    setDownloading(type);
    const now = serverNow ?? new Date();
    const today = new Date(now).toISOString().split('T')[0];
    await downloadAuth(`/reports/export/${type}`, `full-report-${today}.${type === 'excel' ? 'xlsx' : 'csv'}`);
    setDownloading(null);
  };

  const displayRefreshedAt = serverNow
    ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(serverNow)
    : lastRefresh.toLocaleTimeString();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="System Reports"
        subtitle={`Live data · Updated ${displayRefreshedAt} WAT`}
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => setAutoRefresh(!autoRefresh)}
              className={`text-xs font-semibold px-3 py-2 rounded-xl transition border ${autoRefresh ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 border-primary-200 dark:border-primary-700' : 'border-[var(--border)] text-[var(--text-muted)] bg-[var(--hover-bg)]'}`}>
              {autoRefresh ? '⬤ Live' : '○ Paused'}
            </button>
            <button onClick={load} className="p-2 rounded-xl border border-[var(--border)] hover:bg-[var(--hover-bg)] text-[var(--text-muted)] transition"><RefreshCw size={15} /></button>
            <button onClick={() => download('excel')} disabled={downloading === 'excel'}
              className="flex-shrink-0 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-3 sm:px-4 py-2 rounded-xl transition disabled:opacity-60">
              {downloading === 'excel' ? <RefreshCw size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} <span className="hidden sm:inline">Excel</span>
            </button>
            <button onClick={() => download('csv')} disabled={downloading === 'csv'}
              className="flex-shrink-0 flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold px-3 sm:px-4 py-2 rounded-xl transition disabled:opacity-60">
              {downloading === 'csv' ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={14} />} <span className="hidden sm:inline">CSV</span>
            </button>
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">

        {loading ? <Spinner /> : sysReport ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Organizations', value: sysReport.totalOrgs ?? 0, icon: CheckCircle, color: 'text-primary-700', bg: 'bg-primary-100 dark:bg-primary-900/30' },
                { label: 'Active Employees', value: sysReport.totalEmployees ?? 0, icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
                { label: 'Checked In Today', value: sysReport.presentToday ?? 0, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
                { label: 'Late Today', value: sysReport.lateToday ?? 0, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' },
                { label: 'Total Admins', value: sysReport.totalAdmins ?? 0, icon: Users, color: 'text-violet-600', bg: 'bg-violet-100 dark:bg-violet-900/30' },
                { label: 'Open Fraud Alerts', value: sysReport.openAlerts ?? 0, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' },
                { label: 'Pending Leaves', value: sysReport.pendingLeaves ?? 0, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900/30' },
                { label: 'Report Period', value: sysReport.period ?? '—', icon: CheckCircle, color: 'text-slate-600', bg: 'bg-slate-100 dark:bg-slate-800' },
              ].map((s) => (
                <div key={s.label} className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] shadow-sm p-4 transition-colors">
                  <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center mb-2`}><s.icon size={18} className={s.color} /></div>
                  <p className="text-xl font-black text-[var(--text-main)]">{s.value}</p>
                  <p className="text-sm text-[var(--text-muted)]">{s.label}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-16 text-[var(--text-muted)]">No report data. Add organizations and create sessions first.</div>
        )}

        <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] shadow-sm p-5 transition-colors">
          <h3 className="font-bold text-[var(--text-main)] mb-2">Full Database Export</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">Includes <strong>all attendance records</strong>, employees, leave requests, break records, and fraud alerts across all organizations.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { type: 'excel' as const, label: 'Excel (Multi-Sheet)', sub: 'One tab per data category', icon: FileSpreadsheet, color: 'text-emerald-600' },
              { type: 'csv'   as const, label: 'CSV (All Records)',   sub: 'Flat file — complete data', icon: FileText,       color: 'text-slate-600' },
            ].map((e) => (
              <button key={e.type} onClick={() => download(e.type)} disabled={downloading === e.type}
                className="flex items-center gap-3 p-4 border border-[var(--border)] bg-[var(--hover-bg)] rounded-xl text-left transition hover:bg-[var(--border)] disabled:opacity-60">
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
