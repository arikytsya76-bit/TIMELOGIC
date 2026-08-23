import { useState } from "react";
import { Mail, Lock, LogIn, Loader2, Info } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError("Enter your email address and password.");
      return;
    }
    setError("");
    setLoading(true);
    const res = await login(identifier.trim(), password);
    setLoading(false);
    if (!res.ok) setError(res.error ?? "Login failed.");
  }

  const wrap = "flex items-center gap-2 rounded-xl border-[1.5px] border-gray200 bg-gray50 px-3 h-[50px]";
  const input = "flex-1 bg-transparent text-[15px] text-ink outline-none placeholder-gray400";

  return (
    <div className="min-h-full overflow-y-auto px-5 py-8">
      <div className="mx-auto w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 grid h-20 w-20 place-items-center overflow-hidden rounded-[20px] bg-white shadow-lg">
            <img src="/icon-192.png" alt="TimeLogic" className="h-16 w-16 object-contain" />
          </div>
          <h1 className="text-[26px] font-extrabold tracking-tight text-ink">TimeLogic</h1>
          <p className="mt-1.5 px-4 text-[13px] leading-[18px] text-muted">
            Sign in with your credentials provided by your administrator
          </p>
        </div>

        {/* Card */}
        <form onSubmit={submit} className="rounded-[20px] bg-card p-6 shadow-md">
          <h2 className="text-xl font-bold text-ink">Welcome Back</h2>
          <p className="mb-5 mt-1 text-[13px] leading-[18px] text-muted">
            Enter the email address and password your company administrator provided you.
          </p>

          <label className="mb-1.5 block text-[13px] font-semibold text-gray700">Work Email Address</label>
          <div className={wrap}>
            <Mail size={19} className="text-gray400" />
            <input
              className={input}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="your.email@company.com"
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="email"
            />
          </div>

          <label className="mb-1.5 mt-4 block text-[13px] font-semibold text-gray700">Password</label>
          <div className={wrap}>
            <Lock size={19} className="text-gray400" />
            <input
              className={input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
          </div>

          {error && <p className="mt-3 text-[13px] font-medium text-danger">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-5 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-white shadow-lg active:scale-[0.99] disabled:opacity-70"
          >
            {loading ? <Loader2 size={20} className="spin" /> : <LogIn size={20} />}
            {loading ? "Signing in…" : "Sign In"}
          </button>

          <div className="mt-4 flex items-start gap-1.5">
            <Info size={14} className="mt-0.5 flex-shrink-0 text-gray400" />
            <p className="text-[12px] leading-4 text-gray400">
              Your login credentials are provided by your company administrator. Contact them if you need help.
            </p>
          </div>
        </form>

        <p className="mt-6 text-center text-[11px] text-gray400">© {new Date().getFullYear()} TimeLogic · v1.0.0</p>
      </div>
    </div>
  );
}
