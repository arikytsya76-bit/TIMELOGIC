import { FormEvent, useEffect, useState } from "react";
import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  ImagePlus,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";

type Office = {
  name: string;
  address: string;
  timezone: string;
  openTime: string;
  closeTime: string;
  breakMinutes: number;
  graceMinutes: number;
  lateAfterMinutes: number;
  gracePenalty: number;
  latePenalty: number;
  breakStart: string;
  breakEnd: string;
  wifiSSID: string;
  publicIp: string;
  weeklySchedule: Record<string, { openTime: string; closeTime: string }>;
};
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const defaultWeeklySchedule = () => Object.fromEntries(
  DAYS.map((day) => [day, day === 'sunday' ? { openTime: '', closeTime: '' } : { openTime: '08:00', closeTime: '17:00' }]),
);
type Department = { name: string; breakStart: string; breakEnd: string };
type Organization = {
  id: string;
  name: string;
  departments: { id: string; name: string }[];
};
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '');
const API = `${configuredApiUrl || 'https://timelogic.onrender.com/api'}/register`;
const zones = [
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Nairobi",
  "UTC",
  "Europe/London",
  "America/New_York",
  "Asia/Dubai",
];
const industries = [
  "Technology",
  "Finance",
  "Healthcare",
  "Education",
  "Logistics",
  "Retail",
  "Manufacturing",
  "Non-profit",
  "Government",
  "Other",
];
const freshOffice = (): Office => ({
  name: "Main Office",
  address: "",
  timezone: "Africa/Lagos",
  openTime: "08:00",
  closeTime: "17:00",
  breakMinutes: 60,
  graceMinutes: 30,
  lateAfterMinutes: 90,
  gracePenalty: 0,
  latePenalty: 0,
  breakStart: "13:00",
  breakEnd: "14:00",
  wifiSSID: "",
  publicIp: "",
  weeklySchedule: defaultWeeklySchedule(),
});
const input = "field";

