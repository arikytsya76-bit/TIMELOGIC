import { useCallback, useEffect, useState } from "react";
import { Loader2, CalendarX, RefreshCw } from "lucide-react";
import { getHistory, type HistRec } from "../services/data";
import AttendanceCard from "../components/AttendanceCard";

const FILTERS = ["All", "Present", "Late", "Absent", "Leave"] as const;
const MATCH: Record<string, string> = { Present: "PRESENT", Late: "LATE", Absent: "ABSENT", Leave: "ON_LEAVE" };

export default function History() {
  const [records, setRecords] = useState<HistRec[]>([]);
  const [filter, setFilter] = useState<string>("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true); setError("");
      const data = await getHistory();
      setRecords(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load history.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const present = records.filter((r) => r.status === "PRESENT").length;
  const late = records.filter((r) => r.status === "LATE" || r.status === "COMPLETELY_LATE").length;
  const absent = records.filter((r) => r.status === "ABSENT").length;
  const rate = `${Math.round((present / (present + late + absent || 1)) * 100)}%`;
  const filtered = records.filter((r) => filter === "All" || (filter === "Late" ? r.status === "LATE" || r.status === "COMPLETELY_LATE" : r.status === MATCH[filter]));

  const summary = [
    { label: "Present", count: present, color: "#10B981" },
    { label: "Late", count: late, color: "#F59E0B" },
    { label: "Absent", count: absent, color: "#EF4444" },
    { label: "Rate", count: rate, color: "#1D4ED8" },
  ];

  return (
    <div className="mx-auto min-h-full w-full max-w-md pb-28">
      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <div>
          <h1 className="text-[22px] font-extrabold text-ink">Attendance History</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
          </p>
        </div>
        <button onClick={load} className="rounded-[10px] bg-gray100 p-2 text-gray500"><RefreshCw size={16} /></button>
      </div>

      <div className="flex gap-2.5 px-4 py-3">
        {summary.map((s) => (
          <div key={s.label} className="flex-1 rounded-xl bg-card p-2.5 text-center shadow-sm" style={{ borderTop: `3px solid ${s.color}` }}>
            <p className="text-xl font-extrabold" style={{ color: s.color }}>{s.count}</p>
            <p className="mt-0.5 text-[10px] text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 px-4 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
              filter === f ? "border-primary bg-primary text-white" : "border-gray200 bg-gray100 text-gray600"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center pt-16"><Loader2 size={28} className="spin text-primary" /></div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 pt-16 text-center">
          <p className="text-sm text-danger">{error}</p>
          <button onClick={load} className="rounded-lg bg-primary-bg px-5 py-2 text-sm font-bold text-primary">Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 pt-16 text-gray400">
          <CalendarX size={48} />
          <p className="text-sm">No records found</p>
        </div>
      ) : (
        <div className="space-y-2.5 px-4 pt-1">
          {filtered.map((r) => <AttendanceCard key={r.id} r={r} />)}
        </div>
      )}
    </div>
  );
}
