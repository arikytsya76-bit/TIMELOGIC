import { LogIn, LogOut, ArrowRight, Wifi, Smartphone } from "lucide-react";
import StatusBadge from "./StatusBadge";
import type { HistRec } from "../services/data";

const fmt = (t: string | null, timezone?: string | null) =>
  t ? new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: timezone || "Africa/Lagos" }) : "—";

export default function AttendanceCard({ r }: { r: HistRec }) {
  const date = new Date(r.date);
  const timezone = r.timezone || r.session?.office?.timezone || "Africa/Lagos";
  const dayLabel = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const bMin = r.totalBreakMinutes ?? 0;
  const totalBreak = bMin > 0 ? `${Math.floor(bMin / 60)}h ${bMin % 60}m` : "—";
  const isWeekend = r.status === "WEEKEND";
  const isAbsent = r.status === "ABSENT";
  const isLeave = r.status === "ON_LEAVE";

  return (
    <div className={`flex items-center rounded-2xl p-3.5 shadow-sm ${isWeekend ? "bg-gray50 opacity-70" : "bg-card"}`}>
      <div className="w-[110px] space-y-1">
        <p className="text-xs font-semibold text-gray600">{dayLabel}</p>
        <StatusBadge status={r.status} small />
      </div>
      <div className="flex-1 border-l border-gray100 pl-3">
        {isWeekend ? (
          <p className="text-[13px] italic text-gray400">Rest day</p>
        ) : isAbsent || isLeave ? (
          <p className="text-[13px] italic text-gray400">{isLeave ? "On approved leave" : "No record"}</p>
        ) : (
          <>
            <div className="mb-1 flex items-center gap-2">
              <span className="flex items-center gap-1">
                <LogIn size={14} className="text-success" />
                <span className="text-[13px] font-bold text-gray800">{fmt(r.clockInTime, timezone)}</span>
              </span>
              <ArrowRight size={12} className="text-gray300" />
              <span className="flex items-center gap-1">
                <LogOut size={14} className="text-orange" />
                <span className="text-[13px] font-bold text-gray800">{fmt(r.clockOutTime, timezone)}</span>
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-gray500">
              <span>{r.totalWorkHours ?? "—"}</span>
              <span className="text-gray300">·</span>
              <span>Break {totalBreak}</span>
            </div>
            {(r.wifiVerified || r.deviceVerified) && (
              <div className="mt-1 flex gap-1.5">
                {r.wifiVerified && <Wifi size={12} className="text-success" />}
                {r.deviceVerified && <Smartphone size={12} className="text-success" />}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
