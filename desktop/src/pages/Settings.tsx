import React, { useEffect, useState } from 'react';
import { Shield, Wifi, Smartphone, Lock, Clock, Building2, AlertTriangle, EyeOff, UserCheck, GraduationCap } from 'lucide-react';
import { fetchAdminOrg } from '../services';
import { useAuth } from '../context/AuthContext';

// Read-only badge for a setting that's locked to Super Admin
function StateBadge({ on }: { on: boolean }) {
  return (
    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${on ? 'bg-primary-100 text-primary-700' : 'bg-[var(--hover-bg)] text-[var(--text-muted)]'}`}>
      {on ? 'Enabled' : 'Disabled'}
    </span>
  );
}

export default function Settings() {
  const { organization } = useAuth();
  const [orgDetails, setOrgDetails] = useState<any>(null);
  const [offices, setOffices]   = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const org = await fetchAdminOrg();
        setOrgDetails(org);
        const offs = org?.offices ?? [];
        setOffices(offs);
        if (offs.length) setSelected(offs[0]);
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-600 border-t-transparent" /></div>;
  }

  const s = selected?.securitySettings ?? {};
  const capabilities = {
    allowDeviceCheckIn: orgDetails?.allowDeviceCheckIn ?? organization?.allowDeviceCheckIn ?? false,
    allowManualCheckIn: orgDetails?.allowManualCheckIn ?? organization?.allowManualCheckIn ?? false,
    hasStudents: orgDetails?.hasStudents ?? organization?.hasStudents ?? false,
  };
  const row = 'flex items-center justify-between py-3 border-b border-[var(--border)] last:border-0';

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-5 border-b border-[var(--border)] bg-[var(--card-bg)]">
        <h1 className="text-xl font-bold text-[var(--text-main)]">Check-In Policy</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">View your organization's attendance & security policy.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Locked notice */}
        <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
          <EyeOff size={18} className="text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            These settings are <b>managed by the Super Admin</b> and are read-only here. Contact your Super Admin to change Wi-Fi, work hours, or security options.
          </p>
        </div>

        {/* Organization-wide capabilities (managed by Super Admin) */}
        <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] p-5">
          <h3 className="font-bold text-[var(--text-main)] mb-1 flex items-center gap-2"><Shield size={16} className="text-primary-600" />Attendance Channels</h3>
          <p className="text-xs text-[var(--text-muted)] mb-3">These permissions control which tabs and employee check-in methods are available throughout the desktop app.</p>
          <div className={row}>
            <div className="flex items-center gap-3"><Smartphone size={15} className="text-[var(--text-muted)]" /><div><span className="text-sm font-semibold text-[var(--text-main)]">Phone / Device Check-In</span><p className="text-xs text-[var(--text-muted)]">Employees may use an approved device when their own method permits it.</p></div></div>
            <StateBadge on={capabilities.allowDeviceCheckIn} />
          </div>
          <div className={row}>
            <div className="flex items-center gap-3"><UserCheck size={15} className="text-[var(--text-muted)]" /><div><span className="text-sm font-semibold text-[var(--text-main)]">Manual Employee Check-In</span><p className="text-xs text-[var(--text-muted)]">Shows the password-protected Manual Check-In station.</p></div></div>
            <StateBadge on={capabilities.allowManualCheckIn} />
          </div>
          <div className={row}>
            <div className="flex items-center gap-3"><GraduationCap size={15} className="text-[var(--text-muted)]" /><div><span className="text-sm font-semibold text-[var(--text-main)]">Students</span><p className="text-xs text-[var(--text-muted)]">Shows organization-scoped student records and attendance.</p></div></div>
            <StateBadge on={capabilities.hasStudents} />
          </div>
        </div>

        {offices.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)]">
            <Building2 size={40} className="mx-auto mb-3 opacity-30" />
            <p>No offices found for your organization.</p>
          </div>
        ) : (
          <>
            {offices.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {offices.map((o) => (
                  <button key={o.id} onClick={() => setSelected(o)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${selected?.id === o.id ? 'bg-primary-700 text-white' : 'bg-[var(--card-bg)] border border-[var(--border)] text-[var(--text-main)] hover:bg-[var(--hover-bg)]'}`}>
                    {o.name}
                  </button>
                ))}
              </div>
            )}

            {/* Work hours */}
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] p-5">
              <h3 className="font-bold text-[var(--text-main)] mb-3 flex items-center gap-2"><Clock size={16} className="text-primary-600" />Work Hours</h3>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Opens (check-in)', value: selected?.openTime ?? '—' },
                  { label: 'Closes (check-out)', value: selected?.closeTime ?? '—' },
                  { label: 'Break allowance', value: `${selected?.breakMinutes ?? 0} min` },
                ].map((x) => (
                  <div key={x.label} className="bg-[var(--hover-bg)] rounded-xl p-4 text-center">
                    <p className="text-2xl font-black text-[var(--text-main)]">{x.value}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">{x.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Verification (read-only) */}
            <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border)] p-5">
              <h3 className="font-bold text-[var(--text-main)] mb-3 flex items-center gap-2"><Shield size={16} className="text-primary-600" />Verification Methods</h3>
              <div className={row}>
                <div className="flex items-center gap-3"><Smartphone size={15} className="text-[var(--text-muted)]" /><span className="text-sm font-semibold text-[var(--text-main)]">Device Binding</span></div>
                <StateBadge on={s.deviceBindingEnabled !== false} />
              </div>
              <div className={row}>
                <div className="flex items-center gap-3"><Wifi size={15} className="text-[var(--text-muted)]" /><div><span className="text-sm font-semibold text-[var(--text-main)]">WiFi Required</span><p className="text-xs text-[var(--text-muted)]">{selected?.wifiSSID ? `Network: ${selected.wifiSSID}` : 'No network set'}</p></div></div>
                <StateBadge on={s.wifiRequired !== false} />
              </div>
              <div className={row}>
                <div className="flex items-center gap-3"><Lock size={15} className="text-[var(--text-muted)]" /><span className="text-sm font-semibold text-[var(--text-main)]">Code Challenge</span></div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-primary-100 text-primary-700">Always On</span>
              </div>
              <div className={row}>
                <div className="flex items-center gap-3"><Lock size={15} className="text-[var(--text-muted)]" /><span className="text-sm font-semibold text-[var(--text-main)]">Screenshot Block</span></div>
                <StateBadge on={s.screenshotProtection !== false} />
              </div>
              <div className={row}>
                <div className="flex items-center gap-3"><AlertTriangle size={15} className="text-[var(--text-muted)]" /><span className="text-sm font-semibold text-[var(--text-main)]">Auto-Lock on Fraud</span></div>
                <StateBadge on={s.autoLockOnFraud !== false} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
