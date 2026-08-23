import React, { useEffect, useState } from 'react';
import { X, ChevronsUpDown, Eye } from 'lucide-react';
import PageShell from '../components/PageShell';
import { api } from '../services/api';
import { downloadCSV } from '../utils/csv';

const SEV_BADGE: Record<string, { bg: string; text: string; dot: string }> = {
  HIGH:   { bg: '#fef2f2', text: '#dc2626', dot: '#ef4444' },
  MEDIUM: { bg: '#fff7ed', text: '#ea580c', dot: '#fb923c' },
  LOW:    { bg: '#fefce8', text: '#a16207', dot: '#eab308' },
};
const STATUS_BADGE: Record<string, { bg: string; text: string; dot: string }> = {
  NEW:           { bg: '#fef2f2', text: '#dc2626', dot: '#ef4444' },
  INVESTIGATING: { bg: '#fff7ed', text: '#ea580c', dot: '#fb923c' },
  RESOLVED:      { bg: '#dcfce7', text: '#15803d', dot: '#16a34a' },
  DISMISSED:     { bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' },
};
const AVATAR_COLORS = ['#15803d','#0891b2','#7c3aed','#b45309','#be185d','#dc2626'];

const TH = ({ children }: { children: React.ReactNode }) => (
  <th className="text-left text-xs font-semibold text-[var(--text-muted)] px-4 py-3 whitespace-nowrap">
    <div className="flex items-center gap-1">{children}<ChevronsUpDown size={11} className="opacity-40"/></div>
  </th>
);

const FRAUD_EXPLAIN: Record<string, string> = {
  REPEATED_FAILED_SCANS: 'This employee made many failed check-in attempts in a short time — possible tampering or a stolen/forced code.',
  PROXY_ATTENDANCE:      'The same network/IP was used by multiple employees at once — someone may be checking in on behalf of others (buddy-punching).',
  SCREENSHOT_ATTEMPT:    'A screenshot was captured during attendance — the employee may be trying to reuse or share a check-in code.',
  DEVICE_CONFLICT:       'A device already registered to another employee was used — possible shared-device fraud.',
  WIFI_MISMATCH:         'A check-in was attempted off the company Wi-Fi network.',
};

function DetailModal({ alert, onClose, onResolve, onDismiss, onInvestigate }: { alert: any; onClose: () => void; onResolve: () => void; onDismiss: () => void; onInvestigate: () => void }) {
  const sev = SEV_BADGE[alert.severity] ?? SEV_BADGE.MEDIUM;
  const sta = STATUS_BADGE[alert.status] ?? STATUS_BADGE.NEW;
  const fmt = (d: string) => d ? new Date(d).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
  const name = `${alert.employee?.firstName ?? '—'} ${alert.employee?.lastName ?? ''}`.trim();
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--card-bg)] rounded-3xl w-full max-w-lg shadow-2xl border border-[var(--border)] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: sev.bg }}>
              <span className="text-sm font-black" style={{ color: sev.text }}>!</span>
            </div>
            <div>
              <h2 className="font-bold text-[var(--text-main)]">{alert.fraudType?.replace(/_/g,' ')}</h2>
              <p className="text-xs text-[var(--text-muted)]">ID: {alert.id?.slice(0,8)}…</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)]"><X size={18}/></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[['Employee', name], ['Organization', alert.employee?.organization?.name??'—'], ['Severity', alert.severity], ['Status', alert.status], ['Detected', fmt(alert.createdAt)], ['Session', alert.session?.sessionName??'—']].map(([l,v]) => (
              <div key={String(l)} className="bg-[var(--hover-bg)] rounded-xl p-3">
                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide mb-0.5">{l}</p>
                <p className="text-sm font-semibold text-[var(--text-main)]">{String(v)}</p>
              </div>
            ))}
          </div>
          {/* What the fraud alert was about — live, human-readable */}
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 border border-amber-200 dark:border-amber-800">
            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-1">What happened</p>
            <p className="text-sm text-[var(--text-main)] font-medium">{FRAUD_EXPLAIN[alert.fraudType] ?? alert.description ?? 'Suspicious attendance activity detected.'}</p>
          </div>
          <div className="bg-[var(--hover-bg)] rounded-xl p-3">
            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wide mb-1">System Detail</p>
            <p className="text-sm text-[var(--text-main)]">{alert.description ?? '—'}</p>
          </div>
          {alert.resolution && (
            <div className="bg-primary-50 rounded-xl p-3 border border-primary-100">
              <p className="text-[10px] font-bold text-primary-700 uppercase tracking-wide mb-1">Resolution</p>
              <p className="text-sm text-[var(--text-main)]">{alert.resolution}</p>
            </div>
          )}
        </div>
        <div className="flex gap-2 px-6 pb-5">
          {(alert.status === 'NEW' || alert.status === 'INVESTIGATING') ? (
            <>
              {alert.status === 'NEW' && (
                <button onClick={onInvestigate} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold py-2.5 rounded-xl transition-colors">Investigate</button>
              )}
              <button onClick={onResolve} className="flex-1 bg-primary-700 hover:bg-primary-800 text-white text-sm font-bold py-2.5 rounded-xl transition-colors">Resolve</button>
              <button onClick={onDismiss} className="flex-1 border border-[var(--border)] hover:bg-[var(--hover-bg)] text-[var(--text-main)] text-sm font-semibold py-2.5 rounded-xl transition-colors">Dismiss</button>
            </>
          ) : (
            <button onClick={onClose} className="flex-1 border border-[var(--border)] hover:bg-[var(--hover-bg)] text-[var(--text-main)] text-sm font-semibold py-2.5 rounded-xl transition-colors">Close</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FraudAlerts() {
  const [alerts,   setAlerts]   = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [tab,      setTab]      = useState(0);
  const [selected, setSelected] = useState<any>(null);

  const load = () => {
    setLoading(true);
    api.get<any>('/fraud?limit=100').then((r) => setAlerts(r.data ?? [])).catch(() => setAlerts([])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, []);

  const allA     = alerts;
  const newA     = alerts.filter((a) => a.status === 'NEW');
  const invA     = alerts.filter((a) => a.status === 'INVESTIGATING');
  const resolvedA = alerts.filter((a) => a.status === 'RESOLVED');

  const tabAlerts = tab === 0 ? allA : tab === 1 ? newA : tab === 2 ? invA : resolvedA;
  const filtered = tabAlerts.filter((a) => {
    const q = search.toLowerCase();
    return !q || `${a.employee?.firstName??''} ${a.employee?.lastName??''} ${a.fraudType??''} ${a.employee?.organization?.name??''}`.toLowerCase().includes(q);
  });

  const handleAction = async (alertId: string, action: 'resolve' | 'dismiss' | 'escalate') => {
    try {
      if (action === 'escalate') {
        await api.put<any>(`/fraud/${alertId}/escalate`, {});
      } else if (action === 'dismiss') {
        await api.put<any>(`/fraud/${alertId}/dismiss`, { reason: 'Dismissed by super admin' });
      } else {
        await api.put<any>(`/fraud/${alertId}/resolve`, { resolution: 'Reviewed by super admin' });
      }
      setSelected(null); load();
    } catch {}
  };

  const fmt = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—';

  return (
    <>
      <PageShell
        breadcrumb={['Super Admin', 'Fraud Alerts']}
        title="Fraud Alerts"
        tabs={[
          { label: 'All Alerts',   count: allA.length },
          { label: 'New',          count: newA.length },
          { label: 'Investigating',count: invA.length },
          { label: 'Resolved',     count: resolvedA.length },
        ]}
        activeTab={tab} onTabChange={setTab}
        search={search} onSearch={setSearch}
        searchPlaceholder="Search alerts…"
        onExport={() => downloadCSV('fraud-alerts', filtered.map((a: any) => ({
          Employee: `${a.employee?.firstName ?? ''} ${a.employee?.lastName ?? ''}`.trim(),
          Organization: a.employee?.organization?.name ?? '',
          'Fraud Type': a.fraudType?.replace(/_/g, ' '), Severity: a.severity, Status: a.status,
          Detected: a.createdAt ? new Date(a.createdAt).toLocaleString('en-GB') : '',
          Description: a.description ?? '',
        })))}
      >
        <div className="overflow-y-auto h-full">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--hover-bg)] border-b border-[var(--border)]">
              <tr>
                <TH>ID</TH>
                <TH>Employee</TH>
                <TH>Fraud Type</TH>
                <TH>Organization</TH>
                <TH>Severity</TH>
                <TH>Detected</TH>
                <th className="text-left text-xs font-semibold text-[var(--text-muted)] px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-[var(--text-muted)] px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-14">
                  <div className="flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-2 border-primary-600 border-t-transparent"/></div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-14">
                  <p className="text-sm font-semibold text-[var(--text-muted)]">No fraud alerts found</p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">All clear across all organizations</p>
                </td></tr>
              ) : filtered.map((alert, idx) => {
                const sev   = SEV_BADGE[alert.severity]   ?? SEV_BADGE.MEDIUM;
                const sta   = STATUS_BADGE[alert.status]  ?? STATUS_BADGE.NEW;
                const name  = `${alert.employee?.firstName??'—'} ${alert.employee?.lastName??''}`.trim();
                const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                return (
                  <tr key={alert.id} className="hover:bg-[var(--hover-bg)] transition-colors cursor-pointer" onClick={() => setSelected(alert)}>
                    <td className="px-4 py-3 text-xs font-mono text-[var(--text-muted)]">{String(idx+1).padStart(5,'0')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: color }}>
                          {name[0] ?? '?'}
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--text-main)]">{name}</p>
                          <p className="text-xs text-[var(--text-muted)]">{alert.employee?.role ?? 'Employee'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{alert.fraudType?.replace(/_/g,' ')}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{alert.employee?.organization?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: sev.text }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: sev.dot }}/>{alert.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{fmt(alert.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: sta.text }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: sta.dot }}/>{alert.status}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {alert.status === 'NEW' && (
                          <button onClick={() => handleAction(alert.id,'escalate')} className="text-sm font-semibold text-amber-600 hover:text-amber-800 transition-colors">Investigate</button>
                        )}
                        {(alert.status === 'NEW' || alert.status === 'INVESTIGATING') && (
                          <button onClick={() => handleAction(alert.id,'resolve')} className="text-sm font-semibold text-primary-700 hover:text-primary-900 transition-colors">Resolve</button>
                        )}
                        <button onClick={() => setSelected(alert)} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[var(--hover-bg)] text-[var(--text-muted)] border border-[var(--border)] transition-colors">
                          <Eye size={11}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PageShell>
      {selected && (
        <DetailModal alert={selected} onClose={() => setSelected(null)} onResolve={() => handleAction(selected.id,'resolve')} onDismiss={() => handleAction(selected.id,'dismiss')} onInvestigate={() => handleAction(selected.id,'escalate')}/>
      )}
    </>
  );
}
