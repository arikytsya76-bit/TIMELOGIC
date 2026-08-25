import React, { useEffect, useState } from 'react';
import { AlertCircle, Play } from 'lucide-react';
import Header from '../components/Header';
import { fetchDailyBreaks, startEmployeeBreak, endEmployeeBreak, fetchEmployees } from '../services';
import { useAuth } from '../context/AuthContext';

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
  const { serverNow, organizationTimezone } = useAuth();
  const [breaks, setBreaks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const takenEmployeeIds = new Set(breaks.map((item) => item.employeeId));
  const isToday = Boolean(serverNow && date === serverNow.toLocaleDateString('en-CA', { timeZone: organizationTimezone }));

  const load = () => { setLoading(true); fetchDailyBreaks(date).then(setBreaks).finally(() => setLoading(false)); };
  useEffect(() => {
    if (!date && serverNow) setDate(serverNow.toLocaleDateString('en-CA', { timeZone: organizationTimezone }));
  }, [date, serverNow, organizationTimezone]);
  useEffect(() => { if (!date) return; load(); fetchEmployees().then(setEmployees).catch(() => {}); }, [date]);
  const startFor = async (employeeId: string, breakType: string) => {
    setStarting(employeeId);
    try { await startEmployeeBreak(employeeId, breakType, 'Started by organization admin'); load(); }
    catch (err: any) { alert(err?.message ?? 'Could not start break.'); }
    finally { setStarting(null); }
  };
  const endFor = async (employeeId: string, breakId: string) => {
    setStarting(employeeId);
    try { await endEmployeeBreak(employeeId, breakId); load(); }
    catch (err: any) { alert(err?.message ?? 'Could not end break.'); }
    finally { setStarting(null); }
  };

  const fmt = (t: string | null, timezone?: string | null) => t ? new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: timezone || 'Africa/Lagos' }) : '—';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Break Records" subtitle="Today's break activity" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm font-semibold text-slate-600">Record date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <select value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Select employee for admin break</option>
            {employees.filter((e) => e.status === 'ACTIVE').map((e) => <option key={e.id} value={e.id} disabled={takenEmployeeIds.has(e.id)}>{e.firstName} {e.lastName} ({e.department?.name ?? 'No department'}){takenEmployeeIds.has(e.id) ? ' — break already recorded today' : ''}</option>)}
          </select>
          <button disabled={!isToday || !selectedEmployee || takenEmployeeIds.has(selectedEmployee) || !!starting} onClick={() => startFor(selectedEmployee, 'LUNCH')} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-primary-700 text-white text-sm font-semibold disabled:opacity-50"><Play size={14} />Take lunch</button>
          <button disabled={!isToday || !selectedEmployee || takenEmployeeIds.has(selectedEmployee) || !!starting} onClick={() => startFor(selectedEmployee, 'SHORT_BREAK')} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-700 text-white text-sm font-semibold disabled:opacity-50">Take short break</button>
        </div>
        {loading ? <Spinner /> : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-xs font-semibold text-slate-500 px-5 py-3">Employee</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Break Type</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Start</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">End</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Allowed window</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Duration</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Admin action</th>
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
                    <td className="px-4 py-3 text-xs text-slate-500">{b.employee?.department?.breakPolicy?.breakStart && b.employee?.department?.breakPolicy?.breakEnd ? `${b.employee.department.breakPolicy.breakStart} - ${b.employee.department.breakPolicy.breakEnd}` : 'Any time'}</td>
                    <td className="px-4 py-3 font-bold text-slate-700">{b.durationMinutes ?? '—'}m {b.penalty > 0 && <span className="block text-xs text-red-600">Penalty ₦{Number(b.penalty).toLocaleString()}</span>}</td>
                    <td className="px-4 py-3">
                      {b.isAutoEnded
                        ? <div className="flex items-center gap-1 text-orange-600"><AlertCircle size={13} /><span className="text-xs font-semibold">Auto-ended</span></div>
                        : b.endTime ? <span className={`text-xs font-semibold ${b.penalty > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{b.penalty > 0 ? 'Overstayed breaktime' : 'Normal'}</span>
                        : <span className="text-xs font-semibold text-primary-600">In progress</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {!b.endTime && <button disabled={starting === b.employee?.id} onClick={() => endFor(b.employee.id, b.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 text-red-700 text-xs font-semibold disabled:opacity-50">{starting === b.employee?.id ? 'Ending...' : 'End break'}</button>}
                      {b.endTime && <button disabled={starting === b.employee?.id} onClick={() => startFor(b.employee.id, 'SHORT_BREAK')} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary-50 text-primary-700 text-xs font-semibold disabled:opacity-50"><Play size={12} />{starting === b.employee?.id ? 'Starting...' : 'Start break'}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {breaks.length === 0 && <div className="text-center py-12 text-slate-400 text-sm">No breaks recorded for this date</div>}
          </div>
        )}
      </div>
    </div>
  );
}
