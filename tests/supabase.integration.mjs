// Use a disposable Supabase project with the migration applied.
// Creates two ephemeral users with fake addresses; always deletes them in finally.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const url = process.env.SUPABASE_URL,
  anon = process.env.SUPABASE_ANON_KEY,
  service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anon || !service) {
  console.log("SKIPPED: live Supabase credentials are required.");
  process.exit(0);
}
if (process.env.HABITPILOT_TEST_PROJECT !== "true")
  throw new Error(
    "Set HABITPILOT_TEST_PROJECT=true only for a disposable test project.",
  );
const users = [];
let a, b;
async function req(path, token, method = "GET", data) {
  const r = await fetch(url + path, {
    method,
    headers: {
      apikey: token === service ? service : anon,
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { status: r.status, data: await r.json().catch(() => null) };
}
try {
  for (let i = 0; i < 2; i++) {
    const email = `habitpilot-test-${randomUUID()}@example.com`,
      password = randomUUID() + "!aB";
    const a = await req("/auth/v1/admin/users", service, "POST", {
      email,
      password,
      email_confirm: true,
    });
    assert.equal(a.status, 200);
    users.push(a.data.id);
    const t = await req("/auth/v1/token?grant_type=password", anon, "POST", {
      email,
      password,
    });
    assert.equal(t.status, 200);
    if (i === 0) a = t.data.access_token;
    else b = t.data.access_token;
  }
  const date = new Date().toISOString().slice(0, 10),
    id = randomUUID(),
    state = {
      version: 1,
      revision: 0,
      profile: {
        name: "Test A",
        timezone: "UTC",
        goal: "Test",
        preferred: "Morning",
        theme: "light",
        aiEnabled: true,
        shareJournal: false,
        onboarded: true,
        timezoneHistory: [],
      },
      habits: [
        {
          id,
          name: "Private A",
          category: "Learning",
          description: "",
          start: date,
          createdAt: new Date().toISOString(),
          schedules: [
            {
              effective: date,
              days: [0, 1, 2, 3, 4, 5, 6],
              target: 1,
              type: "boolean",
              unit: "",
              status: "active",
            },
          ],
        },
      ],
      entries: [],
      reflections: [],
    };
  const saved = await req("/rest/v1/rpc/save_habitpilot", a, "POST", {
    payload: state,
    expected_revision: 0,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  const other = await req("/rest/v1/habits?user_id=eq." + users[0], b);
  assert.equal(other.status, 200);
  assert.deepEqual(other.data, []);
  for (const table of [
    "profiles",
    "schedule_history",
    "check_ins",
    "reflections",
    "ai_reviews",
    "ai_rate_limits",
  ]) {
    const r = await req("/rest/v1/" + table + "?user_id=eq." + users[0], b);
    assert.equal(r.status, 200);
    assert.deepEqual(r.data, []);
  }
  const attack = await req(
    "/rest/v1/habits?user_id=eq." + users[0],
    b,
    "PATCH",
    { name: "Hijacked" },
  );
  assert.ok(attack.status >= 400);
  const anonRead = await req("/rest/v1/habits", anon);
  assert.ok(anonRead.status >= 400);
  const conflict = await req("/rest/v1/rpc/save_habitpilot", a, "POST", {
    payload: state,
    expected_revision: 0,
  });
  assert.ok(conflict.status >= 400);
  const read = await req("/rest/v1/rpc/load_habitpilot", a, "POST", {});
  assert.equal(read.data.habits[0].name, "Private A");
  console.log(
    "PASS: two-user RLS isolation, direct writes denied, anon denied, stale revision denied, owner data unchanged.",
  );
} finally {
  for (const id of users) {
    const r = await req("/auth/v1/admin/users/" + id, service, "DELETE");
    assert.ok(r.status < 300, "Test-user cleanup failed");
  }
}
