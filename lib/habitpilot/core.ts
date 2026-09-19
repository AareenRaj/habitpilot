import { z } from "zod";
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T12:00:00Z");
    return !isNaN(+d) && d.toISOString().slice(0, 10) === s;
  }, "Use a valid date");
export const zoneSchema = z.string().refine((s) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: s });
    return true;
  } catch {
    return false;
  }
}, "Choose an IANA timezone");
export const weekdays = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .max(7)
  .refine((a) => new Set(a).size === a.length);
export const draftSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    category: z.enum(["Learning", "Wellbeing", "Mindfulness", "Personal"]),
    description: z.string().max(400).default(""),
    type: z.enum(["boolean", "quantity"]),
    target: z.number().positive().max(10000),
    unit: z.string().trim().max(30),
    start: dateSchema,
    days: weekdays,
  })
  .refine(
    (v) => v.type !== "quantity" || v.unit.length > 0,
    "Quantity habits need a unit",
  );
export type Draft = z.infer<typeof draftSchema>;
export const scheduleSchema = z.object({
  effective: dateSchema,
  days: weekdays,
  target: z.number().positive().max(10000),
  type: z.enum(["boolean", "quantity"]),
  unit: z.string().max(30),
  status: z.enum(["active", "paused", "archived"]),
});
export type Schedule = z.infer<typeof scheduleSchema>;
export const habitSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  category: z.string().max(30),
  description: z.string().max(400),
  start: dateSchema,
  createdAt: z.string().datetime(),
  schedules: z.array(scheduleSchema).min(1).max(2000),
});
export type Habit = z.infer<typeof habitSchema>;
export const entrySchema = z.object({
  habitId: z.string().uuid(),
  date: dateSchema,
  value: z.number().min(0).max(10000),
  note: z.string().max(1000),
  timezone: zoneSchema,
  updatedAt: z.string().datetime(),
});
export type Entry = z.infer<typeof entrySchema>;
export const profileSchema = z.object({
  name: z.string().trim().min(1).max(60),
  timezone: zoneSchema,
  goal: z.string().max(300),
  preferred: z.enum(["Morning", "Afternoon", "Evening", "Anytime"]),
  theme: z.enum(["light", "dark", "system"]),
  aiEnabled: z.boolean(),
  shareJournal: z.boolean(),
  onboarded: z.boolean(),
  timezoneHistory: z
    .array(z.object({ timezone: zoneSchema, changedAt: z.string().datetime() }))
    .max(200),
});
export const stateSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().min(0),
    profile: profileSchema,
    habits: z.array(habitSchema).max(100),
    entries: z.array(entrySchema).max(50000),
    reflections: z
      .array(
        z.object({
          date: dateSchema,
          text: z.string().max(1000),
          timezone: zoneSchema,
          updatedAt: z.string().datetime(),
        }),
      )
      .max(10000),
  })
  .superRefine((s, c) => {
    if (new Set(s.habits.map((h) => h.id)).size !== s.habits.length)
      c.addIssue({ code: "custom", message: "Duplicate habits" });
    if (
      new Set(s.entries.map((e) => e.habitId + e.date)).size !==
      s.entries.length
    )
      c.addIssue({ code: "custom", message: "Duplicate check-ins" });
    for (const e of s.entries) {
      const h = s.habits.find((h) => h.id === e.habitId);
      if (!h || !eligible(h, e.date))
        c.addIssue({ code: "custom", message: "Entry outside schedule" });
    }
  });
