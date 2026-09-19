# HabitPilot

A complete habit tracker with local demo mode, Supabase accounts, verified analytics, and optional server-side AI.

## Run it on your laptop — no keys required

1. Install Node.js 22.13 or newer (Node 22 LTS is suitable).
2. Extract this folder and open a terminal **inside `HabitPilot`**, where `package.json` is located.
3. Run these commands:

```powershell
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev:next
```

On macOS/Linux, replace `Copy-Item .env.example .env.local` with `cp .env.example .env.local`.

Open **http://localhost:3000**. Keep that terminal open. Stop the app with Ctrl+C. If port 3000 is busy, use `pnpm dev:next --port 3001` and open http://localhost:3001.

All environment values can remain empty. You immediately get four sample habits, three weeks of sample history, local persistence, and explicitly labelled rule-based coaching. “Set up your profile” replaces sample data with a fresh routine. You may skip every starter suggestion. Sign-in does not silently import the demo into your account.

### Production using standard Next.js

```sh
pnpm build:next
pnpm start:next
```

This is a real Next.js 16 / React 19 App Router application. Both the standard Next.js production build and the hosted build were tested. `dev:next`, `build:next`, and `start:next` use native Next.js. The separate `dev`, `build`, and `start` scripts are retained for the Sites Cloudflare hosting adapter (Vinext). That adapter is beta; the native Next.js runtime does not depend on it. The lockfile pins the complete compatible dependency set. Do not replace it or independently upgrade React/Next.

## Connect Supabase

Use a new Supabase project for this app.

1. Open the project's SQL Editor.
2. Paste and execute **the entire** `supabase/migrations/202609190001_habitpilot.sql` file once. It creates profiles, habits, schedule history, check-ins, reflections, AI reviews, and request counters, including constraints, foreign keys, RLS, indexes, and protected RPCs.
3. In the project settings, find the Project URL and API keys.
4. Edit `.env.local`:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Use the project's legacy `anon` and `service_role` keys for this HTTP integration. The service-role key is used only on the server for deleting the currently authenticated account. Never put any of these in a `NEXT_PUBLIC_` variable, browser code, a screenshot, or Git.

5. In Supabase Authentication, enable email/password sign-in. Configure the Site URL for your app (locally: `http://localhost:3000`). Leave email confirmation enabled and configure email delivery if needed.
6. Restart the server (Ctrl+C, then `pnpm dev:next`). Choose **Connect account → Create an account**. Confirm the email, then sign in. New accounts start empty; enter your profile/timezone and optional starter habits.
7. Settings → Delete account permanently removes the authenticated user via the Supabase Admin API. Foreign-key cascades remove all application records. A missing service-role key produces an explicit error and does not claim to delete the account.

For the hosted copy, configure the same names as server environment secrets in its hosting environment and redeploy. Local `.env.local` is never uploaded.

### How authentication works

The server exchanges email/password with Supabase Auth over HTTPS. Access and refresh tokens stay in HttpOnly, SameSite=Lax cookies (Secure in production). Every protected API route verifies the token with Supabase; an expired access token is refreshed server-side. State requests use that user's token, never the service-role key. Every mutation checks its Origin and validates bounded input. Supabase's own Auth endpoint rate limits also apply to login/sign-up.

## Connect an AI provider

Use an OpenAI-compatible **Chat Completions** API supporting JSON response mode. This implementation does not require Ollama or any local model.

```dotenv
AI_API_KEY=YOUR_PROVIDER_KEY
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=YOUR_JSON_CAPABLE_MODEL_ID
```

Choose a model available in your provider account; no model or credit is bundled. Endpoint must use HTTPS. For another compatible provider, change the base URL and model. Restart your server after changes. Sign in to a Supabase account, save a profile or habit, and enable AI in Settings. Anonymous/demo users always use the local rule engine, even when a provider key is configured, to prevent anonymous API spending.

### AI data flow

1. The browser sends only task type, prompt, and selected habit IDs to `/api/ai`.
2. The server authenticates the user and loads their records from Supabase.
3. `core.ts` calculates scheduled counts, completions, rates, and streaks in code. The last seven **full** days are used for weekly reviews.
4. The server sends the minimum relevant context. Draft creation excludes activity history. Reviews/coaching include only selected habits and verified statistics. Private notes/reflections are omitted by default. Explicit opt-in includes a bounded excerpt from the same seven-day window (up to 7 reflections and 12 notes).
5. All habit names and journal text are placed in a user-data envelope, never in the system prompt. Responses are validated using Zod; malformed/unsafe drafts fall back.
6. Drafts are never saved automatically. The user reviews and edits each draft in the normal habit form.
7. Reviews/coaching use constrained AI-selected advice codes. The app renders verified factual sentences and a vetted adjustment, so the model cannot invent completion counts or patterns. This intentionally limits free-form chat.
8. Weekly reviews are cached per owner using a SHA-256 key over the relevant context, model, prompt, date range, and policy version. Relevant activity/settings changes invalidate the key. Only the latest 20 reviews are retained per user. No raw prompt or journal content is stored in the cache.

AI limits: 1,200 prompt characters; 8 KB HTTP input; 1,200 output tokens; 18-second provider timeout; 12 requests per clock hour and 60 per UTC day per account, enforced transactionally in PostgreSQL. Invalid responses, missing credentials, network failures, and limits produce clearly labelled rule-based suggestions. There are no automatic background AI calls.

## Tracking rules

