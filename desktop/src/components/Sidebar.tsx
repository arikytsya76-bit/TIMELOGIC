import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CalendarClock, Users, ClipboardList,
  UmbrellaOff, Coffee, ShieldAlert, Zap, BarChart3, LogOut, Settings,
  GraduationCap, UserCheck, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.jpg';

type Capability = 'allowManualCheckIn' | 'hasStudents';

const NAV: { to: string; label: string; icon: LucideIcon; capability?: Capability }[] = [
  { to: '/dashboard',  label: 'Dashboard',     icon: LayoutDashboard },
  { to: '/sessions',   label: 'Sessions',       icon: CalendarClock },
  { to: '/attendance', label: 'Attendance',     icon: ClipboardList },
  { to: '/manual-attendance', label: 'Manual Check-In', icon: UserCheck },
  { to: '/employees',  label: 'Employees',      icon: Users },
  { to: '/students',   label: 'Students',       icon: GraduationCap, capability: 'hasStudents' },
  { to: '/leaves',     label: 'Leave Requests', icon: UmbrellaOff },
  { to: '/breaks',     label: 'Break Records',  icon: Coffee },
  { to: '/fraud',      label: 'Fraud Alerts',   icon: ShieldAlert },
  { to: '/emergency',  label: 'Emergency',      icon: Zap },
  { to: '/reports',    label: 'Reports',        icon: BarChart3 },
  { to: '/settings',   label: 'Check-In Settings', icon: Settings },
];

export default function Sidebar() {
  const { user, organization, logout } = useAuth();
  const navigate = useNavigate();
  const visibleNav = NAV.filter((item) => !item.capability || Boolean(organization?.[item.capability]));
  return (
    <aside className="w-60 min-h-screen bg-primary-900 dark:bg-slate-950 flex flex-col flex-shrink-0 transition-colors">
      <div className="px-5 py-6 border-b border-primary-800 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0 overflow-hidden">
            <img src={logo} alt="TimeLogic" className="w-8 h-8 object-contain" />
          </div>
          <div>
            <p className="text-white font-bold text-[15px] leading-tight">TimeLogic</p>
            <p className="text-primary-300 text-[11px]">Admin Panel</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleNav.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive ? 'bg-primary-600 text-white' : 'text-primary-300 hover:bg-primary-800 dark:hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Icon size={17} />{label}
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-primary-800 dark:border-slate-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">{user?.firstName?.[0]}{user?.lastName?.[0]}</span>
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-semibold truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-primary-400 text-[10px] truncate">{user?.role}</p>
          </div>
        </div>
        <button onClick={() => { logout(); navigate('/login'); }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-primary-400 hover:text-white hover:bg-primary-800 dark:hover:bg-slate-800 text-xs font-medium transition-all">
          <LogOut size={14} />Sign Out
        </button>
      </div>
    </aside>
  );
}
