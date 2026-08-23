import { useCallback, useEffect, useState } from "react";
import {
  LogOut, LogIn as LogInIcon, Fingerprint, DoorOpen, CheckCircle2, Coffee,
  FileText, Loader2, Clock,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { FILE_BASE } from "../config";
import { BREAK_TYPES, type BreakType } from "../lib/constants";
import {
  getStatus, getCurrentSession, getActiveBreak, getLeaveBalances, requestChallenge,
  checkOut as apiCheckOut, type StatusRec, type BreakRec, type SessionInfo, type LeaveBalance,
} from "../services/data";
import type { ApiError } from "../services/api";
import StatusBadge from "../components/StatusBadge";
import ChallengeModal from "../components/ChallengeModal";

const fmt = (t: string | null, timezone?: string) =>
  t ? new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: timezone || "Africa/Lagos" }) : "—";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Home({
  onOpenBreak,
  onOpenLeave,
}: {
  onOpenBreak: (b: BreakType) => void;
  onOpenLeave: () => void;
}) {
  const { user, logout } = useAuth();
  const [status, setStatus] = useState<StatusRec | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [activeBreak, setActiveBreak] = useState<BreakRec | null>(null);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [challenge, setChallenge] = useState<{ sessionId: string; code: string } | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const [st, se, br, lb] = await Promise.allSettled([
      getStatus(), getCurrentSession(), getActiveBreak(), getLeaveBalances(),
    ]);
    setStatus(st.status === "fulfilled" ? st.value : null);
    setSession(se.status === "fulfilled" ? se.value : null);
    setActiveBreak(br.status === "fulfilled" ? br.value : null);
    setBalances(lb.status === "fulfilled" ? lb.value : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const hasCheckedIn = !!status?.clockInTime;
  const hasCheckedOut = !!status?.clockOutTime;
  const onBreak = !!activeBreak;
  const sid = status?.sessionId ?? session?.sessionId ?? "";
  const faceUri = user?.profileImageUrl ? `${FILE_BASE}${user.profileImageUrl}` : null;
  const timezone = session?.timezone || "Africa/Lagos";

  async function handleCheckIn() {
    setCheckingIn(true);
    try {
      const se = await getCurrentSession().catch(() => null);
      if (!se?.sessionId) { flash("No active session yet. Please wait for your admin."); return; }
      const { code } = await requestChallenge(se.sessionId);
      setChallenge({ sessionId: se.sessionId, code });
    } catch (e) {
      flash((e as ApiError).message);
    } finally {
      setCheckingIn(false);
    }
  }

  async function handleCheckOut() {
    if (!window.confirm("Are you sure you want to clock out?")) return;
    try {
      await apiCheckOut(sid);
      await load();
      flash("Checked out");
    } catch (e) {
      flash((e as ApiError).message);
    }
  }

  if (loading) {
    return <div className="flex min-h-full items-center justify-center"><Loader2 size={26} className="spin text-primary" /></div>;
  }

  return (
    <div className="mx-auto min-h-full w-full max-w-md px-5 pb-28 pt-5">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="text-[17px] font-bold text-ink">{greeting()}, {user?.firstName} 👋</p>
          <p className="mt-0.5 text-xs text-muted">{today}</p>
        </div>
        <button onClick={() => { if (window.confirm("Sign out?")) logout(); }} className="rounded-[10px] bg-gray100 p-1.5">
          <LogOut size={22} className="text-gray500" />
        </button>
      </div>

      {/* Brand row */}
      <div className="mb-5 flex items-center gap-3">
        {faceUri ? (
          <img src={faceUri} alt="" className="h-12 w-12 rounded-full border-2 border-primary object-cover" />
        ) : (
          <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-[14px] border border-line bg-white">
            <img src="/icon-192.png" alt="" className="h-10 w-10 object-contain" />
          </span>
        )}
        <div>
          <p className="text-lg font-extrabold text-ink">TimeLogic</p>
          <p className="text-xs text-muted">{user?.employeeCode ?? user?.email}</p>
        </div>
      </div>

      {/* Status card */}
      <div className="mb-4 rounded-[18px] bg-card p-[18px] shadow-md">
        <div className="mb-3.5 flex items-center justify-between">
          <p className="text-sm font-bold text-gray700">Today's Status</p>
          {status?.status ? <StatusBadge status={status.status} /> : null}
        </div>
        <div className="flex justify-around">
          {[
            { icon: LogInIcon, label: "Clock In", value: fmt(status?.clockInTime ?? null, timezone), color: "#1D4ED8" },
            { icon: DoorOpen, label: "Clock Out", value: fmt(status?.clockOutTime ?? null, timezone), color: "#F97316" },
            { icon: Clock, label: "Shift", value: user?.shiftType ?? "—", color: "#10B981" },
          ].map((it, i) => (
            <div key={it.label} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <it.icon size={18} style={{ color: it.color }} />
                <span className="mt-0.5 text-[11px] text-muted">{it.label}</span>
                <span className="text-sm font-bold text-ink">{it.value}</span>
              </div>
              {i < 2 && <div className="mx-3 h-9 w-px bg-line" />}
            </div>
          ))}
        </div>
        {onBreak && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-warning-bg p-2">
            <Coffee size={16} className="text-warning" />
              <span className="text-xs text-warning-dark">
              On {activeBreak?.breakType?.replace(/_/g, " ").toLowerCase()} break since {fmt(activeBreak?.startTime ?? null, timezone)}
            </span>
          </div>
        )}
      </div>

      {/* Check in / out / completed */}
      {!hasCheckedOut ? (
        !hasCheckedIn ? (
          <button
            onClick={handleCheckIn}
            disabled={checkingIn}
            className="mb-4 flex w-full items-center gap-3.5 rounded-[18px] bg-primary p-5 text-left shadow-lg active:scale-[0.99] disabled:opacity-70"
          >
            {checkingIn ? <Loader2 size={26} className="spin text-white" /> : <Fingerprint size={26} className="text-white" />}
            <div>
              <p className="text-lg font-extrabold text-white">{checkingIn ? "Checking in…" : "Check In"}</p>
              <p className="mt-0.5 text-xs text-white/75">{checkingIn ? "Please wait" : "Tap to start your day"}</p>
            </div>
          </button>
        ) : (
          <button
            onClick={handleCheckOut}
            className="mb-4 flex w-full items-center gap-3.5 rounded-[18px] border-2 border-primary bg-card p-5 text-left shadow-sm active:scale-[0.99]"
          >
            <DoorOpen size={26} className="text-primary" />
            <div>
              <p className="text-lg font-extrabold text-primary">Check Out</p>
              <p className="mt-0.5 text-xs text-muted">Tap to end your shift</p>
            </div>
          </button>
        )
      ) : (
        <div className="mb-4 flex items-center gap-2.5 rounded-[14px] bg-success-bg p-4">
          <CheckCircle2 size={26} className="text-success" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-success-dark">Day complete — see you next session!</p>
            {status?.totalWorkHours && (
              <p className="mt-0.5 text-xs text-success-dark">Total: {status.totalWorkHours} hours worked</p>
            )}
          </div>
        </div>
      )}

      {/* Quick actions */}
      {hasCheckedIn && !hasCheckedOut && (
        <div className="mb-5">
          <p className="mb-3 text-sm font-bold text-gray700">Quick Actions</p>
          <div className="flex flex-wrap gap-2.5">
            {BREAK_TYPES.map((b) => (
              <button
                key={b.type}
                onClick={() => onOpenBreak(b)}
                className="flex w-[30%] flex-col items-center gap-1 rounded-[14px] bg-card p-3 shadow-sm"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ backgroundColor: b.color + "18" }}>
                  <b.icon size={22} style={{ color: b.color }} />
                </span>
                <span className="text-xs font-bold text-ink">{b.label.split(" ")[0]}</span>
                <span className="text-[10px] text-muted">{b.maxMinutes}m max</span>
              </button>
            ))}
            <button onClick={onOpenLeave} className="flex w-[30%] flex-col items-center gap-1 rounded-[14px] bg-card p-3 shadow-sm">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-bg">
                <FileText size={22} className="text-primary" />
              </span>
              <span className="text-xs font-bold text-ink">Leave</span>
              <span className="text-[10px] text-muted">Request</span>
            </button>
          </div>
        </div>
      )}

      {/* Leave balances */}
      <div className="mb-2">
        <p className="mb-3 text-sm font-bold text-gray700">Leave Balances</p>
        {balances.length === 0 ? (
          <p className="text-[13px] italic text-muted">No leave data</p>
        ) : (
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {balances.slice(0, 5).map((lb) => (
              <div key={lb.type} className="w-[110px] flex-shrink-0 rounded-[14px] bg-card p-3.5 text-center shadow-sm">
                <span className="mx-auto mb-1.5 block h-2 w-2 rounded-full" style={{ backgroundColor: lb.color }} />
                <p className="mb-1 text-[10px] text-muted">{lb.label}</p>
                <p className="text-[22px] font-extrabold leading-none" style={{ color: lb.color }}>
                  {lb.remaining}<span className="text-[13px] text-muted">/{lb.entitled}</span>
                </p>
                <p className="mt-1 text-[10px] text-muted">days left</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md rounded-xl bg-gray800 px-4 py-3 text-center text-[13.5px] font-medium text-gray50 shadow-lg">
          {toast}
        </div>
      )}

      {challenge && (
        <ChallengeModal
          sessionId={challenge.sessionId}
          code={challenge.code}
          onClose={() => setChallenge(null)}
          onDone={(rec) => {
            setChallenge(null);
            load();
            const pen = rec?.penalty && rec.penalty > 0 ? ` · ₦${rec.penalty} penalty` : "";
            flash(`Checked in${rec?.status ? ` (${rec.status})` : ""}${pen}`);
          }}
        />
      )}
    </div>
  );
}