- Timestamps use ISO UTC / PostgreSQL `timestamptz`. Calendar dates are derived using the profile's IANA timezone.
- Check-ins are uniquely keyed by `(user_id, habit_id, local_date)`. Repeating the same update replaces the value; it cannot append duplicate records. Quick save actions are locked while a request is pending.
- Quantity habits complete at or above the target effective on that date. Yes/no habits complete at value 1.
- Streaks count consecutive **scheduled active occurrences**. Unscheduled, paused, and archived dates are skipped. An unfinished today does not break a current streak until tomorrow.
- Schedule, target, tracking type, and pause/archive/resume changes take effect tomorrow (or at a future habit's start date). Names/descriptions update immediately. Past schedule versions stay immutable in the app and database RPC. Start dates cannot be moved after creation.
- Corrections can change past check-in values and notes, but cannot add future or unscheduled check-ins. Creation starts today or later; backfilling a new habit before its start is deliberately unsupported.
- Completion rate = completed eligible occurrences / eligible scheduled occurrences. No scheduled occurrences means “—”, not 0%. Weekly/monthly analytics use rolling 7/30 full local dates, excluding today. The dashboard mini-chart covers the last seven days including today; its denominator can change as today progresses.
- Timezone changes need confirmation. Existing local-date labels and entry timezones are never rewritten. Change timestamps/zones are retained in the profile. “Today” and future eligibility use the new zone immediately. Crossing the date line may skip or repeat a local calendar label; repeated labels share one record. Calendar labels, not elapsed 24-hour periods, are the tracking unit. This policy prevents silent history migration.
- Deleting a habit permanently removes its history and therefore changes aggregate analytics; the confirmation explains this. Archive instead to keep history.

## Folder guide

| Path | Responsibility |
| --- | --- |
| `app/page.tsx`, `app/{habits,analytics,coach,settings}/page.tsx` | Five app routes |
| `components/habitpilot.tsx` | App shell, forms, onboarding, today, habits, coach, settings, persistence orchestration |
| `components/analytics-view.tsx` | Lazy-loaded Recharts analytics |
| `components/ui/` | Reusable shadcn/ui primitives |
| `lib/habitpilot/core.ts` | Data schemas, dates, eligibility, check-ins, schedule versions, streaks, metrics, demo seed |
| `lib/habitpilot/ai.ts` | AI input/output schemas and offline rule engine |
| `lib/habitpilot/server.ts` | Supabase HTTP adapter, cookies, body limits, origin checks, transition validation |
| `app/api/` | Server auth, state, AI, config, account-deletion routes |
| `supabase/migrations/` | PostgreSQL schema, RLS and transaction functions |
| `supabase/seed.sql` | Documents the deterministic, date-relative browser seed; real users start empty |
| `tests/` | Core rules, real PostgreSQL semantics/RLS, optional live Supabase test |
| `.env.example` | Safe configuration template |
| `VERIFICATION.md` | Checks actually performed and remaining gaps |
| `build/`, `scripts/`, `.openai/`, `vite.config.ts` | Hosted Sites adapter; not needed for native Next.js development |

Start learning the implementation at `core.ts`, then read `tests/core.test.ts`, then the UI. All date/statistic functions are ordinary TypeScript functions with no UI or network dependencies.

## Test commands

```sh
pnpm typecheck
pnpm test
pnpm test:db
pnpm build:next
```

`test:db` runs the actual migration in PGlite (PostgreSQL in WebAssembly), creates two identities, and tests RLS, read/write denial, transactional rollback, immutable history, uniqueness, request limits, and cascade deletion. It stubs only Supabase's `auth.users` and `auth.uid()` interfaces; it does not call a live Supabase project or validate email delivery.

For the optional live test, use a **disposable** Supabase project with the migration applied, add `HABITPILOT_TEST_PROJECT=true` to `.env.local`, then run:

```sh
pnpm test:integration
```

It creates two temporary test users, checks cross-user isolation, and deletes them in a `finally` block. Never run this against a project where you do not authorize creating/deleting test accounts. The credentials are read from `.env.local` and are not printed.

## Export and persistence

Settings → Export my data downloads JSON with profile, habits, every schedule version, entries, and reflections. Browser demo data stays in `localStorage` under `habitpilot-demo-v1`; clearing browser storage removes it. Account saves are bounded, atomic relational snapshots using a revision check: concurrent stale saves are rejected with a reload message instead of silently overwriting a newer version. Failed saves keep the form open. Local tabs use revision checks and a storage event; truly simultaneous local-tab writes are not transactionally serialized across browsers. Use account mode for stronger concurrency guarantees.

## Remaining limitations

- No credentials are bundled. Live Supabase email/password/refresh/deletion and real provider responses require configuration and were not exercised against your accounts.
- No push notifications, email reminders, or background timers. Preferred time is a planning preference only.
- No password-reset interface or OAuth providers in this version; email/password auth is implemented. Configure secure recovery in Supabase before opening registration widely.
- Rule-based natural-language parsing handles common names/durations/weekdays; it is deliberately limited and labelled. Real AI is optional; coaching is constrained to a set of practical adjustments.
- “Monthly” is rolling 30 days, not a calendar-month report. Analytics need at least three scheduled occurrences for a trend chart.
- Demo data does not automatically migrate into an account; JSON import is not implemented.
- Bounded snapshot saves prioritize clarity and atomicity over very large histories: 100 habits, 50,000 check-ins, 2 MB request maximum. A high-volume app should migrate to per-record RPC mutations and incremental analytics.
- Timezone travel uses the explicit calendar-label policy above, not a travel-adjusted streak algorithm.
- Mobile QA uses a real 390 × 844 browser frame, not a physical phone. Full screen-reader, Safari, and offline/PWA audits remain outstanding.
- No payments, social feed, leaderboard, or gamification is included.
