import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { getTodayStatus, checkOutApi, AttendanceStatus } from '../services/attendanceService';
import { startBreakApi, endBreakApi, getActiveBreakApi } from '../services/breakService';

interface AttendanceCtx {
  attendance: AttendanceStatus;
  loading: boolean;
  totalWorkHours: string | null;
  refreshStatus: () => Promise<void>;
  setCheckedIn: (time: string, status: string) => void;
  checkOut: () => Promise<void>;
  startBreak: (breakType: string) => Promise<void>;
  endBreak: () => Promise<void>;
  reset: () => void;
  activeBreakId: string | null;
  activeBreakStartTime: Date | null;
}

const DEFAULT: AttendanceStatus = {
  hasCheckedIn: false,
  hasCheckedOut: false,
  status: null,
  checkInTime: null,
  checkOutTime: null,
  totalWorkHours: null,
  onBreak: false,
  breakType: null,
  breakStartTime: null,
};

const AttendanceContext = createContext<AttendanceCtx>({
  attendance: DEFAULT,
  loading: false,
  totalWorkHours: null,
  refreshStatus: async () => {},
  setCheckedIn: () => {},
  checkOut: async () => {},
  startBreak: async () => {},
  endBreak: async () => {},
  reset: () => {},
  activeBreakId: null,
  activeBreakStartTime: null,
});

export function AttendanceProvider({ children }: { children: ReactNode }) {
  const [attendance, setAttendance] = useState<AttendanceStatus>(DEFAULT);
  const [loading, setLoading] = useState(false);
  const [activeBreakId, setActiveBreakId] = useState<string | null>(null);
  const [activeBreakStartTime, setActiveBreakStartTime] = useState<Date | null>(null);
  const [totalWorkHours, setTotalWorkHours] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      setLoading(true);
      const [status, activeBreak] = await Promise.all([
        getTodayStatus(),
        getActiveBreakApi().catch(() => null),
      ]);
      setAttendance({
        ...status,
        onBreak: !!activeBreak,
        breakType:      activeBreak?.breakType ?? null,
        breakStartTime: activeBreak?.startTime
          ? new Date(activeBreak.startTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: status.record?.session?.office?.timezone || 'Africa/Lagos' })
          : null,
      });
      if (activeBreak) {
        setActiveBreakId(activeBreak.id);
        setActiveBreakStartTime(new Date(activeBreak.startTime));
      } else {
        setActiveBreakId(null);
        setActiveBreakStartTime(null);
      }
      if (status.totalWorkHours) setTotalWorkHours(String(status.totalWorkHours));
    } catch {
      // Silently fail — employee may not have checked in yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => { void refreshStatus(); }, 5000);
    return () => clearInterval(timer);
  }, [refreshStatus]);

  const setCheckedIn = useCallback((time: string, status: string) => {
    setAttendance((p) => ({
      ...p, hasCheckedIn: true, hasCheckedOut: false,
      status, checkInTime: time, checkOutTime: null,
      onBreak: false, breakType: null, breakStartTime: null,
    }));
    setTotalWorkHours(null);
    setActiveBreakId(null);
    setActiveBreakStartTime(null);
  }, []);

  const checkOut = useCallback(async () => {
    const result = await checkOutApi();
    setAttendance((p) => ({
      ...p, hasCheckedOut: true,
      checkOutTime: result.checkOutTime,
      totalWorkHours: result.totalWorkHours,
      onBreak: false, breakType: null, breakStartTime: null,
    }));
    if (result.totalWorkHours) setTotalWorkHours(String(result.totalWorkHours));
    setActiveBreakId(null);
    setActiveBreakStartTime(null);
  }, []);

  const startBreak = useCallback(async (breakType: string) => {
    const result = await startBreakApi(breakType);
    const startTime = new Date(result.startTime);
    setActiveBreakId(result.id);
    setActiveBreakStartTime(startTime);
    setAttendance((p) => ({
      ...p, onBreak: true, breakType,
      breakStartTime: startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    }));
  }, []);

  const endBreak = useCallback(async () => {
    if (activeBreakId) await endBreakApi(activeBreakId);
    setActiveBreakId(null);
    setActiveBreakStartTime(null);
    setAttendance((p) => ({ ...p, onBreak: false, breakType: null, breakStartTime: null }));
    // Refresh so total break minutes update on Home screen
    await refreshStatus().catch(() => {});
  }, [activeBreakId, refreshStatus]);

  const reset = useCallback(() => {
    setAttendance(DEFAULT);
    setLoading(false);
    setActiveBreakId(null);
    setActiveBreakStartTime(null);
    setTotalWorkHours(null);
  }, []);

  return (
    <AttendanceContext.Provider value={{
      attendance, loading, totalWorkHours,
      refreshStatus, setCheckedIn, checkOut,
      startBreak, endBreak, reset,
      activeBreakId, activeBreakStartTime,
    }}>
      {children}
    </AttendanceContext.Provider>
  );
}

export const useAttendance = () => useContext(AttendanceContext);
