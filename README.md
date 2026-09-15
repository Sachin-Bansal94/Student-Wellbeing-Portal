# Student Wellbeing Appointments — IIT (ISM) Dhanbad

A booking platform for the on-campus counsellors at the Health Center. Students sign in with
their institute Google account, see each counsellor's open slots for the week, and book a free
20-minute session. Bookings are held until the student confirms them from an email link, and
reminders go out 24 hours and 1 hour before the session.

## How it works

**Availability is a rule, not a list of rows.** Each counsellor has weekly `availability_rules`
(weekday + start/end time). Concrete slots are computed on request from those rules, minus any
`availability_exceptions` (leave, one-off extra hours), minus slots already taken. Nothing to
regenerate, nothing to drift.

**Double-booking is impossible at the database level.** A partial unique index on
`(counsellor_id, starts_at)` covering the live statuses means two students clicking the same slot
in the same instant can never both win — Postgres rejects the second insert and the API returns
`slot_taken`. This is enforced by the database, not by an application-level check that a race
could slip past.

**Every booking is validated against the real schedule.** The server never trusts a timestamp
from the client: `resolveSlot` recomputes the counsellor's slots for that date and rejects
anything off-grid, outside working hours, past the booking horizon, or inside the lead time.

**The confirmation step.** Booking creates a `pending` appointment holding the slot, and emails
a signed single-use token link. Confirming flips it to `confirmed` and schedules the reminders.
Anything still pending after 30 minutes is swept back into the pool.

**Reminders survive restarts.** Scheduled mail lives in a `scheduled_emails` table polled every
minute with `FOR UPDATE SKIP LOCKED`, not in in-memory timers that vanish when the process dies.

**Privacy is built in.** The availability endpoint returns only free/busy — never who booked a
slot. Students see only their own appointments; counsellors see only their own schedule.

## Stack

React 18 + Vite + TypeScript · Node/Express + TypeScript · PostgreSQL (raw SQL via `pg`) ·
Google Identity Services · Resend for transactional email.

## Running it locally

You need Node 18+ and a Postgres database. Either a local Postgres install or a free Neon
database works — all you need is the connection string.

```bash
# 1. Backend
cd server
copy .env.example .env       # cp on macOS/Linux
npm install
npm run migrate              # creates the tables
npm run seed                 # loads the three Health Center counsellors
npm run dev                  # http://localhost:4000

# 2. Frontend, in a second terminal
cd client
npm install
npm run dev                  # http://localhost:5173
```

Minimum `.env` to get running — everything else has a working default:

```
DATABASE_URL=postgresql://user:password@host:5432/wellbeing
JWT_SECRET=any-long-random-string-at-least-16-chars
CONFIRMATION_TOKEN_SECRET=another-long-random-string-at-least-16
ALLOW_DEV_LOGIN=true
```

### Testing without Google or Resend

`ALLOW_DEV_LOGIN=true` puts a dev sign-in box on the login page: type any `@iitism.ac.in`
address and you get a session, no Google account needed. It is refused outright when
`NODE_ENV=production`, the route 404s when the flag is off, and non-college addresses are
rejected either way.

With `RESEND_API_KEY` blank, emails are not sent — the confirmation link is printed to the
server console instead, so you can paste it into the browser. You can also confirm from the
**My appointments** page without touching the link at all.

### Automated checks

```bash
cd server
npm run verify
```

29 checks covering slot generation, off-grid and out-of-hours rejection, the concurrent
double-booking race, single-use confirmation tokens, the cancellation window, and the privacy
guarantees. It truncates the `appointments` table first, so run it against a development
database, never production.

### Environment

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud Console |
| `ALLOWED_EMAIL_DOMAIN` | `iitism.ac.in` — anything else is rejected server-side |
| `JWT_SECRET` | Long random string for session cookies |
| `CONFIRMATION_TOKEN_SECRET` | Long random string for confirmation link tokens |
| `ALLOW_DEV_LOGIN` | `true` enables password-free sign-in for local testing. Must be `false` in production |
| `RESEND_API_KEY` | Leave blank in development — emails print to the console instead |
| `MAIL_FROM` | Verified sender on your Resend domain |
| `SLOT_MINUTES` | 20 (capped at 20 by validation) |
| `MIN_BOOKING_LEAD_MINUTES` | How far ahead a student must book (default 60) |
| `PENDING_EXPIRY_MINUTES` | How long an unconfirmed slot is held (default 30) |
| `CANCELLATION_CUTOFF_HOURS` | Self-cancel window (default 4) |
| `BOOKING_HORIZON_DAYS` | How far into the future slots are shown (default 14) |

### Google OAuth setup

In the Google Cloud Console, create an **OAuth 2.0 Client ID** of type *Web application*:

- Authorised JavaScript origins: `http://localhost:5173` and your production URL
- No redirect URI needed — this uses Google Identity Services, which returns an ID token
  directly to the page

The domain restriction is enforced **server-side** on the verified ID token (`email_verified`
plus the domain check). The `hosted_domain` hint on the client is convenience only and is never
trusted.

## Counsellor accounts

Counsellors are seeded, not self-registered. `server/src/db/seed.ts` holds the three Health
Center counsellors and their weekly hours; when a seeded email signs in with Google, that account
is automatically linked and given the `counsellor` role.

| Counsellor | Days | Hours |
| --- | --- | --- |
| Ms. Aishwarya Rao, Psychologist (M.A.) | Mon–Fri | 9:30–13:30, 15:30–19:30 |
| Ms. Neethu AT, Psychologist (M.A.) | Mon–Sat | 9:30–13:30, 15:30–19:30 |
| Dr. Shilpi Kumari, M.D. (Psychiatrist) | Thu | 15:30–17:30 |

Dr. Shilpi Kumari has no email listed on the institute page, so her row is seeded without one.
Add it in `seed.ts` and re-run `npm run seed` to let her sign in and see her schedule.

To change hours, edit the seed file and re-run it, or insert into `availability_rules` directly.
For leave or one-off changes, insert into `availability_exceptions` (`kind = 'blocked'` with no
times blocks the whole day; `kind = 'extra'` adds hours).

## API

| Method | Route | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/google` | Exchange a Google ID token for a session cookie |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/auth/logout` | Clear the session |
| `GET` | `/api/counsellors` | Public list |
| `GET` | `/api/counsellors/:id/availability` | Auth required. `?from=YYYY-MM-DD&days=7` |
| `POST` | `/api/appointments` | Book. Returns a `pending` appointment |
| `POST` | `/api/appointments/confirm` | Confirm with the emailed token |
| `POST` | `/api/appointments/:id/confirm` | Confirm from inside the app |
| `POST` | `/api/appointments/:id/cancel` | Student or the counsellor |
| `GET` | `/api/appointments/mine` | Student's bookings, or counsellor's schedule |

## Before going live

- **Set `ALLOW_DEV_LOGIN=false`.** The server refuses to start with it on under
  `NODE_ENV=production`, but do not rely on that as the only guard
- Set a real `RESEND_API_KEY` and verify your sending domain, or reminders will only be logged
- Put the API behind HTTPS — session cookies switch to `secure` + `SameSite=None` in production
- Set `CLIENT_ORIGIN` to the deployed frontend URL so CORS and confirmation links are correct
- Run `npm run build` in both folders; serve `client/dist` as static files
- Consider a retention policy for `student_note`, since students may write sensitive things there

## Not built yet

Admin panel for managing counsellors, counsellor-facing UI for editing their own availability
and marking leave, rescheduling, and waitlists for full days.
