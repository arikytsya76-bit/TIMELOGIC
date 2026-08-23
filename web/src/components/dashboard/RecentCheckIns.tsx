import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../../services/api';

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  PRESENT:  { bg: '#dcfce7', text: '#15803d', label: 'Present' },
  LATE:     { bg: '#fef9c3', text: '#a16207', label: 'Late' },
  ABSENT:   { bg: '#fee2e2', text: '#dc2626', label: 'Absent' },
  ON_LEAVE: { bg: '#ede9fe', text: '#7c3aed', label: 'On Leave' },
};

const AVATAR_COLORS = ['#15803d','#2563EB','#7C3AED','#F59E0B','#EF4444','#0891B2'];

export default function RecentCheckIns() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get<any>('/super/reports').then((r) => {
      const recent = r.data?.recentAttendance ?? [];
      setRecords(recent.slice(0, 4));
    }).catch(() => {
      // fallback: empty list
      setRecords([]);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-[15px] text-[var(--text-main)]">Recent Check-ins</h3>
        <button onClick={load} className="flex items-center gap-1 text-xs font-semibold border border-[var(--border)] rounded-xl px-2.5 py-1.5 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] transition-colors">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="space-y-3">
        {loading ? (
          [1,2,3,4].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-9 h-9 rounded-full bg-[var(--hover-bg)] flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-[var(--hover-bg)] rounded w-32" />
                <div className="h-2.5 bg-[var(--hover-bg)] rounded w-48" />
              </div>
              <div className="h-5 w-16 bg-[var(--hover-bg)] rounded-full" />
            </div>
          ))
        ) : records.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-[var(--text-muted)]">No check-ins today yet</p>
          </div>
        ) : (
          records.map((rec: any, i: number) => {
            const name = `${rec.employee?.firstName ?? 'Employee'} ${rec.employee?.lastName ?? ''}`.trim();
            const task = rec.session?.sessionName ?? 'Attendance Session';
            const status = rec.status ?? 'PRESENT';
            const style = STATUS_STYLE[status] ?? STATUS_STYLE.PRESENT;
            const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
            return (
              <div key={rec.id ?? i} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                  style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[var(--text-main)]">{name}</p>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">
                    Session: <span className="font-medium">{task}</span>
                  </p>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                  style={{ background: style.bg, color: style.text }}>
                  {style.label}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