async function send(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(data?.message || `Request failed (${res.status})`);
  return data.data;
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
function Stepper({ step }: { step: number }) {
  return (
    <div className="stepper">
      {["Org info", "Offices", "Departments", "Admin account"].map(
        (label, i) => (
          <div
            className={
              step === i + 1
                ? "step active"
                : step > i + 1
                  ? "step done"
                  : "step"
            }
            key={label}
          >
            <span>{step > i + 1 ? <Check size={14} /> : i + 1}</span>
            {label}
          </div>
        ),
      )}
    </div>
  );
}

function OrganizationForm({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    industry: "Technology",
    subscriptionTier: "starter",
    allowDeviceCheckIn: true,
    allowManualCheckIn: true,
    hasStudents: false,
    openingTime: "08:00",
    timezone: "Africa/Lagos",
    offices: [freshOffice()],
    departments: [
      { name: "General", breakStart: "13:00", breakEnd: "14:00" },
    ] as Department[],
    admin: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
    },
  });
  const update = (key: string, value: unknown) =>
    setForm((p) => ({ ...p, [key]: value }));
  const updateOffice = (i: number, key: keyof Office, value: string | number) =>
    setForm((p) => ({
      ...p,
      offices: p.offices.map((o, n) => (n === i ? { ...o, [key]: value } : o)),
    }));
  const updateOfficeDay = (i: number, day: string, field: 'openTime' | 'closeTime', value: string) =>
    setForm((p) => ({ ...p, offices: p.offices.map((o, n) => n === i ? { ...o, weeklySchedule: { ...o.weeklySchedule, [day]: { ...o.weeklySchedule[day], [field]: value } } } : o) }));
  const updateDepartment = (i: number, key: keyof Department, value: string) =>
    setForm((p) => ({
      ...p,
      departments: p.departments.map((d, n) =>
        n === i ? { ...d, [key]: value } : d,
      ),
    }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (form.admin.password.length < 8) {
      setError("Admin password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await send("/organizations", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setMessage(
        "Organization registered. The admin can now log in to the Desktop app with the password created here.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }
  if (message) return <Success message={message} onBack={onBack} />;
  return (
    <form onSubmit={submit} className="form-panel">
      <Stepper step={step} />
      {error && <div className="error">{error}</div>}
      {step === 1 && (
        <section>
          <h2>Organization information</h2>
          <p className="muted">
            Set the attendance capabilities and the company schedule used by
            TimeLogic.
          </p>
          <div className="grid">
            <Field label="Organization name *">
              <input
                className={input}
                required
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Acme Learning Group"
              />
            </Field>
            <Field label="Industry">
              <select
                className={input}
                value={form.industry}
                onChange={(e) => update("industry", e.target.value)}
              >
                {industries.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Plan">
              <select
                className={input}
                value={form.subscriptionTier}
                onChange={(e) => update("subscriptionTier", e.target.value)}
              >
                <option value="starter">Starter</option>
                <option value="business">Business</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </Field>
            <Field label="Company opening time">
              <input
                className={input}
                type="time"
                value={form.openingTime}
                onChange={(e) => update("openingTime", e.target.value)}
              />
            </Field>
            <Field label="Company timezone">
              <select
                className={input}
                value={form.timezone}
                onChange={(e) => update("timezone", e.target.value)}
              >
                {zones.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="toggle-grid">
            <Toggle
              label="Phone / device check-in"
              checked={form.allowDeviceCheckIn}
              onChange={(x) => update("allowDeviceCheckIn", x)}
            />
            <Toggle
              label="Manual admin check-in"
              checked={form.allowManualCheckIn}
              onChange={(x) => update("allowManualCheckIn", x)}
            />
            <Toggle
              label="Student attendance"
              checked={form.hasStudents}
              onChange={(x) => update("hasStudents", x)}
            />
          </div>
        </section>
      )}
      {step === 2 && (
        <section>
          <div className="section-head">
            <div>
              <h2>Offices and work rules</h2>
              <p className="muted">
                Add every location and its own hours, network, break and
                lateness policy.
              </p>
            </div>
            <button
              type="button"
              className="text-btn"
              onClick={() =>
                update("offices", [...form.offices, freshOffice()])
              }
            >
              <Plus size={16} /> Add office
            </button>
          </div>
          {form.offices.map((o, i) => (
            <div className="subpanel" key={i}>
              <div className="subhead">
                <b>Office {i + 1}</b>
                {form.offices.length > 1 && (
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() =>
                      update(
                        "offices",
                        form.offices.filter((_, n) => n !== i),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <div className="grid">
                <Field label="Name">
                  <input
                    className={input}
                    required
                    value={o.name}
                    onChange={(e) => updateOffice(i, "name", e.target.value)}
                  />
                </Field>
                <Field label="Address">
                  <input
                    className={input}
                    value={o.address}
                    onChange={(e) => updateOffice(i, "address", e.target.value)}
                  />
                </Field>
                <Field label="Timezone">
                  <select
                    className={input}
                    value={o.timezone}
                    onChange={(e) =>
                      updateOffice(i, "timezone", e.target.value)
                    }
                  >
                    {zones.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Open">
                  <input
                    className={input}
                    type="time"
                    value={o.openTime}
                    onChange={(e) =>
                      updateOffice(i, "openTime", e.target.value)
                    }
                  />
                </Field>
                <Field label="Close">
                  <input
                    className={input}
                    type="time"
                    value={o.closeTime}
                    onChange={(e) =>
                      updateOffice(i, "closeTime", e.target.value)
                    }
                  />
                </Field>
                <div className="schedule-grid">
                  <strong>Weekly opening and closing times</strong>
                  <div className="schedule-heading"><span>Day</span><span>Open</span><span>Close</span></div>
                  {DAYS.map((day) => (
                    <div className="schedule-row" key={day}>
                      <span>{day[0].toUpperCase() + day.slice(1)}</span>
                      <input className={input} type="time" value={o.weeklySchedule[day]?.openTime ?? ''} onChange={(e) => updateOfficeDay(i, day, 'openTime', e.target.value)} />
                      <input className={input} type="time" value={o.weeklySchedule[day]?.closeTime ?? ''} onChange={(e) => updateOfficeDay(i, day, 'closeTime', e.target.value)} />
                    </div>
                  ))}
                  <p className="muted">Leave both Sunday fields blank when the office is closed.</p>
                </div>
                <Field label="Break minutes">
                  <input
                    className={input}
                    type="number"
                    min="0"
                    value={o.breakMinutes}
                    onChange={(e) =>
                      updateOffice(i, "breakMinutes", +e.target.value)
                    }
                  />
                </Field>
                <Field label="Grace minutes">
                  <input
                    className={input}
                    type="number"
                    min="0"
                    value={o.graceMinutes}
                    onChange={(e) =>
                      updateOffice(i, "graceMinutes", +e.target.value)
                    }
                  />
                </Field>
                <Field label="Late after opening">
                  <input
                    className={input}
                    type="number"
                    min={Math.max(1, o.graceMinutes)}
                    value={o.lateAfterMinutes}
                    onChange={(e) =>
                      updateOffice(i, "lateAfterMinutes", +e.target.value)
                    }
                  />
                </Field>
                <Field label="Penalty after grace (NGN)">
                  <input
                    className={input}
                    type="number"
                    min="0"
                    value={o.gracePenalty}
                    onChange={(e) => updateOffice(i, "gracePenalty", +e.target.value)}
                  />
                </Field>
                <Field label="Late penalty (NGN)">
                  <input
                    className={input}
                    type="number"
                    min="0"
                    value={o.latePenalty}
                    onChange={(e) =>
                      updateOffice(i, "latePenalty", +e.target.value)
                    }
                  />
                </Field>
                <Field label="Wi-Fi SSID">
                  <input
                    className={input}
                    value={o.wifiSSID}
                    onChange={(e) =>
                      updateOffice(i, "wifiSSID", e.target.value)
                    }
                  />
                </Field>
                <Field label="Office public IP">
                  <input
                    className={input}
                    value={o.publicIp}
                    onChange={(e) =>
                      updateOffice(i, "publicIp", e.target.value)
                    }
                  />
                </Field>
              </div>
            </div>
          ))}
        </section>
      )}
      {step === 3 && (
        <section>
          <div className="section-head">
            <div>
              <h2>Departments</h2>
              <p className="muted">
                Employees can be assigned to these departments later.
              </p>
            </div>
            <button
              type="button"
              className="text-btn"
              onClick={() =>
                update("departments", [
                  ...form.departments,
                  { name: "", breakStart: "13:00", breakEnd: "14:00" },
                ])
              }
            >
              <Plus size={16} /> Add department
            </button>
          </div>
          {form.departments.map((d, i) => (
            <div className="row-panel" key={i}>
              <Field label={`Department ${i + 1}`}>
                <input
                  className={input}
                  required
                  value={d.name}
                  onChange={(e) => updateDepartment(i, "name", e.target.value)}
                  placeholder="Operations"
                />
              </Field>
              <Field label="Break starts">
                <input
                  className={input}
                  type="time"
                  value={d.breakStart}
                  onChange={(e) =>
                    updateDepartment(i, "breakStart", e.target.value)
                  }
                />
              </Field>
              <Field label="Break ends">
                <input
                  className={input}
                  type="time"
                  value={d.breakEnd}
                  onChange={(e) =>
                    updateDepartment(i, "breakEnd", e.target.value)
                  }
                />
              </Field>
              {form.departments.length > 1 && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() =>
                    update(
                      "departments",
                      form.departments.filter((_, n) => n !== i),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      {step === 4 && (
        <section>
          <h2>Admin account</h2>
          <p className="muted">
            These credentials belong to the organization administrator and work
            in the TimeLogic Desktop app.
          </p>
          <div className="grid">
            <Field label="First name *">
              <input
                className={input}
                required
                value={form.admin.firstName}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    admin: { ...p.admin, firstName: e.target.value },
                  }))
                }
              />
            </Field>
            <Field label="Last name *">
              <input
                className={input}
                required
                value={form.admin.lastName}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    admin: { ...p.admin, lastName: e.target.value },
                  }))
                }
              />
            </Field>
            <Field label="Email *">
              <input
                className={input}
                type="email"
                required
                value={form.admin.email}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    admin: { ...p.admin, email: e.target.value },
                  }))
                }
              />
            </Field>
            <Field label="Password *">
              <input
                className={input}
                type="password"
                required
                minLength={8}
                value={form.admin.password}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    admin: { ...p.admin, password: e.target.value },
                  }))
                }
              />
            </Field>
          </div>
        </section>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="quiet-btn"
          onClick={step === 1 ? onBack : () => setStep(step - 1)}
        >
          <ChevronLeft size={17} /> Back
        </button>
        {step < 4 ? (
          <button
            type="button"
            className="primary-btn"
            onClick={() => setStep(step + 1)}
          >
            Continue <ChevronRight size={17} />
          </button>
        ) : (
          <button className="primary-btn" disabled={busy}>
            {busy ? "Registering…" : "Register organization"}{" "}
            <ShieldCheck size={17} />
          </button>
        )}
      </div>
    </form>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
function Success({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="success">
      <div className="success-mark">
        <Check />
      </div>
      <h2>Registration complete</h2>
      <p>{message}</p>
      <button className="primary-btn" onClick={onBack}>
        Register another
      </button>
    </div>
  );
}

function EmployeeForm({ onBack }: { onBack: () => void }) {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [data, setData] = useState({
    organizationName: "",
    departmentId: "",
    firstName: "",
    lastName: "",
    email: "",
    employeeCode: "",
    password: "",
    phone: "",
    shiftType: "MORNING",
    checkInMethod: "PHONE",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    send("/organizations")
      .then(setOrgs)
      .catch((e) => setError(e.message));
  }, []);
  function set(key: string, value: string) {
    setData((p) => ({ ...p, [key]: value }));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const body = new FormData();
      Object.entries(data).forEach(([k, v]) => body.append(k, v));
      if (photo) body.append("photo", photo);
      await send("/employees", { method: "POST", body });
      setDone(
        "Employee registered. They can use the password created here to sign in through the employee app.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }
  if (done) return <Success message={done} onBack={onBack} />;
  return (
    <form onSubmit={submit} className="form-panel">
      <div className="form-kicker">
        <Users size={18} /> Employee registration
      </div>
      {error && <div className="error">{error}</div>}
      <section>
        <h2>Employee details</h2>
        <p className="muted">
          Type the registered organization name. Unregistered organizations cannot
          add employees.
        </p>
        <div className="grid">
          <Field label="Organization name *">
            <input
              className={input}
              required
              value={data.organizationName}
              onChange={(e) => set("organizationName", e.target.value)}
              placeholder="Type the registered organization name"
            />
          </Field>
          <Field label="Department">
            <select
              className={input}
              value={data.departmentId}
              onChange={(e) => set("departmentId", e.target.value)}
              disabled={!data.organizationName}
            >
              <option value="">No department</option>
              {(orgs.find((o) => o.name.toLowerCase() === data.organizationName.trim().toLowerCase())?.departments ?? []).map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </Field>
          <Field label="First name *">
            <input
              className={input}
              required
              value={data.firstName}
              onChange={(e) => set("firstName", e.target.value)}
            />
          </Field>
          <Field label="Last name *">
            <input
              className={input}
              required
              value={data.lastName}
              onChange={(e) => set("lastName", e.target.value)}
            />
          </Field>
          <Field label="Email *">
            <input
              className={input}
              type="email"
              required
              value={data.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </Field>
          <Field label="Employee identifier">
            <input
              className={input}
              required
              value={data.employeeCode}
              onChange={(e) => set("employeeCode", e.target.value)}
              placeholder="EMP001"
            />
          </Field>
          <Field label="Password *">
            <input
              className={input}
              type="password"
              minLength={8}
              required
              value={data.password}
              onChange={(e) => set("password", e.target.value)}
            />
          </Field>
          <Field label="Phone">
            <input
              className={input}
              value={data.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
          <Field label="Shift">
            <select
              className={input}
              value={data.shiftType}
              onChange={(e) => set("shiftType", e.target.value)}
            >
              <option>MORNING</option>
              <option>AFTERNOON</option>
              <option>FLEXIBLE</option>
            </select>
          </Field>
          <Field label="Check-in method">
            <select
              className={input}
              value={data.checkInMethod}
              onChange={(e) => set("checkInMethod", e.target.value)}
            >
              <option value="PHONE">Phone / device</option>
              <option value="MANUAL">Manual by admin</option>
              <option value="BOTH">Phone + manual</option>
            </select>
          </Field>
          <Field label="Profile picture">
            <span className="upload">
              <ImagePlus size={18} />
              {photo ? photo.name : "Choose image"}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
            </span>
          </Field>
        </div>
      </section>
      <div className="form-actions">
        <button type="button" className="quiet-btn" onClick={onBack}>
          <ChevronLeft size={17} /> Back
        </button>
        <button className="primary-btn" disabled={busy || !orgs.length}>
          {busy ? "Registering…" : "Register employee"}{" "}
          <ShieldCheck size={17} />
        </button>
      </div>
    </form>
  );
}

export default function App() {
  const [mode, setMode] = useState<"choose" | "organization" | "employee">(
    "choose",
  );
  return (
    <main>
      <div className="brand">
        <div className="brand-mark">
          <img src="/logo.jpeg" alt="TimeLogic" className="brand-logo" />
        </div>
        <span>
          TimeLogic <b>Registration</b>
        </span>
      </div>
      <div className="shell">
        {mode === "choose" ? (
          <>
            <div className="eyebrow">CONNECTED ONBOARDING</div>
            <h1>
              Bring your team into <em>TimeLogic.</em>
            </h1>
            <p className="lead">
              Complete one secure registration and the organization, offices,
              departments, admin account and employees flow straight into your
              attendance system.
            </p>
            <div className="choice-grid">
              <button
                className="choice"
                onClick={() => setMode("organization")}
              >
                <Building2 />
                <span>
                  <b>Register organization</b>
                  <small>
                    Create offices, rules and the first admin account.
                  </small>
                </span>
                <ChevronRight />
              </button>
              <button className="choice" onClick={() => setMode("employee")}>
                <CircleUserRound />
                <span>
                  <b>Register employee</b>
                  <small>
                    Add someone to an organization that already exists.
                  </small>
                </span>
                <ChevronRight />
              </button>
            </div>
            <div className="trust">
              <ShieldCheck size={17} /> Submissions are checked against existing
              TimeLogic records before they are stored.
            </div>
          </>
        ) : mode === "organization" ? (
          <OrganizationForm onBack={() => setMode("choose")} />
        ) : (
          <EmployeeForm onBack={() => setMode("choose")} />
        )}
      </div>
    </main>
  );
}
