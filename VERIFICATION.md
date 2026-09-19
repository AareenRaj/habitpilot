# Verification performed

## Automated checks that ran successfully

- TypeScript strict typecheck.
- Native Next.js 16 production build.
- Sites/Cloudflare production build.
- 15 core automated tests: selected weekdays, start boundaries, quantity threshold, duplicate upsert, undo + serialization, scheduled-occurrence streaks, unfinished today, paused intervals, prospective targets/weekdays, future-date rejection, timezone boundaries/DST/leap day, immutable entry timezone, eligible denominators, duplicate schema rejection, natural-language fallback, bounded goal breakdown, and demo seed validity. Several related assertions share one test.
- 12 PostgreSQL/PGlite checkpoints: complete migration execution, snapshot round trip, revision conflicts, two-user isolation on all seven tables, denied direct writes/deletes, anonymous denial, immutable historical schedule, unique check-in and rollback, future check-in rejection, prospective version preservation, atomic AI limits, isolated cache, and auth-user deletion cascade. Several related assertions share one checkpoint.

## Browser flows exercised

- Loaded local demo with sample history.
- Created `QA daily learning`, completed it, refreshed, verified completion, undid it, refreshed, verified undo.
- Changed a reading habit target from 10 to 20 and removed Saturday from its future schedule. Reopened the prior Saturday and verified its original target remained 10 and its completion was retained.
- Corrected that past quantity entry from 10 to 6. The heatmap changed to not complete.
- Analytics then showed 17 / 28 = 61% for the seven full days (previously 18 / 28 = 64%). The new habits added today did not inflate the historical denominator.
- Entered “Help me practise Java for 30 minutes on weekdays.” The rule-based draft had name `Practise Java`, target 30, unit minutes, and weekday schedule. Reviewed and explicitly saved it. Verified the habit in the exported data.
- Triggered JSON export; inspected the actual browser-downloaded file and confirmed all six habits, schedule history, entries, profile, and reflection fields. The browser automation download-event hook timed out, but the files themselves downloaded successfully and were checked on disk.
- Viewed desktop at approximately 1348 pixels and mobile in a 390 × 844 iframe. Verified mobile bottom navigation, displayed habits, dark theme, and completion action. This is a browser-width test, not a physical-phone test.

## Not verified against live services

No user credentials were supplied. Live Supabase signup/email delivery, token refresh, account deletion through the Admin API, and provider-generated AI responses were not exercised. The PostgreSQL tests use the actual migration and real SQL/RLS semantics with a simulated Supabase identity function; they are not a substitute for the supplied optional live integration test. Full screen-reader/Safari/device coverage, load tests, and high-concurrency multi-device testing remain outstanding.

See README.md for exact test/setup commands and limits.
