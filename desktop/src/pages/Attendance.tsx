import React, { useEffect, useState } from 'react';
import { Search, AlertTriangle, Wifi, Smartphone, Flag, UserCheck, RefreshCw } from 'lucide-react';
import Header from '../components/Header';
import { fetchLiveAttendance, fetchAttendanceForDate, fetchMonthlyPenalties, flagRecord, approveRecord } from '../services';
import { useAuth } from '../context/AuthContext';

const STATUS_STYLE: Record<string, string> = {
  PRESENT: 'bg-emerald-100 text-emerald-700',
  LATE: 'bg-amber-100 text-amber-700',
  ABSENT: 'bg-red-100 text-red-700',
  ON_LEAVE: 'bg-violet-100 text-violet-700',
};

function Spinner() {
  return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 border-t-transparent" /></div>;
}

function recorderName(recorder: any) {
  if (!recorder) return null;
  if (typeof recorder === 'string') return recorder;
  const name = `${recorder.firstName ?? ''} ${recorder.lastName ?? ''}`.trim();
  return name || recorder.email || recorder.employeeCode || null;
}

export default function Attendance() {
  const { serverNow, organizationTimezone } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [view, setView] = useState<'today' | 'past'>('today');
  const [pastDate, setPastDate] = useState('');
  const [monthlyPenalties, setMonthlyPenalties] = useState<any>(null);

  const load = async () => {
    try {
      setError('');
      const next = view === 'today'
        ? await fetchLiveAttendance()
        : await fetchAttendanceForDate(pastDate);
      setRecords(next);
      if (view === 'past') setMonthlyPenalties(await fetchMonthlyPenalties(pastDate.slice(0, 7)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load live attendance records.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!pastDate && serverNow) setPastDate(serverNow.toLocaleDateString('en-CA', { timeZone: organizationTimezone }));
  }, [pastDate, serverNow, organizationTimezone]);
  useEffect(() => { if (view === 'today' || pastDate) void load(); if (view !== 'today') return; const t = setInterval(() => void load(), 5000); return () => clearInterval(t); }, [view, pastDate]);

  const filtered = records.filter((r) => {
    const matchSearch = `${r.employee?.firstName} ${r.employee?.lastName} ${r.employee?.employeeCode}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filter === 'All' || r.status === filter;
    return matchSearch && matchStatus;
  });

  const fmt = (t: string | null, timezone?: string | null) => {
    if (!t) return '—';
    try {
      return new Date(t).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: true,
        ...(timezone ? { timeZone: timezone } : {}),
      });
    } catch {
      return new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Attendance Records" subtitle="Live server attendance" action={(
        <button onClick={() => void load()} disabled={loading} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--text-main)] hover:bg-[var(--hover-bg)] disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      )} />
      <div className="flex-1 overflow-y-auto p-6">
        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {!loading && !error && records.length > 0 && <p className="mb-3 text-xs font-semibold text-emerald-700">{view === 'today' ? `${records.length} live attendance record${records.length === 1 ? '' : 's'} from the server` : `${records.length} attendance record${records.length === 1 ? '' : 's'} for ${pastDate}`}</p>}
        <div className="flex items-center gap-2 mb-4">
          {(['today', 'past'] as const).map((option) => <button key={option} onClick={() => setView(option)} className={`text-xs font-semibold px-3 py-2 rounded-xl ${view === option ? 'bg-primary-700 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{option === 'today' ? 'Today' : 'Past Attendance'}</button>)}
          {view === 'past' && <input type="date" value={pastDate} onChange={(e) => setPastDate(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm" />}
        </div>
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or employee code..." className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          {['All', 'PRESENT', 'LATE', 'ABSENT', 'ON_LEAVE'].map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={`text-xs font-semibold px-3 py-2 rounded-xl transition ${filter === s ? 'bg-primary-700 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{s.replace('_', ' ')}</button>
          ))}
        </div>
        {loading ? <Spinner /> : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-xs font-semibold text-slate-500 px-5 py-3">Employee</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Clock In</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Clock Out</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Penalty</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Source / Verification</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((r: any) => {
                  const checkInSource = r.checkInSource ?? r.source ?? r.attendanceSource ?? r.entryMethod ?? 'PHONE';
                  const checkOutSource = r.checkOutSource ?? null;
                  const checkInRecorder = recorderName(r.checkInRecorder ?? r.recordedBy ?? r.checkedInBy);
                  const checkOutRecorder = recorderName(r.checkOutRecorder ?? r.checkedOutBy);
                  const timezone = r.session?.office?.timezone ?? null;
                  return <tr key={r.id} className={`hover:bg-slate-50 transition ${r.flagged ? 'bg-orange-50' : ''}`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-primary-700">{r.employee?.firstName?.[0]}{r.employee?.lastName?.[0]}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{r.employee?.firstName} {r.employee?.lastName}</p>
                          <p className="text-xs text-slate-400">{r.employee?.employeeCode}</p>
                        </div>
                        {r.flagged && <AlertTriangle size={13} className="text-orange-500" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{fmt(r.clockInTime, timezone)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{fmt(r.clockOutTime, timezone)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${STATUS_STYLE[r.status] ?? 'bg-slate-100 text-slate-500'}`}>{r.status?.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-red-600">{r.penalty ? `₦${r.penalty.toLocaleString()}` : '₦0'}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1.5 text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 w-5">In</span>
                          <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full ${checkInSource === 'MANUAL' ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-600'}`}>
                            {checkInSource === 'MANUAL' && <UserCheck size={10} />}{String(checkInSource).replace(/_/g, ' ')}
                          </span>
                          {checkInRecorder && <span className="text-slate-400">by {checkInRecorder}</span>}
                        </div>
                        {r.clockOutTime && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400 w-5">Out</span>
                            <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full ${checkOutSource === 'MANUAL' ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-600'}`}>
                              {checkOutSource === 'MANUAL' && <UserCheck size={10} />}{String(checkOutSource ?? 'SYSTEM').replace(/_/g, ' ')}
                            </span>
                            {checkOutRecorder && <span className="text-slate-400">by {checkOutRecorder}</span>}
                          </div>
                        )}
                        {checkInSource === 'PHONE' && (
                          <div className="flex gap-1.5 pl-7" title="Wi-Fi and registered-device verification">
                            <Wifi size={13} className={r.wifiVerified ? 'text-emerald-500' : 'text-slate-200'} />
                            <Smartphone size={13} className={r.deviceVerified ? 'text-emerald-500' : 'text-slate-200'} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={async () => {
                          if (r.flagged) await approveRecord(r.id);
                          else await flagRecord(r.id, 'Manually flagged');
                          load();
                        }}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition ${r.flagged ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                      >
                        <Flag size={11} className="inline mr-1" />{r.flagged ? 'Unflag' : 'Flag'}
                      </button>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="text-center py-12 text-slate-400 text-sm">No records found</div>}
          </div>
        )}
        {view === 'past' && monthlyPenalties && (
          <div className="mt-6 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800">Month-end penalty summary</h2>
              <p className="text-xs text-slate-500 mt-1">{monthlyPenalties.month} has {monthlyPenalties.daysInMonth} days. Totals include the full calendar month.</p>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left text-xs font-semibold text-slate-500 px-5 py-3">Employee</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Department</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Attendance days</th>
                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Total penalty</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-50">
                {monthlyPenalties.employees.map((employee: any) => <tr key={employee.id}>
                  <td className="px-5 py-3 font-semibold text-slate-800">{employee.firstName} {employee.lastName} <span className="text-xs font-normal text-slate-400">{employee.employeeCode || ''}</span></td>
                  <td className="px-4 py-3 text-slate-500">{employee.department?.name ?? 'No department'}</td>
                  <td className="px-4 py-3 text-slate-700">{employee.attendanceCount}</td>
                  <td className="px-4 py-3 font-bold text-red-600">₦{Number(employee.totalPenalty).toLocaleString()}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
