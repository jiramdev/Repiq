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
- **PWA**: installable (manifest + maskable icons), offline fallback, update prompt.

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

Every migration is idempotent. Where existing data could block a constraint, the
migration skips it and prints a `NOTICE` with a query to find the offending rows.

### Environment variables

See [`.env.example`](.env.example). Only `DATABASE_URL` is required. Web Push
needs the VAPID keys; background rest-timer notifications additionally need
[Upstash QStash](https://upstash.com/docs/qstash) (free tier is plenty). Every
optional feature turns itself off cleanly when its variables are missing.

### Icons

`public/icon.svg` is the source. Regenerate the PNGs (192/512, maskable,
badge, apple-touch-icon) with `npm run icons`.

## Scripts

| Command | |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest: unit tests plus auth/ownership tests against an in-memory Postgres (PGlite) running the real migrations |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build on every
pull request.

## How it fits together

- **Auth**: `lib/auth.ts`. The cookie holds a random 256-bit token; only its
  SHA-256 hash is stored in `sessions`. Passwords are bcrypt hashes (legacy
  plain-text values are upgraded on the next login). `proxy.ts` is a cheap
  first gate (cookie present?); every page, server action and API route
  validates the session against the database.
- **Data access**: every query is scoped to the signed-in user, including
  updates by id (joined to the owning plan/session).
- **Workout sessions**: each run of a schedule day is a `workout_sessions` row
  with its own sets, seeded in one transaction under an advisory lock.
- **Rest push**: `/api/push/schedule` stores a `rest_timers` row and publishes a
  delayed QStash message; QStash calls the signature-verified
  `/api/push/deliver`, which sends the Web Push unless the timer was cancelled.
- **Service worker**: `public/sw.js`, registered once in the root layout
  (`components/pwa.tsx`). Bump `VERSION` in it when its caching logic changes.
- **Copy**: all user-facing strings are in `lib/strings.ts`.
