import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Sessions from './pages/Sessions';
import Attendance from './pages/Attendance';
import ManualCheckIn from './pages/ManualCheckIn';
import Employees from './pages/Employees';
import Leaves from './pages/Leaves';
import Breaks from './pages/Breaks';
import FraudAlerts from './pages/FraudAlerts';
import Emergency from './pages/Emergency';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Students from './pages/Students';

function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  // Show spinner while token is being verified — prevents flash to login
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--page-bg)] flex-col gap-4">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
        <p className="text-sm text-[var(--text-muted)]">Verifying session...</p>
      </div>
    );
  }
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function CapabilityGuard({
  capability,
  children,
}: {
  capability: 'allowManualCheckIn' | 'hasStudents';
  children: React.ReactNode;
}) {
  const { organization } = useAuth();
  return organization?.[capability] ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  // Don't redirect to login while session is being restored
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--page-bg)] flex-col gap-4">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary-600 border-t-transparent" />
        <p className="text-sm text-[var(--text-muted)]">Loading...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login"      element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/"           element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
      <Route path="/dashboard"  element={<Guard><Layout><Dashboard /></Layout></Guard>} />
      <Route path="/sessions"   element={<Guard><Layout><Sessions /></Layout></Guard>} />
      <Route path="/attendance" element={<Guard><Layout><Attendance /></Layout></Guard>} />
      <Route path="/manual-attendance" element={<Guard><Layout><ManualCheckIn /></Layout></Guard>} />
      <Route path="/employees"  element={<Guard><Layout><Employees /></Layout></Guard>} />
      <Route path="/students"   element={<Guard><CapabilityGuard capability="hasStudents"><Layout><Students /></Layout></CapabilityGuard></Guard>} />
      <Route path="/leaves"     element={<Guard><Layout><Leaves /></Layout></Guard>} />
      <Route path="/breaks"     element={<Guard><Layout><Breaks /></Layout></Guard>} />
      <Route path="/fraud"      element={<Guard><Layout><FraudAlerts /></Layout></Guard>} />
      <Route path="/emergency"  element={<Guard><Layout><Emergency /></Layout></Guard>} />
      <Route path="/reports"    element={<Guard><Layout><Reports /></Layout></Guard>} />
      <Route path="/settings"   element={<Guard><Layout><Settings /></Layout></Guard>} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  );
}
