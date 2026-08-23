import { useEffect, useState } from "react";
import { ArrowLeft, Play, StopCircle, Loader2, AlertTriangle } from "lucide-react";
import { BREAK_TYPES, type BreakType } from "../lib/constants";
import { getActiveBreak, startBreak, endBreak, type BreakRec } from "../services/data";
import type { ApiError } from "../services/api";
import { useAuth } from "../context/AuthContext";

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export default function Break({ initial, onBack }: { initial: BreakType; onBack: () => void }) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<BreakType>(initial);
  const [active, setActive] = useState<BreakRec | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getActiveBreak().then((b) => setActive(b)).catch(() => {}).finally(() => setReady(true));
  }, []);

  const current = active ? BREAK_TYPES.find((b) => b.type === active.breakType) ?? selected : selected;

  useEffect(() => {
    if (!active) { setElapsed(0); return; }
    const start = new Date(active.startTime).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [active]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const over = mins >= current.maxMinutes;

  async function handleStart() {
    setBusy(true); setError("");
    try {
      const b = await startBreak(selected.type);
      setActive(b ?? { id: "", breakType: selected.type, startTime: new Date().toISOString(), endTime: null, durationMinutes: null });
      // refetch to get the real record id
      const fresh = await getActiveBreak().catch(() => null);
      if (fresh) setActive(fresh);
    } catch (e) { setError((e as ApiError).message); }
    finally { setBusy(false); }
  }

  async function handleEnd() {
    if (!active?.id) { onBack(); return; }
    if (!window.confirm(`End your ${current.label}?\nDuration: ${pad(mins)}m ${pad(secs)}s`)) return;
    setBusy(true); setError("");
    try {
      await endBreak(active.id);
      onBack();
    } catch (e) { setError((e as ApiError).message); setBusy(false); }
  }

  const fmtStart = active ? new Date(active.startTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: user?.organization?.timezone || "Africa/Lagos" }) : "—";

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
      {/* top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => (active ? setError("Please end your break before leaving.") : onBack())}
          className="rounded-[10px] bg-gray100 p-1.5"
        >
          <ArrowLeft size={22} className="text-gray700" />
        </button>
        <p className="text-[17px] font-bold text-ink">{active ? "On Break" : "Take a Break"}</p>
        <span className="w-9" />
      </div>

      <div className="flex-1 px-5">
        {!active ? (
          <div className="mt-2">
            <p className="mb-3 text-[13px] font-bold text-gray600">Select Break Type</p>
            <div className="flex flex-wrap gap-2.5">
              {BREAK_TYPES.map((bt) => {
                const on = selected.type === bt.type;
                return (
                  <button
                    key={bt.type}
                    onClick={() => setSelected(bt)}
                    className="relative flex w-[47%] flex-col items-center gap-1.5 rounded-[14px] border bg-gray50 p-3.5"
                    style={on ? { borderColor: bt.color, borderWidth: 2, backgroundColor: bt.color + "10" } : { borderColor: "var(--c-gray200)" }}
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ backgroundColor: bt.color + "18" }}>
                      <bt.icon size={22} style={{ color: bt.color }} />
                    </span>
                    <span className="text-[13px] font-bold text-ink">{bt.label}</span>
                    <span className="text-[11px] text-muted">{bt.maxMinutes}m max</span>
                    {on && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full" style={{ backgroundColor: bt.color }} />}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 pt-6">
            <span className="grid h-[72px] w-[72px] place-items-center rounded-[20px]" style={{ backgroundColor: current.color + "18" }}>
              <current.icon size={36} style={{ color: current.color }} />
            </span>
            <p className="text-[22px] font-extrabold text-ink">{current.label}</p>
            <p className="text-[13px] text-gray400">Started at {fmtStart}</p>
            <div
              className={`mt-2 grid h-[180px] w-[180px] place-items-center rounded-full border-[6px] shadow-md ${!over ? "pulse-ring" : ""}`}
              style={{ borderColor: over ? "#EF4444" : current.color }}
            >
              <span className="text-[40px] font-extrabold" style={{ color: over ? "#EF4444" : current.color }}>
                {pad(mins)}:{pad(secs)}
              </span>
              <span className="mt-1 text-xs text-gray400">{over ? "⚠ Over limit!" : `/ ${current.maxMinutes}:00 max`}</span>
            </div>
            {over && (
              <div className="mt-2 flex w-[90%] items-center gap-1.5 rounded-[10px] bg-danger-bg p-3">
                <AlertTriangle size={16} className="text-danger-dark" />
                <span className="text-xs leading-4 text-danger-dark">You've exceeded the maximum break duration. Please return to work.</span>
              </div>
            )}
          </div>
        )}
        {error && <p className="mt-4 text-center text-[13px] font-medium text-danger">{error}</p>}
      </div>

      {/* action */}
      <div className="p-6 pb-8">
        {!active ? (
          <button
            onClick={handleStart}
            disabled={busy || !ready}
            className="flex w-full items-center justify-center gap-2.5 rounded-[14px] py-4 font-bold text-white shadow-md disabled:opacity-60"
            style={{ backgroundColor: selected.color }}
          >
            {busy ? <Loader2 size={20} className="spin" /> : <Play size={20} />}
            {busy ? "Starting…" : `Start ${selected.label}`}
          </button>
        ) : (
          <button
            onClick={handleEnd}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2.5 rounded-[14px] border-2 border-danger bg-danger-bg py-4 font-bold text-danger disabled:opacity-60"
          >
            {busy ? <Loader2 size={20} className="spin" /> : <StopCircle size={20} />}
            {busy ? "Ending…" : "End Break"}
          </button>
        )}
      </div>
    </div>
  );
}
