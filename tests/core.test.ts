import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  makeHabit,
  checkIn,
  eligible,
  complete,
  streaks,
  stats,
  localDate,
  addDays,
  stateSchema,
  scheduleAt,
  demoState,
} from "../lib/habitpilot/core";
import { ruleResponse } from "../lib/habitpilot/ai";
function fixture() {
  const s = emptyState("UTC");
  s.habits = [
    makeHabit({
      name: "Read",
      category: "Learning",
      description: "",
      type: "quantity",
      target: 10,
      unit: "pages",
      start: "2026-09-07",
      days: [1, 3, 5],
    }),
  ];
  return s;
}
const now = new Date("2026-09-19T12:00:00Z");
test("selected weekdays only are eligible", () => {
  const s = fixture(),
    h = s.habits[0];
  assert.equal(eligible(h, "2026-09-07"), true);
  assert.equal(eligible(h, "2026-09-08"), false);
  assert.equal(eligible(h, "2026-09-04"), false);
});
test("quantity completes at target and above", () => {
  let s = fixture();
  const h = s.habits[0];
  s = checkIn(s, h.id, "2026-09-07", 9, "", now);
  assert.equal(complete(s, h, "2026-09-07"), false);
  s = checkIn(s, h.id, "2026-09-07", 10, "", now);
  assert.equal(complete(s, h, "2026-09-07"), true);
  s = checkIn(s, h.id, "2026-09-07", 12, "", now);
  assert.equal(complete(s, h, "2026-09-07"), true);
});
test("duplicate check-ins upsert, undo survives JSON persistence", () => {
  let s = fixture();
  const h = s.habits[0];
  for (let i = 0; i < 20; i++) s = checkIn(s, h.id, "2026-09-07", 10, "", now);
  assert.equal(s.entries.length, 1);
  s = checkIn(s, h.id, "2026-09-07", 0, "", now);
  const reloaded = stateSchema.parse(JSON.parse(JSON.stringify(s)));
  assert.equal(reloaded.entries.length, 1);
  assert.equal(complete(reloaded, h, "2026-09-07"), false);
});
test("streaks skip unscheduled days", () => {
  let s = fixture();
  const h = s.habits[0];
  for (const d of ["2026-09-07", "2026-09-09", "2026-09-11"])
    s = checkIn(s, h.id, d, 10, "", now);
  assert.deepEqual(streaks(s, h, "2026-09-13"), { current: 3, best: 3 });
});
test("unfinished today does not break streak until day ends", () => {
  let s = fixture();
  const h = s.habits[0];
  s = checkIn(s, h.id, "2026-09-07", 10, "", now);
  assert.equal(streaks(s, h, "2026-09-09").current, 1);
  assert.equal(streaks(s, h, "2026-09-10").current, 0);
});
test("paused periods excluded from denominator and streak breaks", () => {
  let s = fixture();
  const h = s.habits[0];
  h.schedules.push(
    { ...h.schedules[0], effective: "2026-09-09", status: "paused" },
    { ...h.schedules[0], effective: "2026-09-14" },
  );
  s = checkIn(s, h.id, "2026-09-07", 10, "", now);
  s = checkIn(s, h.id, "2026-09-14", 10, "", now);
  assert.equal(streaks(s, h, "2026-09-14").current, 2);
  assert.equal(stats(s, "2026-09-07", "2026-09-14").scheduled, 2);
});
test("prospective target and weekday versions preserve history", () => {
  let s = fixture();
  const h = s.habits[0];
  s = checkIn(s, h.id, "2026-09-07", 10, "", now);
  h.schedules.push({
    ...h.schedules[0],
    effective: "2026-09-08",
    target: 20,
    days: [2, 4],
  });
  assert.equal(complete(s, h, "2026-09-07"), true);
  assert.equal(eligible(h, "2026-09-09"), false);
  assert.equal(scheduleAt(h, "2026-09-08")?.target, 20);
});
test("future and unscheduled entries rejected", () => {
  const s = fixture(),
    h = s.habits[0];
  assert.throws(() => checkIn(s, h.id, "2026-09-21", 10, "", now));
  assert.throws(() => checkIn(s, h.id, "2026-09-08", 10, "", now));
});
test("timezone calendar boundaries, DST, and leap dates", () => {
  const t = new Date("2026-09-19T00:30:00Z");
  assert.equal(localDate("America/Los_Angeles", t), "2026-09-18");
  assert.equal(localDate("Asia/Kolkata", t), "2026-09-19");
  assert.equal(
    localDate("America/New_York", new Date("2026-03-08T06:59:00Z")),
    "2026-03-08",
  );
  assert.equal(
    localDate("America/New_York", new Date("2026-03-08T07:01:00Z")),
    "2026-03-08",
  );
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
});
test("timezone changes preserve old labels and do not duplicate a local date", () => {
  let s = fixture();
  const h = s.habits[0];
  s = checkIn(s, h.id, "2026-09-07", 10, "", now);
  s.profile.timezone = "America/Los_Angeles";
  s = checkIn(s, h.id, "2026-09-07", 11, "", now);
  assert.equal(s.entries.length, 1);
  assert.equal(s.entries[0].timezone, "UTC");
});
test("completion rates use only eligible occurrences", () => {
  let s = fixture();
  const h = s.habits[0];
  s = checkIn(s, h.id, "2026-09-07", 10, "", now);
  s = checkIn(s, h.id, "2026-09-09", 5, "", now);
  assert.equal(stats(s, "2026-09-07", "2026-09-13").rate, 33);
  assert.equal(stats(s, "2026-09-08", "2026-09-08").rate, null);
});
test("state schema rejects duplicate check-ins", () => {
  let s = fixture();
  s = checkIn(s, s.habits[0].id, "2026-09-07", 10, "", now);
  s.entries.push(s.entries[0]);
  assert.equal(stateSchema.safeParse(s).success, false);
});
test("rule-based natural language draft handles Java duration and weekdays", () => {
  const r = ruleResponse(
    "draft",
    "Help me practise Java for 30 minutes on weekdays",
    fixture(),
  );
  assert.equal(r.source, "Rule-based");
  assert.equal(r.drafts[0].target, 30);
  assert.deepEqual(r.drafts[0].days, [1, 2, 3, 4, 5]);
  assert.equal(r.drafts[0].name, "Practise Java");
});
test("goal breakdown returns a small reviewable set", () => {
  const r = ruleResponse(
    "breakdown",
    "Learn Java with 20 minutes daily",
    fixture(),
  );
  assert.equal(r.drafts.length, 2);
  assert.equal(fixture().habits.length, 1);
});
test("demo seed is valid and has real calculable history", () => {
  const s = demoState("Asia/Kolkata");
  assert.equal(stateSchema.safeParse(s).success, true);
  assert.equal(s.habits.length, 4);
  assert.ok(s.entries.length > 30);
});
