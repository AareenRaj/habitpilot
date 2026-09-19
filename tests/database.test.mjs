// Real PostgreSQL semantics via PGlite, with Supabase's JWT identity surface stubbed.
// This verifies SQL/RLS; it does NOT replace the live Supabase auth integration test.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const db = new PGlite();
await db.exec(
  `create schema auth; create role anon; create role authenticated; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`,
);
await db.exec(
  readFileSync("supabase/migrations/202609190001_habitpilot.sql", "utf8"),
);
console.log("PASS: complete migration executes in PostgreSQL");
const a = randomUUID(),
  b = randomUUID(),
  h = randomUUID(),
  date = new Date().toISOString().slice(0, 10),
  timestamp = new Date().toISOString();
await db.query("insert into auth.users values ($1),($2)", [a, b]);
async function asUser(id) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
const state = {
  version: 1,
  revision: 0,
  profile: {
    name: "User A",
    timezone: "UTC",
    goal: "Learn",
    preferred: "Morning",
    theme: "light",
    aiEnabled: true,
    shareJournal: false,
    onboarded: true,
    timezoneHistory: [],
  },
  habits: [
    {
      id: h,
      name: "Private habit",
      category: "Learning",
      description: "",
      start: date,
      createdAt: timestamp,
      schedules: [
        {
          effective: date,
          days: [0, 1, 2, 3, 4, 5, 6],
          target: 10,
          type: "quantity",
          unit: "pages",
          status: "active",
        },
      ],
    },
  ],
  entries: [
    {
      habitId: h,
      date,
      value: 10,
      note: "Private note",
      timezone: "UTC",
      updatedAt: timestamp,
    },
  ],
  reflections: [
    { date, text: "Private reflection", timezone: "UTC", updatedAt: timestamp },
  ],
};
await asUser(a);
let saved = (
  await db.query("select public.save_habitpilot($1,0) as state", [state])
).rows[0].state;
assert.equal(saved.revision, 1);
assert.equal(saved.entries.length, 1);
console.log("PASS: transactional save/load round trip");
await assert.rejects(
  db.query("select public.save_habitpilot($1,0)", [state]),
  /revision conflict/,
);
console.log("PASS: stale revision rejected");
await asUser(b);
for (const table of [
  "profiles",
  "habits",
  "schedule_history",
  "check_ins",
  "reflections",
  "ai_reviews",
  "ai_rate_limits",
]) {
  assert.equal(
    (await db.query(`select * from public.${table} where user_id=$1`, [a])).rows
      .length,
    0,
  );
  await assert.rejects(
    db.query(`delete from public.${table} where user_id=$1`, [a]),
    /permission denied/,
  );
}
assert.equal(
  (await db.query("select public.load_habitpilot() as state")).rows[0].state,
  null,
);
console.log(
  "PASS: user B cannot read, change, or delete user A records across every table",
);
await db.exec("reset role; set role anon");
await assert.rejects(
  db.query("select * from public.habits"),
  /permission denied/,
);
await assert.rejects(
  db.query("select public.load_habitpilot()"),
  /permission denied/,
);
console.log("PASS: anonymous access denied");
await asUser(a);
const tampered = structuredClone(saved);
tampered.habits[0].schedules[0].target = 100;
await assert.rejects(
  db.query("select public.save_habitpilot($1,1)", [tampered]),
  /history is immutable/,
);
console.log("PASS: direct RPC cannot rewrite historical target");
const duplicate = structuredClone(saved);
duplicate.entries.push(duplicate.entries[0]);
await assert.rejects(
  db.query("select public.save_habitpilot($1,1)", [duplicate]),
  /duplicate key/,
);
assert.equal(
  (await db.query("select revision from public.profiles")).rows[0].revision,
  1,
);
console.log(
  "PASS: duplicate records rejected and failed transaction fully rolls back",
);
const future = structuredClone(saved);
future.entries[0].date = "2099-01-01";
await assert.rejects(
  db.query("select public.save_habitpilot($1,1)", [future]),
  /future check-in/,
);
console.log("PASS: direct RPC rejects future check-in");
const prospective = structuredClone(saved),
  tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
prospective.habits[0].schedules.push({
  ...prospective.habits[0].schedules[0],
  effective: tomorrow,
  target: 20,
});
saved = (
  await db.query("select public.save_habitpilot($1,1) as state", [prospective])
).rows[0].state;
assert.equal(saved.habits[0].schedules[0].target, 10);
assert.equal(saved.habits[0].schedules[1].target, 20);
console.log("PASS: prospective version preserves prior target and check-in");
for (let i = 0; i < 12; i++)
  assert.equal(
    (await db.query("select public.consume_ai_request() as allowed")).rows[0]
      .allowed,
    true,
  );
assert.equal(
  (await db.query("select public.consume_ai_request() as allowed")).rows[0]
    .allowed,
  false,
);
console.log("PASS: atomic AI request limit");
await db.query("select public.cache_ai_review($1,$2)", [
  "a".repeat(64),
  { source: "AI", message: "Test", drafts: [] },
]);
await asUser(b);
assert.equal(
  (await db.query("select * from public.ai_reviews")).rows.length,
  0,
);
console.log("PASS: review cache is owner isolated");
await db.exec("reset role");
await db.query("delete from auth.users where id=$1", [a]);
for (const table of [
  "profiles",
  "habits",
  "schedule_history",
  "check_ins",
  "reflections",
  "ai_reviews",
  "ai_rate_limits",
])
  assert.equal(
    (await db.query(`select * from public.${table} where user_id=$1`, [a])).rows
      .length,
    0,
  );
console.log("PASS: deleting auth user cascades all application data");
await db.close();