export type State = z.infer<typeof stateSchema>;
export function localDate(zone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function addDays(date: string, n: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dates(from: string, to: string) {
  const a: string[] = [];
  for (let d = from; d <= to && a.length < 40000; d = addDays(d, 1)) a.push(d);
  return a;
}
export function weekday(d: string) {
  return new Date(d + "T12:00:00Z").getUTCDay();
}
export function scheduleAt(h: Habit, d: string) {
  return h.schedules
    .filter((v) => v.effective <= d)
    .sort((a, b) => b.effective.localeCompare(a.effective))[0];
}
export function eligible(h: Habit, d: string) {
  const s = scheduleAt(h, d);
  return (
    d >= h.start && !!s && s.status === "active" && s.days.includes(weekday(d))
  );
}
export function valueAt(state: State, id: string, date: string) {
  return (
    state.entries.find((e) => e.habitId === id && e.date === date)?.value || 0
  );
}
export function complete(s: State, h: Habit, d: string) {
  const v = scheduleAt(h, d);
  return (
    eligible(h, d) &&
    valueAt(s, h.id, d) >= (v?.type === "boolean" ? 1 : v?.target || 1)
  );
}
export function streaks(s: State, h: Habit, today: string) {
  let current = 0,
    best = 0;
  for (const d of dates(h.start, today)) {
    if (!eligible(h, d)) continue;
    if (complete(s, h, d)) {
      current++;
      best = Math.max(best, current);
    } else if (d !== today) current = 0;
  }
  return { current, best };
}
export function stats(s: State, from: string, to: string, ids?: string[]) {
  let scheduled = 0,
    completed = 0;
  const series = dates(from, to).map((date) => {
    let total = 0,
      done = 0;
    for (const h of s.habits) {
      if (ids && !ids.includes(h.id)) continue;
      if (eligible(h, date)) {
        total++;
        if (complete(s, h, date)) done++;
      }
    }
    scheduled += total;
    completed += done;
    return {
      date,
      label: date.slice(5),
      scheduled: total,
      completed: done,
      rate: total ? Math.round((100 * done) / total) : null,
    };
  });
  return {
    scheduled,
    completed,
    rate: scheduled ? Math.round((100 * completed) / scheduled) : null,
    series,
  };
}
export function checkIn(
  s: State,
  id: string,
  date: string,
  value: number,
  note = "",
  now = new Date(),
): State {
  const h = s.habits.find((h) => h.id === id);
  if (!h || date > localDate(s.profile.timezone, now) || !eligible(h, date))
    throw new Error("Choose a scheduled date, today or earlier.");
  const e = entrySchema.parse({
    habitId: id,
    date,
    value,
    note,
    timezone:
      s.entries.find((e) => e.habitId === id && e.date === date)?.timezone ||
      s.profile.timezone,
    updatedAt: now.toISOString(),
  });
  return {
    ...s,
    entries: [
      ...s.entries.filter((e) => !(e.habitId === id && e.date === date)),
      e,
    ],
  };
}
export function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function makeHabit(d: Draft): Habit {
  return {
    id: newId(),
    name: d.name,
    category: d.category,
    description: d.description,
    start: d.start,
    createdAt: new Date().toISOString(),
    schedules: [
      {
        effective: d.start,
        days: d.days,
        target: d.type === "boolean" ? 1 : d.target,
        type: d.type,
        unit: d.unit,
        status: "active",
      },
    ],
  };
}
export function reviseHabit(
  s: State,
  id: string,
  d: Draft,
  status: Schedule["status"] = "active",
): State {
  const tomorrow = [
    addDays(localDate(s.profile.timezone), 1),
    s.habits.find((h) => h.id === id)?.start || "",
  ]
    .sort()
    .at(-1)!;
  return {
    ...s,
    habits: s.habits.map((h) =>
      h.id !== id
        ? h
        : {
            ...h,
            name: d.name,
            description: d.description,
            category: d.category,
            schedules: [
              ...h.schedules.filter((v) => v.effective !== tomorrow),
              {
                effective: tomorrow,
                days: d.days,
                target: d.type === "boolean" ? 1 : d.target,
                type: d.type,
                unit: d.unit,
                status,
              },
            ],
          },
    ),
  };
}
export function draftOf(h: Habit): Draft {
  const v = [...h.schedules].sort((a, b) =>
    b.effective.localeCompare(a.effective),
  )[0];
  return {
    name: h.name,
    category: h.category as Draft["category"],
    description: h.description,
    start: h.start,
    type: v.type,
    target: v.target,
    unit: v.unit,
    days: v.days,
  };
}
export function emptyState(zone = "UTC"): State {
  return {
    version: 1,
    revision: 0,
    profile: {
      name: "Friend",
      timezone: zone,
      goal: "Make time for what matters",
      preferred: "Morning",
      theme: "light",
      aiEnabled: true,
      shareJournal: false,
      onboarded: false,
      timezoneHistory: [],
    },
    habits: [],
    entries: [],
    reflections: [],
  };
}
export function demoState(zone = "UTC"): State {
  const s = emptyState(zone),
    today = localDate(zone),
    start = addDays(today, -20);
  const samples: Draft[] = [
    {
      name: "Read a few pages",
      category: "Learning",
      description: "A little reading before the day gets busy.",
      type: "quantity",
      target: 10,
      unit: "pages",
      days: [0, 1, 2, 3, 4, 5, 6],
      start,
    },
    {
      name: "Practise coding",
      category: "Learning",
      description: "One small problem or something worth building.",
      type: "quantity",
      target: 30,
      unit: "minutes",
      days: [0, 1, 2, 3, 4, 5, 6],
      start,
    },
    {
      name: "Go for a walk",
      category: "Wellbeing",
      description: "Step outside and enjoy a change of scene.",
      type: "quantity",
      target: 20,
      unit: "minutes",
      days: [0, 1, 2, 3, 4, 5, 6],
      start,
    },
    {
      name: "Write in my journal",
      category: "Mindfulness",
      description: "A few words about today.",
      type: "boolean",
      target: 1,
      unit: "",
      days: [0, 1, 2, 3, 4, 5, 6],
      start,
    },
  ];
  s.habits = samples.map(makeHabit);
  for (const [i, h] of s.habits.entries())
    for (const [j, date] of dates(start, today).entries()) {
      if (date === today ? i === 0 : (j + i * 3) % 7 !== 0 && (j + i) % 5 !== 0)
        s.entries.push({
          habitId: h.id,
          date,
          value: h.schedules[0].target,
          note: "",
          timezone: zone,
          updatedAt: new Date().toISOString(),
        });
    }
  return s;
}
export function evidence(s: State, ids?: string[]) {
  const today = localDate(s.profile.timezone),
    end = addDays(today, -1),
    from = addDays(end, -6);
  return {
    from,
    to: end,
    ...stats(s, from, end, ids),
    habits: s.habits
      .filter((h) => !ids?.length || ids.includes(h.id))
      .map((h) => ({
        id: h.id,
        name: h.name,
        ...stats(s, from, end, [h.id]),
        ...streaks(s, h, today),
      })),
  };
}
export function fallbackSuggestion(s: State) {
  const data = evidence(s);
  const missed = data.habits.find(
    (h) => h.scheduled >= 3 && h.completed / h.scheduled < 0.5,
  );
  return missed
    ? `You completed ${missed.completed} of ${missed.scheduled} scheduled occurrences of “${missed.name}” in the last seven full days. Try a smaller target or fewer days next week. You decide what changes.`
    : "Give your next habit a specific moment in your day. A small, repeatable step is a good place to start.";
}
