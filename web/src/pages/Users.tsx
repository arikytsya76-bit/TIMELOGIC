import React, { useEffect, useState } from 'react';
import { X, Crown, Shield, User, ChevronsUpDown, Calendar, Coffee, AlertTriangle, FileText, ArrowLeftRight, Smartphone } from 'lucide-react';
import PageShell from '../components/PageShell';
import { fetchAllOrgs, fetchOrgUsers, fetchEmployeeRecords, reemployEmployee, suspendAdmin, activateAdmin, renameAdmin, reassignEmployee, resetUserDevice } from '../services';
import { downloadCSV } from '../utils/csv';

const AVATAR_COLORS = ['#15803d','#0891b2','#7c3aed','#b45309','#be185d','#0369a1','#dc2626','#d97706'];

const STATUS_BADGE: Record<string, { bg: string; text: string; dot: string }> = {
  ACTIVE:     { bg: '#dcfce7', text: '#15803d', dot: '#16a34a' },
  SUSPENDED:  { bg: '#fee2e2', text: '#dc2626', dot: '#ef4444' },
  ON_LEAVE:   { bg: '#ede9fe', text: '#7c3aed', dot: '#8b5cf6' },
  TERMINATED: { bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' },
};

const TH = ({ children }: { children: React.ReactNode }) => (
  <th className="text-left text-xs font-semibold text-[var(--text-muted)] px-4 py-3 whitespace-nowrap">
    <div className="flex items-center gap-1">{children}<ChevronsUpDown size={11} className="opacity-40"/></div>
  </th>
);

function ReassignModal({ user, orgs, onClose, onDone }: { user: any; orgs: any[]; onClose: () => void; onDone: () => void }) {
  const targets = orgs.filter((o) => o.id !== 'platform-org' && o.id !== user.orgId);
  const [orgId, setOrgId] = useState(targets[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!orgId) { setError('Select a target organization'); return; }
    setLoading(true); setError('');
    try { await reassignEmployee(user.id, orgId); onDone(); onClose(); }
    catch (e: any) { setError(e?.message ?? 'Reassign failed'); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--card-bg)] rounded-3xl w-full max-w-md shadow-2xl border border-[var(--border)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2"><ArrowLeftRight size={18} className="text-primary-700"/><h2 className="font-bold text-[var(--text-main)]">Reassign Employee</h2></div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)]"><X size={18}/></button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">{error}</div>}
          <p className="text-sm text-[var(--text-muted)]">Move <b className="text-[var(--text-main)]">{user.firstName} {user.lastName}</b> from <b>{user.orgName ?? 'their org'}</b> to another organization. Their department is cleared and they're signed out.</p>
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">Target Organization</label>
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="w-full border border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text-main)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400">
              {targets.length === 0 ? <option value="">No other organizations</option> : targets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 pb-5">
          <button onClick={onClose} className="px-4 py-2 border border-[var(--border)] text-sm font-semibold rounded-xl hover:bg-[var(--hover-bg)] transition text-[var(--text-main)]">Cancel</button>
          <button onClick={submit} disabled={loading || targets.length === 0} className="px-5 py-2 bg-primary-700 hover:bg-primary-800 text-white text-sm font-bold rounded-xl transition disabled:opacity-60">{loading ? 'Reassigning…' : 'Reassign'}</button>
        </div>
      </div>
    </div>
  );
}

function TerminatedModal({ userId, onClose, onReemployed }: { userId: string; onClose: () => void; onReemployed?: () => void }) {
  const [data,       setData]       = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [reemploying, setReemploying] = useState(false);
  const [done,       setDone]       = useState(false);
  useEffect(() => { fetchEmployeeRecords(userId).then(setData).catch(() => {}).finally(() => setLoading(false)); }, [userId]);
  const fmt  = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—';
  const handleReemploy = async () => {
    if (!window.confirm(`Re-employ ${data?.user?.firstName} ${data?.user?.lastName}?`)) return;
    setReemploying(true);
    try { await reemployEmployee(userId); setDone(true); onReemployed?.(); } catch (e: any) { alert(e?.message ?? 'Failed'); } finally { setReemploying(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--card-bg)] rounded-3xl w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col border border-[var(--border)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"><User size={17} className="text-gray-500"/></div>
            <div><h2 className="font-bold text-[var(--text-main)]">{data ? `${data.user?.firstName} ${data.user?.lastName}` : 'Loading…'}</h2><span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">🚫 Terminated</span></div>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-main)]"><X size={18}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-2 border-primary-600 border-t-transparent"/></div>
            : !data ? <p className="text-center text-[var(--text-muted)] py-10">Failed to load.</p>
            : <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {[['Email',data.user.email],['Code',data.user.employeeCode??'—'],['Org',data.user.organization?.name??'—'],['Dept',data.user.department?.name??'—'],['Joined',fmt(data.user.createdAt)],['Attendance Records',data.user._count?.attendanceRecords??0]].map(([l,v]) => (
                  <div key={String(l)} className="flex justify-between py-2 border-b border-[var(--border)]"><span className="text-[var(--text-muted)]">{l}</span><span className="font-semibold text-[var(--text-main)]">{String(v)}</span></div>
                ))}
              </div>
              {data.attendanceRecords?.length > 0 && (
                <div>
                  <h3 className="font-bold text-[var(--text-main)] mb-2 flex items-center gap-2"><Calendar size={14}/>Attendance ({data.attendanceRecords.length})</h3>
                  <div className="bg-[var(--hover-bg)] rounded-xl border border-[var(--border)] overflow-hidden max-h-44 overflow-y-auto">
                    <table className="w-full text-xs"><thead className="bg-[var(--hover-bg)] sticky top-0"><tr>{['Date','Session','In','Out','Status'].map((h) => <th key={h} className="text-left px-3 py-2 text-[var(--text-muted)] font-semibold">{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-[var(--border)]">{data.attendanceRecords.map((r: any) => (
                        <tr key={r.id} className="hover:bg-[var(--hover-bg)]"><td className="px-3 py-2">{fmt(r.date)}</td><td className="px-3 py-2 text-[var(--text-muted)]">{r.session?.sessionName??'—'}</td><td className="px-3 py-2">{r.clockInTime?new Date(r.clockInTime).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}):'—'}</td><td className="px-3 py-2">{r.clockOutTime?new Date(r.clockOutTime).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}):'—'}</td><td className="px-3 py-2 font-bold" style={{color:r.status==='PRESENT'?'#15803d':r.status==='LATE'?'#d97706':'#dc2626'}}>{r.status}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          }
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--text-muted)]">{done ? '✓ Re-employed. They can now log in.' : 'All historical records preserved.'}</p>
          <div className="flex gap-3">
            {!done && <button onClick={handleReemploy} disabled={reemploying||loading} className="px-5 py-2 bg-primary-700 hover:bg-primary-800 text-white text-sm font-bold rounded-xl transition disabled:opacity-60 flex items-center gap-2">{reemploying?<><span className="animate-spin border-2 border-white border-t-transparent rounded-full w-3.5 h-3.5"/>Working…</>:'✓ Re-employ'}</button>}
            <button onClick={onClose} className="px-5 py-2 border border-[var(--border)] text-sm font-semibold rounded-xl hover:bg-[var(--hover-bg)] transition text-[var(--text-main)]">{done?'Done':'Close'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Users() {
  const [orgs,       setOrgs]       = useState<any[]>([]);
  const [users,      setUsers]      = useState<any[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [search,     setSearch]     = useState('');
  const [tab,        setTab]        = useState(0); // 0=All 1=Admins 2=Employees 3=Terminated
  const [viewTerminated, setViewTerminated] = useState<string | null>(null);
  const [reassign, setReassign] = useState<any>(null);

  useEffect(() => { fetchAllOrgs().then(setOrgs).finally(() => setOrgsLoading(false)); }, []);

  const loadUsers = () => {
    setLoading(true);
    Promise.all(orgs.map((o: any) => fetchOrgUsers(o.id).catch(() => [])))
      .then((results) => setUsers(results.flat()))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (orgs.length) loadUsers(); }, [orgs.length]);

  const all        = users.filter((u) => !['platform-org'].includes(u.orgId));
  const admins     = all.filter((u) => u.role === 'ADMIN');
  const employees  = all.filter((u) => u.role === 'EMPLOYEE' && u.status !== 'TERMINATED');
  const terminated = all.filter((u) => u.status === 'TERMINATED');

  const tabUsers = tab === 0 ? all : tab === 1 ? admins : tab === 2 ? employees : terminated;
  const filtered = tabUsers.filter((u) => {
    const q = search.toLowerCase();
    return !q || `${u.firstName} ${u.lastName} ${u.email} ${u.employeeCode??''}`.toLowerCase().includes(q);
  });

  return (
    <>
      <PageShell
        breadcrumb={['Super Admin', 'All Users']}
        title="User Management"
        tabs={[
          { label: 'All Users',  count: all.length },
          { label: 'Admins',     count: admins.length },
          { label: 'Employees',  count: employees.length },
          { label: 'Terminated', count: terminated.length },
        ]}
        activeTab={tab} onTabChange={setTab}
        search={search} onSearch={setSearch}
        searchPlaceholder="Search employee…"
        onExport={() => downloadCSV('users', filtered.map((u: any) => ({
          Name: `${u.firstName} ${u.lastName}`, Email: u.email, Code: u.employeeCode ?? '',
          Role: u.role, Organization: u.orgName ?? orgs.find((o: any) => o.id === u.orgId)?.name ?? '',
          Status: u.status,
        })))}
      >
        <div className="overflow-y-auto h-full">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--hover-bg)] border-b border-[var(--border)]">
              <tr>
                <TH>ID</TH>
                <TH>Employee</TH>
                <TH>Code</TH>
                <TH>Role</TH>
                <TH>Organization</TH>
                <TH>Status</TH>
                <th className="text-left text-xs font-semibold text-[var(--text-muted)] px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {(loading || orgsLoading) ? (
                <tr><td colSpan={7} className="text-center py-14">
                  <div className="flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-2 border-primary-600 border-t-transparent"/></div>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-14 text-sm text-[var(--text-muted)]">No users found</td></tr>
              ) : filtered.map((u, idx) => {
                const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                const badge = STATUS_BADGE[u.status] ?? STATUS_BADGE.ACTIVE;
                const isTerminated = u.status === 'TERMINATED';
                return (
                  <tr key={u.id}
                    className={`hover:bg-[var(--hover-bg)] transition-colors ${isTerminated ? 'opacity-70 cursor-pointer' : ''}`}
                    onClick={isTerminated ? () => setViewTerminated(u.id) : undefined}>
                    <td className="px-4 py-3 text-xs font-mono text-[var(--text-muted)]">{u.employeeCode ?? String(idx+1).padStart(5,'0')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: color }}>
                          {u.firstName?.[0]}{u.lastName?.[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--text-main)]">{u.firstName} {u.lastName}</p>
                          <p className="text-xs text-[var(--text-muted)] truncate max-w-[160px]">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-primary-700">{u.employeeCode ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${u.role === 'SUPER_ADMIN' ? 'bg-amber-100 text-amber-700' : u.role === 'ADMIN' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'}`}>
                        {u.role === 'SUPER_ADMIN' ? <Crown size={9}/> : u.role === 'ADMIN' ? <Shield size={9}/> : <User size={9}/>}
                        {u.role.replace('_',' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)] text-sm">{u.orgName ?? orgs.find((o: any) => o.id === u.orgId)?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: badge.text }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: badge.dot }}/>
                        {u.status === 'TERMINATED' ? '🚫 Terminated' : u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {/* Super Admin may suspend ADMINS only; EMPLOYEES can only be reassigned */}
                      {u.role === 'ADMIN' && (
                        <div className="flex items-center gap-3">
                          <button onClick={async () => { const firstName = window.prompt('Admin first name', u.firstName); const lastName = firstName === null ? null : window.prompt('Admin last name', u.lastName); if (firstName?.trim() && lastName?.trim()) { try { await renameAdmin(u.id, firstName, lastName); loadUsers(); } catch (err: any) { alert(err?.message ?? 'Could not rename admin.'); } } }} className="text-sm font-semibold text-primary-700 hover:text-primary-900">Rename</button>
                          <button
                            onClick={async () => { u.status === 'ACTIVE' ? await suspendAdmin(u.id) : await activateAdmin(u.id); loadUsers(); }}
                            className={`text-sm font-semibold transition-colors ${u.status === 'ACTIVE' ? 'text-red-600 hover:text-red-800' : 'text-primary-700 hover:text-primary-900'}`}>
                            {u.status === 'ACTIVE' ? 'Suspend Admin' : 'Activate Admin'}
                          </button>
                        </div>
                      )}
                      {u.role === 'EMPLOYEE' && !isTerminated && (
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setReassign(u)}
                            className="flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-900 transition-colors">
                            <ArrowLeftRight size={13}/> Reassign
                          </button>
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Reset device for ${u.firstName} ${u.lastName}?\n\nUnlinks their current phone so they can sign in on a new one. The next device used becomes their bound device; the old one stops working.`)) return;
                              try { await resetUserDevice(u.id); alert('Device unlinked. They can now sign in on a new phone.'); } catch (err: any) { alert(err?.message ?? 'Could not reset device.'); }
                            }}
                            className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
                            <Smartphone size={13}/> Reset device
                          </button>
                        </div>
                      )}
                      {u.role === 'SUPER_ADMIN' && <span className="text-xs text-[var(--text-muted)] italic">—</span>}
                      {isTerminated && u.role !== 'ADMIN' && <span className="text-xs text-[var(--text-muted)] italic">Click row →</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </PageShell>
      {viewTerminated && (
        <TerminatedModal userId={viewTerminated} onClose={() => setViewTerminated(null)} onReemployed={loadUsers}/>
      )}
      {reassign && (
        <ReassignModal user={reassign} orgs={orgs} onClose={() => setReassign(null)} onDone={loadUsers}/>
      )}
    </>
  );
}
