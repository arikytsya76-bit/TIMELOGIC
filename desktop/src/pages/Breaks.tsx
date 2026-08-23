import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import Header from '../components/Header';
import { fetchDailyBreaks } from '../services';

const BREAK_COLORS: Record<string, string> = {
  LUNCH: 'bg-orange-100 text-orange-700',
  SHORT_BREAK: 'bg-primary-100 text-primary-700',
  PRAYER: 'bg-violet-100 text-violet-700',
  PERSONAL: 'bg-teal-100 text-teal-700',
  NURSING: 'bg-pink-100 text-pink-700',
};

function Spinner() {
  return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 border-t-transparent" /></div>;
}

export default function Breaks() {
  const [breaks, setBreaks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchDailyBreaks().then(setBreaks).finally(() => setLoading(false)); }, []);

  const fmt = (t: string | null, timezone?: string | null) => t ? new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: timezone || 'Africa/Lagos' }) : '—';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Break Records" subtitle="Today's break activity" />
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? <Spinner /> : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-xs font-semibold text-slate-500 px-5 py-3">Employee</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Break Type</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Start</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">End</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Duration</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {breaks.map((b: any) => (
                  <tr key={b.id} className={`hover:bg-slate-50 transition ${b.isAutoEnded ? 'bg-orange-50' : ''}`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-primary-700">{b.employee?.firstName?.[0]}{b.employee?.lastName?.[0]}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{b.employee?.firstName} {b.employee?.lastName}</p>
                          <p className="text-xs text-slate-400">{b.employee?.employeeCode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className={`text-xs font-bold px-2.5 py-1 rounded-full ${BREAK_COLORS[b.breakType] ?? 'bg-slate-100 text-slate-500'}`}>{b.breakType?.replace('_', ' ')}</span></td>
                    <td className="px-4 py-3 font-medium text-slate-800">{fmt(b.startTime, b.employee?.organization?.timezone)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{b.endTime ? fmt(b.endTime, b.employee?.organization?.timezone) : <span className="text-emerald-600 font-semibold text-xs">Active</span>}</td>
                    <td className="px-4 py-3 font-bold text-slate-700">{b.durationMinutes ?? '—'}m</td>
                    <td className="px-4 py-3">
                      {b.isAutoEnded
                        ? <div className="flex items-center gap-1 text-orange-600"><AlertCircle size={13} /><span className="text-xs font-semibold">Auto-ended</span></div>
                        : b.endTime ? <span className="text-xs font-semibold text-emerald-600">Normal</span>
                        : <span className="text-xs font-semibold text-primary-600">In progress</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {breaks.length === 0 && <div className="text-center py-12 text-slate-400 text-sm">No breaks recorded today</div>}
          </div>
        )}
      </div>
    </div>
  );
}
