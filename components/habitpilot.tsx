"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  Archive,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Compass,
  Flame,
  Footprints,
  LayoutGrid,
  Leaf,
  Loader2,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings2,
  Sparkles,
  Sun,
  Target,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
const AnalyticsView = dynamic(() => import("./analytics-view"), {
  loading: () => <p className="card">Loading your analytics…</p>,
});
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import {
  State,
  Habit,
  Draft,
  addDays,
  localDate,
  dates,
  weekday,
  scheduleAt,
  eligible,
  complete,
  stats,
  streaks,
  valueAt,
  checkIn,
  makeHabit,
  reviseHabit,
  draftOf,
  draftSchema,
  stateSchema,
  emptyState,
  demoState,
  fallbackSuggestion,
} from "@/lib/habitpilot/core";
import { ruleResponse } from "@/lib/habitpilot/ai";
type ApiEnvelope = {
  error?: string;
  supabase: boolean;
  authenticated: boolean;
  state: State;
  message: string;
  drafts: Draft[];
  source: string;
};
const STORAGE = "habitpilot-demo-v1";
const NAV = [
  { id: "today", label: "Today", href: "/", icon: LayoutGrid },
  { id: "habits", label: "My habits", href: "/habits", icon: Target },
  { id: "analytics", label: "Analytics", href: "/analytics", icon: TrendingUp },
  { id: "coach", label: "Habit coach", href: "/coach", icon: Sparkles },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings2 },
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const icons = [BookOpen, Code2, Footprints, Leaf];
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function download(s: State) {
  const u = URL.createObjectURL(
    new Blob([JSON.stringify(s, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = "habitpilot-export-" + localDate(s.profile.timezone) + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch("/api/" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const v = (await r.json()) as ApiEnvelope;
  if (!r.ok) throw new Error(v.error || "Something went wrong. Please retry.");
  return v;
}
export default function HabitPilot({ page = "today" }: { page?: string }) {
  const [s, setS] = useState<State | null>(null),
    [mode, setMode] = useState<"demo" | "account">("demo"),
    [configured, setConfigured] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null),
    [editId, setEditId] = useState<string | null>(null),
    [detail, setDetail] = useState<string | null>(null),
    [confirm, setConfirm] = useState<{ text: string; run: () => void } | null>(
      null,
    ),
    [onboarding, setOnboarding] = useState(false),
    [auth, setAuth] = useState(false),
    [authKind, setAuthKind] = useState("login"),
    [filter, setFilter] = useState("all"),
    [offset, setOffset] = useState(0);
  const [prompt, setPrompt] = useState(""),
    [kind, setKind] = useState("draft"),
    [aiBusy, setAiBusy] = useState(false),
    [answer, setAnswer] = useState<{
      message: string;
      drafts: Draft[];
      source: string;
    } | null>(null),
    [selected, setSelected] = useState<string[]>([]);
  const lock = useRef(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [, tick] = useState(0);
  const [entryDate, setEntryDate] = useState<string | null>(null);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  async function load() {
    setError("");
    try {
      const c = await api("config");
      setConfigured(c.supabase);
      if (c.supabase) {
        const r = await api("state");
        if (r.authenticated) {
          setMode("account");
          setS(stateSchema.parse(r.state));
          return;
        }
      }
      const raw = localStorage.getItem(STORAGE);
      setMode("demo");
      const initial = raw
        ? stateSchema.parse(JSON.parse(raw))
        : demoState(Intl.DateTimeFormat().resolvedOptions().timeZone);
      if (!raw) localStorage.setItem(STORAGE, JSON.stringify(initial));
      setS(initial);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    const sync = (e: StorageEvent) => {
      if (modeRef.current === "demo" && e.key === STORAGE && e.newValue) {
        try {
          setS(stateSchema.parse(JSON.parse(e.newValue)));
        } catch {
          setError("Could not read the updated demo data.");
        }
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (!s) return;
    const m = matchMedia("(prefers-color-scheme: dark)");
    const update = () =>
      document.documentElement.classList.toggle(
        "dark",
        s.profile.theme === "dark" ||
          (s.profile.theme === "system" && m.matches),
      );
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, [s?.profile.theme]);
  async function save(next: State) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      stateSchema.parse(next);
      if (mode === "demo") {
        const raw = localStorage.getItem(STORAGE);
        if (raw && JSON.parse(raw).revision !== s?.revision)
          throw new Error("Data changed in another tab. Reload before saving.");
        next = { ...next, revision: next.revision + 1 };
        localStorage.setItem(STORAGE, JSON.stringify(next));
      } else {
        const r = await api("state", "PUT", next);
        next = stateSchema.parse(r.state);
      }
      setS(next);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  function newHabit(d?: Draft) {
    setEditId(null);
    setEditing(
      d || {
        name: "",
        description: "",
        category: "Personal",
        type: "boolean",
        target: 1,
        unit: "",
        start: localDate(s!.profile.timezone),
        days: [0, 1, 2, 3, 4, 5, 6],
      },
    );
  }
  async function generate() {
    if (!s || aiBusy) return;
    const context = selected.length
      ? { ...s, habits: s.habits.filter((h) => selected.includes(h.id)) }
      : s;
    setAiBusy(true);
    setError("");
    try {
      if (mode === "demo" || !s.profile.aiEnabled) {
        setAnswer(ruleResponse(kind, prompt, context));
      } else
        setAnswer(await api("ai", "POST", { kind, prompt, ids: selected }));
    } catch {
      setAnswer({
        ...ruleResponse(kind, prompt, context),
        message:
          "AI is unavailable right now. " +
          ruleResponse(kind, prompt, context).message,
      });
    } finally {
      setAiBusy(false);
    }
  }
  if (!s)
    return (
      <main className="boot">
        <Compass size={38} />
        <h1>HabitPilot</h1>
        {error ? (
          <>
            <p role="alert">{error}</p>
            <Button onClick={load}>Retry loading</Button>
            <Button
              variant="outline"
              onClick={() => {
                localStorage.removeItem(STORAGE);
                void load();
              }}
            >
              Reset unreadable demo data
            </Button>
          </>
        ) : (
          <p>
            <Loader2 className="spin inline" /> Preparing your day…
          </p>
        )}
      </main>
    );
  const today = localDate(s.profile.timezone),
    viewDate = addDays(today, offset),
    todays = s.habits.filter((h) => eligible(h, viewDate)),
    done = todays.filter((h) => complete(s, h, viewDate)).length,
    weekStart = addDays(today, -((weekday(today) + 6) % 7)),
    weekDates = dates(weekStart, addDays(weekStart, 6)),
    week = stats(s, addDays(today, -6), today),
    full = stats(s, addDays(today, -7), addDays(today, -1));
  const targetHabit = s.habits.find((h) => h.id === detail),
    historyDays = dates(addDays(today, -83), today),
    allStreak = Math.max(
      0,
      ...s.habits.map((h) => streaks(s, h, today).current),
    );
  const viewHabits =
    page === "habits"
      ? s.habits.filter(
          (h) => filter === "all" || scheduleAt(h, today)?.status === filter,
        )
      : todays.filter(
          (h) => filter !== "remaining" || !complete(s, h, viewDate),
        );
  function toggle(h: Habit, date: string) {
    if (!s) return;
    const v = scheduleAt(h, date)!;
    void save(
      checkIn(
        s,
        h.id,
        date,
        complete(s, h, date) ? 0 : v.type === "boolean" ? 1 : v.target,
        s.entries.find((e) => e.habitId === h.id && e.date === date)?.note ||
          "",
      ),
    );
  }
  function row(h: Habit, i: number) {
    if (!s) return null;
    const date = page === "habits" ? today : viewDate,
      v = scheduleAt(h, date) || h.schedules[0],
      checked = complete(s, h, date),
      Icon = icons[i % icons.length],
      isEligible = eligible(h, date);
    return (
      <div className={"habit-row " + (checked ? "checked" : "")} key={h.id}>
        <div className={"habit-icon tone-" + (i % 4)}>
          <Icon size={22} />
        </div>
        <button
          className="habit-copy"
          onClick={() => {
            setEntryDate(today);
            setDetail(h.id);
          }}
        >
          <strong>{h.name}</strong>
          <span>
            {v.type === "quantity"
              ? `${v.target} ${v.unit}`
              : "One small moment"}
            <b>·</b>
            {h.category}
            {!isEligible && (
              <b> · {v.status === "active" ? "Not scheduled" : v.status}</b>
            )}
          </span>
        </button>
        <div className="habit-streak">
          <Flame size={15} />
          {streaks(s, h, today).current}
        </div>
        {v.type === "quantity" && isEligible && (
          <button
            className="quantity"
            onClick={() => {
              setEntryDate(today);
              setDetail(h.id);
            }}
            aria-label={"Update " + h.name + " progress"}
          >
            {valueAt(s, h.id, date)}
            <span> / {v.target}</span>
          </button>
        )}
        <button
          className={"check-button " + (checked ? "is-done" : "")}
          disabled={busy || !isEligible}
          onClick={() => toggle(h, date)}
          aria-label={(checked ? "Undo " : "Complete ") + h.name}
        >
          {checked ? <Check size={19} /> : <span />}
        </button>
      </div>
    );
  }
  return (
    <SidebarProvider defaultOpen>
      <Sidebar className="pilot-sidebar">
        <SidebarHeader>
          <Link className="brand" href="/">
            <span className="brand-icon">
              <Compass size={23} />
            </span>
            HabitPilot<span className="brand-dot">.</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <p className="nav-heading">YOUR SPACE</p>
          <SidebarMenu>
            {NAV.map((n) => (
              <SidebarMenuItem key={n.id}>
                <SidebarMenuButton asChild isActive={page === n.id}>
                  <Link href={n.href}>
                    <n.icon />
                    <span>{n.label}</span>
                    {n.id === "coach" && <span className="nav-new">AI</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className="sidebar-note">
            <span className="leaf-icon">
              <Leaf size={21} />
            </span>
            <strong>Small steps. Real change.</strong>
            <p>
              You don’t have to do it all.
              <br />
              Just a little, consistently.
            </p>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <button
            className="profile-button"
            onClick={() => setOnboarding(true)}
          >
            <span className="avatar">{s.profile.name[0].toUpperCase()}</span>
            <span>
              <strong>
                {s.profile.name === "Friend" ? "Your space" : s.profile.name}
              </strong>
              <small>
                {mode === "demo" ? "Personal demo" : "Personal account"}
              </small>
            </span>
            <Settings2 size={17} />
          </button>
        </SidebarFooter>
      </Sidebar>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumbs">
            Your space <ChevronRight size={14} />
            <span>{NAV.find((n) => n.id === page)?.label}</span>
          </div>
          <div className="top-actions">
            <span className="save-label">
              {busy
                ? "Saving…"
                : mode === "demo"
                  ? "Saved on this device"
                  : "Saved to your account"}
            </span>
            <button
              aria-label="Toggle theme"
              className="icon-button"
              onClick={() =>
                void save({
                  ...s,
                  profile: {
                    ...s.profile,
                    theme: document.documentElement.classList.contains("dark")
                      ? "light"
                      : "dark",
                  },
                })
              }
            >
              <Sun size={18} />
            </button>
            <span className="avatar small">
              {s.profile.name[0].toUpperCase()}
            </span>
          </div>
        </header>
        <main className="workspace">
          <div className="demo-strip">
            <span>
              <span className="demo-tag">
                {mode === "demo" ? "DEMO MODE" : "YOUR ACCOUNT"}
              </span>
              {mode === "demo"
                ? s.profile.onboarded
                  ? "Your habits stay in this browser. Export a copy anytime."
                  : "A little inspiration to get you started. Sample habits, saved locally."
                : "Your habits sync securely with Supabase."}
            </span>
            <button
              onClick={() =>
                mode === "demo"
                  ? setAuth(true)
                  : void api("auth", "DELETE").then(() => location.reload())
              }
            >
              {mode === "demo" ? "Connect account" : "Sign out"}
              <ArrowRight size={14} />
            </button>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}{" "}
              <Button variant="outline" onClick={load}>
                Reload & retry
              </Button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button onClick={() => setNotice("")} aria-label="Dismiss">
                <X size={16} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {page === "today"
                  ? new Intl.DateTimeFormat("en", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      timeZone: s.profile.timezone,
                    }).format(new Date())
                  : "A LITTLE BETTER, EVERY DAY"}
              </p>
              <h1>
                {page === "today"
                  ? s.profile.name === "Friend"
                    ? "Make room for good habits."
                    : `Your day, ${s.profile.name}.`
                  : page === "habits"
                    ? "Build your kind of routine."
                    : page === "analytics"
                      ? "See your consistency grow."
                      : page === "coach"
                        ? "A little guidance goes a long way."
                        : "Make yourself at home."}
              </h1>
              <p>
                {page === "today"
                  ? "Small actions today. A stronger you tomorrow."
                  : page === "habits"
                    ? "Keep what works. Adjust what doesn’t."
                    : page === "analytics"
                      ? "An honest look at the small steps you’ve taken."
                      : page === "coach"
                        ? "Turn a good intention into a manageable next step."
                        : "Your preferences, your data, your pace."}
              </p>
            </div>
            {["today", "habits"].includes(page) && (
              <Button className="new-habit" onClick={() => newHabit()}>
                <Plus size={18} />
                New habit
              </Button>
            )}
          </div>
          {page === "today" && (
            <>
              <div className="summary-grid">
                <div className="summary-card">
                  <div>
                    <span className="card-label">
                      {viewDate === today ? "Today’s progress" : "Selected day"}
                    </span>
                    <p className="metric">
                      {done}
                      <span> / {todays.length}</span>
                    </p>
                    <span className="small-muted">
                      {todays.length - done
                        ? `${todays.length - done} small steps to go`
                        : "All done. Make time to recharge."}
                    </span>
                  </div>
                  <div
                    className="progress-ring"
                    style={
                      {
                        "--progress": `${todays.length ? (done / todays.length) * 100 : 0}%`,
                      } as React.CSSProperties
                    }
                  >
                    <span>
                      {todays.length
                        ? Math.round((done / todays.length) * 100)
                        : 0}
                      <small>%</small>
                    </span>
                  </div>
                </div>
                <div className="summary-card">
                  <div>
                    <span className="card-label">Longest current streak</span>
                    <p className="metric">
                      {allStreak}
                      <span> occurrences</span>
                    </p>
                    <span className="small-muted">
                      Consecutive scheduled completions
                    </span>
                  </div>
                  <span className="stat-icon amber">
                    <Flame size={25} />
                  </span>
                </div>
                <div className="summary-card">
                  <div>
                    <span className="card-label">Last 7 full days</span>
                    <p className="metric">
                      {full.rate === null ? "—" : full.rate}
                      <span>{full.rate === null ? "" : "% consistency"}</span>
                    </p>
                    <span className="small-muted">
                      {full.completed} of {full.scheduled} scheduled steps
                    </span>
                  </div>
                  <span className="stat-icon green">
                    <TrendingUp size={25} />
                  </span>
                </div>
              </div>
              <div className="dashboard-grid">
                <section className="card today-card">
                  <div className="section-heading">
                    <h2>Your habits</h2>
                    <Tabs
                      value={filter === "remaining" ? "remaining" : "all"}
                      onValueChange={setFilter}
                    >
                      <TabsList>
                        <TabsTrigger value="all">All</TabsTrigger>
                        <TabsTrigger value="remaining">To do</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                  <div className="week-strip">
                    {weekDates.map((d) => (
                      <button
                        key={d}
                        disabled={d > today}
                        onClick={() =>
                          setOffset(
                            Math.round(
                              (+new Date(d) - +new Date(today)) / 86400000,
                            ),
                          )
                        }
                        className={d === viewDate ? "selected" : ""}
                      >
                        <span>{DAYS[weekday(d)]}</span>
                        <strong>{Number(d.slice(-2))}</strong>
                        <span
                          className={
                            "day-dot " +
                            (stats(s, d, d).completed ? "has-progress" : "")
                          }
                        />
                      </button>
                    ))}
                  </div>
                  <div className="list-heading">
                    <span>{viewDate === today ? "TODAY" : viewDate}</span>
                    <span>
                      {done} OF {todays.length} COMPLETE
                    </span>
                  </div>
                  {viewHabits.length ? (
                    viewHabits.map(row)
                  ) : (
                    <div className="empty-state">
                      <Leaf />
                      <h3>
                        {todays.length
                          ? "You’ve made space for your habits."
                          : "A little space for something good."}
                      </h3>
                      <p>
                        {todays.length
                          ? "All scheduled habits are complete."
                          : "No habits scheduled for this day."}
                      </p>
                      <Button variant="outline" onClick={() => newHabit()}>
                        Add a habit
                      </Button>
                    </div>
                  )}
                  <button className="add-row" onClick={() => newHabit()}>
                    <Plus size={17} />
                    Add a new habit
                  </button>
                  <div className="list-foot">
                    <span>
                      <Check size={14} />
                      Every small step counts.
                    </span>
                    <button
                      onClick={() => {
                        setKind("draft");
                        location.href = "/coach";
                      }}
                    >
                      <Sparkles size={14} />
                      Create with AI
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </section>
                <aside className="right-rail">
                  <section className="card weekly-card">
                    <div className="section-heading">
                      <h2>This week at a glance</h2>
                      <TrendingUp size={17} />
                    </div>
                    <p className="small-muted">
                      Daily completion · last 7 days
                    </p>
                    <div className="mini-bars">
                      {week.series.map((d) => (
                        <div key={d.date}>
                          <div className="bar-track">
                            <div style={{ height: `${d.rate || 0}%` }} />
                          </div>
                          <span>{DAYS[weekday(d.date)].slice(0, 1)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="weekly-bottom">
                      <strong>
                        {week.completed} <span>habits completed</span>
                      </strong>
                      <Link href="/analytics" aria-label="View analytics">
                        <ArrowRight size={17} />
                      </Link>
                    </div>
                  </section>
                  <section className="coach-card">
                    <div className="coach-label">
                      <Sparkles size={17} />
                      <strong>A little nudge</strong>
                      <span>RULE-BASED</span>
                    </div>
                    <p>{fallbackSuggestion(s)}</p>
                    <Link href="/coach">
                      Find your next small step
                      <ArrowRight size={15} />
                    </Link>
                  </section>
                </aside>
              </div>
              <section className="card reflection">
                <div>
                  <div className="reflection-title">
                    <Pencil size={18} />
                    <h2>A moment to reflect</h2>
                    <span>JUST FOR YOU</span>
                  </div>
                  <p className="small-muted">What helped you show up today?</p>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const text = String(
                      new FormData(e.currentTarget).get("reflection") || "",
                    );
                    if (
                      await save({
                        ...s,
                        reflections: [
                          ...s.reflections.filter((r) => r.date !== today),
                          {
                            date: today,
                            text,
                            timezone: s.profile.timezone,
                            updatedAt: new Date().toISOString(),
                          },
                        ],
                      })
                    )
                      setNotice("Reflection saved.");
                  }}
                >
                  <Textarea
                    name="reflection"
                    aria-label="Daily reflection"
                    key={today + s.revision}
                    defaultValue={
                      s.reflections.find((r) => r.date === today)?.text || ""
                    }
                    maxLength={1000}
                    placeholder="A small win, a challenge, or something you noticed…"
                  />
                  <Button type="submit" variant="outline" disabled={busy}>
                    Save reflection
                  </Button>
                </form>
              </section>
              {!s.profile.onboarded && (
                <button
                  className="setup-link"
                  onClick={() => setOnboarding(true)}
                >
                  Make this space yours → Set up your profile and starter habits
                </button>
              )}
            </>
          )}
          {page === "habits" && (
            <section className="card">
              <div className="section-heading">
                <h2>
                  All habits{" "}
                  <span className="count-badge">{s.habits.length}</span>
                </h2>
                <Tabs value={filter} onValueChange={setFilter}>
                  <TabsList>
                    {["all", "active", "paused", "archived"].map((x) => (
                      <TabsTrigger key={x} value={x}>
                        {x[0].toUpperCase() + x.slice(1)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
              {viewHabits.length ? (
                viewHabits.map(row)
              ) : (
                <div className="empty-state">
                  <Target />
                  <h3>No habits here yet.</h3>
                  <p>Start with one action that fits your day.</p>
                  <Button onClick={() => newHabit()}>Create a habit</Button>
                </div>
              )}
            </section>
          )}
          {page === "analytics" && (
            <AnalyticsView
              s={s}
              today={today}
              setDetail={setDetail}
              setEntryDate={setEntryDate}
            />
          )}
          {page === "coach" && (
            <div className="coach-layout">
              <section className="card coach-workspace">
                <span className="coach-emblem">
                  <Sparkles size={28} />
                </span>
                <h2>What would you like to work on?</h2>
                <p className="small-muted">
                  A manageable routine starts with a specific next step.
                </p>
                <div className="coach-options">
                  {[
                    {
                      id: "draft",
                      title: "Create a habit",
                      sub: "Turn an intention into a plan",
                      icon: Plus,
                    },
                    {
                      id: "breakdown",
                      title: "Break down a goal",
                      sub: "Find two to four small steps",
                      icon: Target,
                    },
                    {
                      id: "review",
                      title: "Weekly review",
                      sub: "Reflect on your real progress",
                      icon: TrendingUp,
                    },
                    {
                      id: "coach",
                      title: "Ask your coach",
                      sub: "Find a way forward",
                      icon: Sparkles,
                    },
                  ].map((o) => (
                    <button
                      className={kind === o.id ? "chosen" : ""}
                      key={o.id}
                      onClick={() => {
                        setKind(o.id);
                        setAnswer(null);
                      }}
                    >
                      <o.icon size={19} />
                      <strong>{o.title}</strong>
                      <span>{o.sub}</span>
                    </button>
                  ))}
                </div>
                <Field
                  label={
                    kind === "breakdown"
                      ? "Your goal, available time, and experience"
                      : kind === "review"
                        ? "Anything you’d like to focus on? (optional)"
                        : "Tell me what you have in mind"
                  }
                >
                  <Textarea
                    value={prompt}
                    maxLength={1200}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={
                      kind === "breakdown"
                        ? "Learn Java · 20 minutes a day · beginner"
                        : "Help me practise Java for 30 minutes on weekdays"
                    }
                  />
                </Field>
                {["review", "coach"].includes(kind) && (
                  <fieldset className="habit-selection">
                    <legend>Include habits (none selected means all)</legend>
                    {s.habits.map((h) => (
                      <label key={h.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(h.id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, h.id]
                                : selected.filter((x) => x !== h.id),
                            )
                          }
                        />
                        {h.name}
                      </label>
                    ))}
                  </fieldset>
                )}
                <Button
                  onClick={generate}
                  disabled={aiBusy || (kind !== "review" && !prompt.trim())}
                >
                  {aiBusy ? (
                    <Loader2 className="spin" />
                  ) : (
                    <Sparkles size={17} />
                  )}{" "}
                  {kind === "review" ? "Review my week" : "Find my next step"}
                </Button>
                <p className="privacy-note">
                  {mode === "demo"
                    ? "Demo uses rule-based suggestions. No prompt is sent to an AI provider."
                    : s.profile.shareJournal
                      ? "Journal sharing is enabled in Settings."
                      : "Private journal text is excluded. You review every proposed habit."}
                </p>
                {answer && (
                  <div className="answer" aria-live="polite">
                    <span className="source-tag">{answer.source}</span>
                    <p>{answer.message}</p>
                    {kind === "review" && (
                      <div className="verified-stats">
                        Verified in code: {full.completed} / {full.scheduled}{" "}
                        completed across all habits in the last seven full days.
                      </div>
                    )}
                    {answer.drafts.map((d, i) => (
                      <div className="draft-card" key={i}>
                        <div>
                          <strong>{d.name}</strong>
                          <span>
                            {d.type === "quantity"
                              ? `${d.target} ${d.unit}`
                              : "Yes / no"}{" "}
                            ·{" "}
                            {d.days.length === 7
                              ? "Every day"
                              : d.days.map((x) => DAYS[x]).join(", ")}
                          </span>
                        </div>
                        <Button variant="outline" onClick={() => newHabit(d)}>
                          Review draft
                          <ArrowRight size={15} />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <aside className="card coach-aside">
                <div className="coach-label">
                  <Leaf size={19} />
                  <h2>Built around your life</h2>
                </div>
                <p>A suggestion is a starting point, not a rule.</p>
                <ul>
                  <li>Start smaller than you think you need to.</li>
                  <li>Give the habit a clear time or place.</li>
                  <li>Adjust the plan when life changes.</li>
                </ul>
                <hr />
                <span className="source-tag">
                  {mode === "demo"
                    ? "RULE-BASED MODE"
                    : "AI + VERIFIED STATISTICS"}
                </span>
                <p className="small-muted">
                  Counts, rates, and streaks are calculated by HabitPilot.
                  Suggestions never change your habits automatically.
                </p>
              </aside>
            </div>
          )}
          {page === "settings" && (
            <div className="settings-grid">
              <section className="card">
                <h2>Your profile & preferences</h2>
                <p className="small-muted">
                  {mode === "demo"
                    ? "Changes are saved only in this browser."
                    : "Changes are saved to your Supabase account."}
                </p>
                <form
                  className="settings-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget),
                      zone = String(fd.get("timezone"));
                    const p = {
                      ...s.profile,
                      name: String(fd.get("name")),
                      timezone: zone,
                      goal: String(fd.get("goal")),
                      preferred: String(
                        fd.get("preferred"),
                      ) as State["profile"]["preferred"],
                      theme: String(
                        fd.get("theme"),
                      ) as State["profile"]["theme"],
                      aiEnabled: fd.get("ai") === "on",
                      shareJournal: fd.get("journal") === "on",
                      timezoneHistory:
                        zone !== s.profile.timezone
                          ? [
                              ...s.profile.timezoneHistory,
                              {
                                timezone: zone,
                                changedAt: new Date().toISOString(),
                              },
                            ]
                          : s.profile.timezoneHistory,
                    };
                    const next = { ...s, profile: p };
                    if (zone !== s.profile.timezone) {
                      setConfirm({
                        text: "Change timezone? Existing dates and check-ins stay unchanged. Today will use the new timezone; crossing the date line can skip or repeat a calendar label. A repeated date shares the same check-in.",
                        run: () =>
                          void save(next).then(
                            (ok) => ok && setNotice("Settings saved."),
                          ),
                      });
                    } else if (await save(next)) setNotice("Settings saved.");
                  }}
                >
                  <Field label="Name">
                    <Input
                      name="name"
                      defaultValue={s.profile.name}
                      required
                      maxLength={60}
                    />
                  </Field>
                  <Field label="Timezone">
                    <Input
                      name="timezone"
                      defaultValue={s.profile.timezone}
                      required
                      placeholder="Asia/Kolkata"
                      list="timezones"
                    />
                  </Field>
                  <datalist id="timezones">
                    {[
                      "UTC",
                      "Asia/Kolkata",
                      "America/New_York",
                      "America/Los_Angeles",
                      "Europe/London",
                      "Asia/Tokyo",
                      "Australia/Sydney",
                    ].map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </datalist>
                  <p className="small-muted">
                    Uses IANA timezone names. Changing zones never rewrites
                    recorded dates.
                  </p>
                  <Field label="Main goal">
                    <Input
                      name="goal"
                      defaultValue={s.profile.goal}
                      maxLength={300}
                    />
                  </Field>
                  <div className="form-two">
                    <Field label="Preferred time">
                      <select
                        name="preferred"
                        defaultValue={s.profile.preferred}
                      >
                        {["Morning", "Afternoon", "Evening", "Anytime"].map(
                          (x) => (
                            <option key={x}>{x}</option>
                          ),
                        )}
                      </select>
                    </Field>
                    <Field label="Theme">
                      <select name="theme" defaultValue={s.profile.theme}>
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                        <option value="system">Use device theme</option>
                      </select>
                    </Field>
                  </div>
                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      name="ai"
                      defaultChecked={s.profile.aiEnabled}
                    />
                    <span>Enable AI suggestions when connected</span>
                  </label>
                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      name="journal"
                      defaultChecked={s.profile.shareJournal}
                    />
                    <span>
                      Include recent private notes and reflections in AI
                      requests
                    </span>
                  </label>
                  <Button disabled={busy}>Save preferences</Button>
                </form>
              </section>
              <div>
                <section className="card">
                  <h2>Your data belongs to you.</h2>
                  <p className="small-muted">
                    Export your profile, habits, schedule history, check-ins,
                    and reflections as JSON.
                  </p>
                  <Button variant="outline" onClick={() => download(s)}>
                    <ArrowDownToLine size={17} />
                    Export my data
                  </Button>
                </section>
                <section className="card danger-zone">
                  <h2>
                    {mode === "demo" ? "Clear demo data" : "Delete account"}
                  </h2>
                  <p className="small-muted">
                    {mode === "demo"
                      ? "Remove all habits and reflections saved in this browser."
                      : "Permanently delete your account, habits, reflections, and saved AI reviews."}{" "}
                    This cannot be undone.
                  </p>
                  <Button
                    variant="destructive"
                    onClick={() =>
                      setConfirm({
                        text:
                          mode === "demo"
                            ? "Delete all local demo data? Export first if you want to keep a copy."
                            : "Permanently delete your account and all its data? Export first. This cannot be undone.",
                        run: async () => {
                          try {
                            if (mode === "account")
                              await api("account", "DELETE", {
                                confirm: "DELETE",
                              });
                            localStorage.removeItem(STORAGE);
                            const clean = emptyState(s.profile.timezone);
                            clean.profile.onboarded = true;
                            localStorage.setItem(
                              STORAGE,
                              JSON.stringify(clean),
                            );
                            setMode("demo");
                            setS(clean);
                            setNotice("Your data has been deleted.");
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        },
                      })
                    }
                  >
                    <Trash2 size={16} />
                    {mode === "demo" ? "Clear local data" : "Delete my account"}
                  </Button>
                </section>
                <section className="card">
                  <h2>A quieter kind of app</h2>
                  <p className="small-muted">
                    No background reminders are sent. Your preferred time helps
                    shape your routine, but does not schedule a notification.
                  </p>
                </section>
              </div>
            </div>
          )}
          <footer className="app-footer">
            <span>
              <Compass size={14} />A little, consistently.
            </span>
            <span>
              {s.profile.timezone} ·{" "}
              {mode === "demo" ? "Local demo" : "Account connected"}
            </span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Main navigation">
        {NAV.map((n) => (
          <Link
            className={n.id === page ? "active" : ""}
            href={n.href}
            key={n.id}
          >
            <n.icon size={20} />
            <span>{n.label}</span>
          </Link>
        ))}
      </nav>
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="pilot-dialog">
          <DialogHeader>
            <DialogTitle>
              {editId ? "Edit your habit" : "One small step starts here."}
            </DialogTitle>
            <DialogDescription>
              {editId
                ? "Name and description update now. Schedule, status, and target changes start tomorrow."
                : "Make it specific, manageable, and yours. Review everything before saving."}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              className="habit-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const parsed = draftSchema.safeParse(editing);
                if (!parsed.success) {
                  setError(parsed.error.issues[0].message);
                  return;
                }
                if (!editId && editing.start < today) {
                  setError("New habits must start today or later.");
                  return;
                }
                const next = editId
                  ? reviseHabit(
                      s,
                      editId,
                      parsed.data,
                      s.habits.find((h) => h.id === editId)!.schedules.at(-1)!
                        .status,
                    )
                  : { ...s, habits: [...s.habits, makeHabit(parsed.data)] };
                if (await save(next)) {
                  setEditing(null);
                  setNotice(
                    editId
                      ? "Habit updated. Schedule and target changes begin tomorrow."
                      : "Habit added. A small step, ready when you are.",
                  );
                }
              }}
            >
              <Field label="Habit name">
                <Input
                  autoFocus
                  required
                  maxLength={80}
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  placeholder="Practise Java"
                />
              </Field>
              <Field label="Description (optional)">
                <Textarea
                  value={editing.description}
                  maxLength={400}
                  onChange={(e) =>
                    setEditing({ ...editing, description: e.target.value })
                  }
                />
              </Field>
              <div className="form-two">
                <Field label="Category">
                  <select
                    value={editing.category}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        category: e.target.value as Draft["category"],
                      })
                    }
                  >
                    {["Learning", "Wellbeing", "Mindfulness", "Personal"].map(
                      (x) => (
                        <option key={x}>{x}</option>
                      ),
                    )}
                  </select>
                </Field>
                <Field label="Tracking">
                  <select
                    value={editing.type}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        type: e.target.value as Draft["type"],
                      })
                    }
                  >
                    <option value="boolean">Yes / no</option>
                    <option value="quantity">Quantity</option>
                  </select>
                </Field>
              </div>
              {editing.type === "quantity" && (
                <div className="form-two">
                  <Field label="Target">
                    <Input
                      type="number"
                      min="0.01"
                      step="any"
                      max="10000"
                      required
                      value={editing.target}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          target: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="Unit">
                    <Input
                      required
                      maxLength={30}
                      value={editing.unit}
                      onChange={(e) =>
                        setEditing({ ...editing, unit: e.target.value })
                      }
                      placeholder="minutes"
                    />
                  </Field>
                </div>
              )}
              <Field label="Start date">
                <Input
                  type="date"
                  min={today}
                  disabled={!!editId}
                  value={editing.start}
                  onChange={(e) =>
                    setEditing({ ...editing, start: e.target.value })
                  }
                  required
                />
              </Field>
              <fieldset>
                <legend>Scheduled days</legend>
                <div className="weekday-picker">
                  {DAYS.map((d, i) => (
                    <button
                      type="button"
                      aria-pressed={editing.days.includes(i)}
                      key={d}
                      className={editing.days.includes(i) ? "selected" : ""}
                      onClick={() =>
                        setEditing({
                          ...editing,
                          days: editing.days.includes(i)
                            ? editing.days.filter((x) => x !== i)
                            : [...editing.days, i],
                        })
                      }
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </fieldset>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={busy || !editing.days.length}>
                {busy ? "Saving…" : editId ? "Save changes" : "Add habit"}
                <ArrowRight size={16} />
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!targetHabit} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="pilot-dialog details-dialog">
          <DialogHeader>
            <DialogTitle>{targetHabit?.name}</DialogTitle>
            <DialogDescription>
              {targetHabit?.description || "Small steps, recorded over time."}
            </DialogDescription>
          </DialogHeader>
          {targetHabit && (
            <>
              <div className="detail-actions">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditId(targetHabit.id);
                    setEditing(draftOf(targetHabit));
                    setDetail(null);
                  }}
                >
                  <Pencil size={15} />
                  Edit
                </Button>
                {(["paused", "archived"] as const).map((status) => (
                  <Button
                    key={status}
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        text: `${status === "paused" ? "Pause" : "Archive"} this habit from tomorrow? Past results and today’s schedule stay unchanged.`,
                        run: () =>
                          void save(
                            reviseHabit(
                              s,
                              targetHabit.id,
                              draftOf(targetHabit),
                              status,
                            ),
                          ).then(
                            (ok) =>
                              ok && setNotice("Change scheduled for tomorrow."),
                          ),
                      })
                    }
                  >
                    {status === "paused" ? "Pause" : "Archive"}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void save(
                      reviseHabit(
                        s,
                        targetHabit.id,
                        draftOf(targetHabit),
                        "active",
                      ),
                    ).then((ok) => ok && setNotice("Active from tomorrow."))
                  }
                >
                  Resume
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Delete habit"
                  onClick={() =>
                    setConfirm({
                      text: "Permanently delete this habit and all its check-ins? Historical analytics will no longer include it.",
                      run: () =>
                        void save({
                          ...s,
                          habits: s.habits.filter(
                            (h) => h.id !== targetHabit.id,
                          ),
                          entries: s.entries.filter(
                            (e) => e.habitId !== targetHabit.id,
                          ),
                        }).then((ok) => ok && setDetail(null)),
                    })
                  }
                >
                  <Trash2 size={16} />
                </Button>
              </div>
              <p className="small-muted">
                Current:{" "}
                {scheduleAt(targetHabit, today)?.status || "Not started"} · Next
                scheduled version: {targetHabit.schedules.at(-1)?.effective}
              </p>
              <div className="detail-stats">
                <div>
                  <strong>{streaks(s, targetHabit, today).current}</strong>
                  <span>Current streak</span>
                </div>
                <div>
                  <strong>{streaks(s, targetHabit, today).best}</strong>
                  <span>Best streak</span>
                </div>
                <div>
                  <strong>
                    {
                      stats(s, targetHabit.start, today, [targetHabit.id])
                        .completed
                    }
                  </strong>
                  <span>Completions</span>
                </div>
              </div>
              <h3>Last 12 weeks</h3>
              <div className="heatmap">
                {historyDays.map((d) => (
                  <button
                    aria-label={`${d}: ${complete(s, targetHabit, d) ? "complete" : eligible(targetHabit, d) ? "not complete" : "not scheduled"}`}
                    key={d}
                    title={d}
                    className={
                      complete(s, targetHabit, d)
                        ? "filled"
                        : eligible(targetHabit, d)
                          ? "scheduled"
                          : ""
                    }
                    onClick={() => {
                      setEntryDate(d);
                    }}
                  />
                ))}
              </div>
              <p className="small-muted">
                Green: complete · Gray: scheduled · Pale: not scheduled
              </p>
              <EntryEditor
                key={targetHabit.id + (entryDate || today) + s.revision}
                s={s}
                h={targetHabit}
                initial={entryDate || today}
                busy={busy}
                save={save}
                onSaved={() => setNotice("Check-in saved.")}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={onboarding} onOpenChange={setOnboarding}>
        <DialogContent className="pilot-dialog">
          <DialogHeader>
            <DialogTitle>Make this space yours.</DialogTitle>
            <DialogDescription>
              Pick a small starting point. You can change everything later.
            </DialogDescription>
          </DialogHeader>
          <form
            className="habit-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget),
                zone = String(fd.get("timezone"));
              const clean =
                mode === "demo" && !s.profile.onboarded ? emptyState(zone) : s;
              const starter = demoState(zone)
                .habits.filter((_, i) => fd.get("starter-" + i) === "on")
                .map((h) => ({
                  ...h,
                  start: localDate(zone),
                  schedules: [
                    {
                      ...h.schedules[0],
                      effective: localDate(zone),
                      days:
                        fd.get("days") === "weekdays"
                          ? [1, 2, 3, 4, 5]
                          : [0, 1, 2, 3, 4, 5, 6],
                    },
                  ],
                }));
              if (
                await save({
                  ...clean,
                  revision: s.revision,
                  profile: {
                    ...s.profile,
                    name: String(fd.get("name")),
                    timezone: zone,
                    goal: String(fd.get("goal")),
                    preferred: String(
                      fd.get("preferred"),
                    ) as State["profile"]["preferred"],
                    onboarded: true,
                    timezoneHistory: [
                      ...s.profile.timezoneHistory,
                      { timezone: zone, changedAt: new Date().toISOString() },
                    ],
                  },
                  habits: [...clean.habits, ...starter],
                })
              ) {
                setOnboarding(false);
                setNotice("Your space is ready.");
              }
            }}
          >
            <Field label="Your name">
              <Input
                required
                name="name"
                defaultValue={s.profile.name === "Friend" ? "" : s.profile.name}
                maxLength={60}
              />
            </Field>
            <Field label="Timezone">
              <Input
                name="timezone"
                defaultValue={s.profile.timezone}
                required
              />
            </Field>
            <Field label="Main goal">
              <Input
                name="goal"
                placeholder="Make time to learn something new"
                maxLength={300}
                defaultValue={s.profile.goal}
              />
            </Field>
            <div className="form-two">
              <Field label="Preferred time">
                <select name="preferred">
                  {["Morning", "Afternoon", "Evening", "Anytime"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="Preferred days">
                <select name="days">
                  <option value="daily">Every day</option>
                  <option value="weekdays">Weekdays</option>
                </select>
              </Field>
            </div>
            <fieldset>
              <legend>Optional starter habits</legend>
              {["Reading", "Coding practice", "Walking", "Journaling"].map(
                (x, i) => (
                  <label className="checkbox-line" key={x}>
                    <input type="checkbox" name={"starter-" + i} />
                    {x}
                  </label>
                ),
              )}
            </fieldset>
            <p className="small-muted">
              Leave all unchecked to skip suggestions.
              {mode === "demo" && !s.profile.onboarded
                ? " Setting up replaces the sample history with your fresh start."
                : ""}
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <Button disabled={busy}>
              Start my routine
              <ArrowRight size={16} />
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={auth} onOpenChange={setAuth}>
        <DialogContent className="pilot-dialog">
          <DialogHeader>
            <DialogTitle>Your habits, wherever you are.</DialogTitle>
            <DialogDescription>
              {configured
                ? "Sign in with your Supabase account. Your demo remains separate on this device."
                : "This installation is in demo mode. Add Supabase credentials and run the included database migration to enable account sign-in."}
            </DialogDescription>
          </DialogHeader>
          {configured ? (
            <form
              className="habit-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setBusy(true);
                setError("");
                try {
                  const r = await api("auth", "POST", {
                    action: authKind,
                    email: fd.get("email"),
                    password: fd.get("password"),
                  });
                  if (r.message) setNotice(r.message);
                  else {
                    setAuth(false);
                    await load();
                  }
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label="Email">
                <Input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </Field>
              <Field label="Password">
                <Input
                  name="password"
                  type="password"
                  minLength={8}
                  maxLength={128}
                  required
                  autoComplete={
                    authKind === "login" ? "current-password" : "new-password"
                  }
                />
              </Field>
              {error && <p className="form-error">{error}</p>}
              <Button disabled={busy}>
                {authKind === "login" ? "Sign in" : "Create account"}
              </Button>
              <button
                type="button"
                className="text-link"
                onClick={() =>
                  setAuthKind(authKind === "login" ? "signup" : "login")
                }
              >
                {authKind === "login"
                  ? "Create an account instead"
                  : "Already have an account? Sign in"}
              </button>
            </form>
          ) : (
            <Button onClick={() => setAuth(false)}>Continue with demo</Button>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!confirm}
        onOpenChange={(v) => !v && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Please confirm</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirm?.run();
                setConfirm(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
function EntryEditor({
  s,
  h,
  initial,
  busy,
  save,
  onSaved,
}: {
  s: State;
  h: Habit;
  initial: string;
  busy: boolean;
  save: (s: State) => Promise<boolean>;
  onSaved: () => void;
}) {
  const today = localDate(s.profile.timezone),
    [date, setDate] = useState(initial),
    [value, setValue] = useState(valueAt(s, h.id, initial)),
    [note, setNote] = useState(
      s.entries.find((e) => e.habitId === h.id && e.date === initial)?.note ||
        "",
    );
  const v = scheduleAt(h, date),
    valid = eligible(h, date);
  return (
    <form
      className="habit-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await save(checkIn(s, h.id, date, value, note))) onSaved();
      }}
    >
      <h3>Update a check-in</h3>
      <Field label="Date">
        <Input
          id="entry-date"
          type="date"
          value={date}
          min={h.start}
          max={today}
          onChange={(e) => {
            setDate(e.target.value);
            setValue(valueAt(s, h.id, e.target.value));
            setNote(
              s.entries.find(
                (x) => x.habitId === h.id && x.date === e.target.value,
              )?.note || "",
            );
          }}
        />
      </Field>
      {valid ? (
        <>
          {v?.type === "quantity" ? (
            <Field label={`Progress (${v.unit}) · target ${v.target}`}>
              <Input
                type="number"
                min={0}
                max={10000}
                step="any"
                required
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
              />
            </Field>
          ) : (
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={value >= 1}
                onChange={(e) => setValue(e.target.checked ? 1 : 0)}
              />
              Completed
            </label>
          )}
          <Field label="Private note (optional)">
            <Textarea
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <Button disabled={busy || date > today}>Save check-in</Button>
        </>
      ) : (
        <p className="small-muted">
          This habit is not scheduled on this date. Choose another day.
        </p>
      )}
    </form>
  );
}
