# repiq

A minimalist, mobile-first workout tracker, built as an installable PWA.
Plan your week, log sets at the gym (even on bad wifi), get a buzz when your
rest is over, and see your streak.

Built with Next.js 16 (App Router, Cache Components), React 19, Tailwind CSS 4
and Neon Postgres. Deployed on Vercel.

## Features

- **Week schedule**: assign a plan to each weekday; days link to plans by id.
- **Plans**: exercises with sets, reps and rest; a shared exercise library with
  private copy-on-write edits.
- **Workout mode**: one exercise at a time, last session's numbers as
  placeholders, sets saved as you type (debounced, retried, kept on the device
  while offline), screen kept awake.
- **Rest timer**: counts down to an end time (survives backgrounding), ±15 s and
  skip, sound and vibration at zero, and an optional push notification for any
  rest length.
- **Units**: kg or lbs everywhere; each logged weight remembers its unit.
- **Timezone aware**: "today" is the user's day (detected at sign-in, Europe/Amsterdam by default).
- **Workout lock-in**: while a workout is open it is the only screen. Every
  other page (and reloads, deep links, PWA reopen and the offline fallback)
  lands on it; the nav is hidden and schedule/plan/account changes and sign-out
  are refused until you **Finish** (only once every set has synced) or
  **Discard** (two taps). Unfinished workouts from an earlier day that have
  logged sets lock too and show a notice; empty ones are dropped quietly.
- **Body weight**: asked (optionally) at sign-up in kg or lbs, editable in
  Account, and every change is logged for Statistics.
- **PWA**: installable (manifest + maskable icons), iOS startup images, one
  loading screen, offline fallback, update prompt.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL at minimum
npm run dev
```

Open http://localhost:3000 and create an account.

### Database

The schema lives in [`db/migrations`](db/migrations), as numbered SQL files
that you run yourself, in order, against your database (for example in the Neon
SQL editor or with `psql "$DATABASE_URL" -f db/migrations/0001_auth_sessions.sql`).

| File | What it does |
| --- | --- |
| `0000_baseline.sql` | The original tables (no-op on an existing database) |
| `0001_auth_sessions.sql` | `sessions` table for server-side sessions |
| `0002_plan_links.sql` | `workouts.plan_id` foreign key + backfill from titles |
| `0003_workout_sessions.sql` | `workout_sessions`, per-session sets, several sessions per day |
| `0004_timezone_units_rest_timers.sql` | user timezone, `workout_logs.weight_unit`, `rest_timers` |
| `0005_unique_identities.sql` | case-insensitive unique usernames and emails |
| `0006_hash_plaintext_passwords.sql` | bcrypt-hashes any leftover plain-text passwords (pgcrypto). **Run before deploying the code that removed plain-text login.** |
| `0007_rate_limits.sql` | `rate_limits` table, expired-session cleanup, open-session index |
| `0008_profile_body_weight.sql` | `user_profiles.body_weight` / `body_weight_unit`, backfilled from the weight log |

Every migration is idempotent. Where existing data could block a constraint, the
migration skips it and prints a `NOTICE` with a query to find the offending rows.

### Environment variables

See [`.env.example`](.env.example). Only `DATABASE_URL` is required. Web Push
needs the VAPID keys; background rest-timer notifications additionally need
[Upstash QStash](https://upstash.com/docs/qstash) (free tier is plenty). Every
optional feature turns itself off cleanly when its variables are missing.

`APP_URL` matters when you use a custom domain: QStash signatures are checked
against `${APP_URL}/api/push/deliver` (falling back to the Vercel production
domain), so it must be the URL QStash actually calls.

### Rate limiting

Sign-in, sign-up, the username check, password changes and rest-timer
scheduling are rate limited (`lib/rate-limit.ts`). Counters live in the
`rate_limits` Postgres table (fixed windows, keys stored as SHA-256 hashes), so
it works across Vercel's serverless instances without another service. If the
table is unreachable the limiter logs a warning and lets the request through.
Set `RATE_LIMIT_DISABLED=1` to turn it off (e.g. for load tests).

### Deploying

Turn on **Skew Protection** (Pro/Enterprise plans; Project → Settings →
Advanced, with "Enable access to System Environment Variables" on, then
redeploy). It keeps server actions working for tabs that still run the previous
deployment. Without it, the app reloads such a tab once.

### Icons

`public/icon.svg` is the source of the app icons; `public/icons/logo.svg` (the
mark traced from the loading-screen artwork, also in `lib/logo.ts`) is the
source of the loading screen and the iOS startup images in `public/splash`
(sizes in `lib/splash-screens.json`). Regenerate all PNGs with `npm run icons`.

## Scripts

| Command | |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest: unit tests plus auth/ownership tests against an in-memory Postgres (PGlite) running the real migrations |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests, build and a
production-dependency `npm audit` on every pull request.

## How it fits together

- **Auth**: `lib/auth.ts`. The cookie holds a random 256-bit token; only its
  SHA-256 hash is stored in `sessions`. Sessions last 60 days from the last
  visit (renewed at most once a day); expired rows are cleaned up. Passwords
  are bcrypt hashes only. `proxy.ts` validates the session for page requests,
  renews it, and redirects to the open workout during lock-in; every page,
  server action and API route still checks the session against the database.
- **Data access**: every query is scoped to the signed-in user, including
  updates by id (joined to the owning plan/session).
- **Workout sessions**: each run of a schedule day is a `workout_sessions` row
  with its own sets, seeded in one transaction under an advisory lock.
- **Rest push**: `/api/push/schedule` stores a `rest_timers` row and publishes a
  delayed QStash message; QStash calls the signature-verified
  `/api/push/deliver`, which sends the Web Push unless the timer was cancelled.
- **Service worker**: `public/sw.js`, registered once in the root layout
  (`components/pwa.tsx`). Bump `VERSION` in it when its caching logic changes.
- **Lock-in**: `lib/workout-lock.ts` decides which open session is active,
  `lib/active-workout.ts` gives pages `requireIdleUserId()` and actions
  `workoutLockError()`, and `components/workout-lock.tsx` plus the service
  worker cover client navigations and offline starts.
- **Security headers**: CSP and friends in `next.config.ts`.
- **Copy**: all user-facing strings are in `lib/strings.ts`.
