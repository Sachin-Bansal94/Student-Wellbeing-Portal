# Student Wellbeing Portal, IIT (ISM) Dhanbad

A booking portal for the on campus counsellors at the Health Center. Students register with
their institute email (or sign in with Google), see every counsellor's free slots, book a free
20 minute session, and confirm it from a link sent to their email. Counsellors sign in and manage
their own schedule. Admins manage counsellors and can see and cancel any booking.

## Who can do what

| Role | How they get it | What they can do |
| --- | --- | --- |
| Student | Anyone who registers with an `@iitism.ac.in` email, or signs in with Google | View counsellors and open slots, book, confirm from email, cancel (up to 4 hours before), edit own profile |
| Counsellor | An admin adds the counsellor record, and the person signs in with that same verified email | See own schedule, set weekly hours, add leave days and extra hours, cancel own sessions |
| Admin | The email is listed in `ADMIN_EMAILS` on the server | Add and edit counsellors, edit their hours, deactivate them, see all bookings, cancel any booking, see overview numbers |

Nobody can give themselves a higher role. Roles are decided on the server.

## How it works

**Registration is limited to the college.** The email domain must be exactly `iitism.ac.in`.
Look alike domains such as `iitism.ac.in.fake.com` are refused. The check runs on the server for
the form, for password login, and for Google (on the signed Google token, never on a hint from
the browser). A new password account must prove it owns the inbox before it can sign in.

**Availability is a rule, not a list of rows.** Each counsellor has weekly hours plus optional
leave days and extra hours. Slots are worked out when a student asks, so there is nothing to
regenerate and nothing to drift.

**Double booking cannot happen.** A unique index in the database covers
`(counsellor_id, starts_at)` for live bookings. If two students click the same slot at the same
moment, the database rejects the second one and the app says the slot was just taken. A student
may also hold at most 2 upcoming bookings.

**Every booking is checked against the real schedule.** The server never trusts a time sent by
the browser. It rebuilds that counsellor's slots and rejects anything off the grid, outside
working hours, too soon, or too far ahead.

**Booking needs an email confirmation.** Booking creates a `pending` hold for 10 minutes and sends
a single use link. Opening the link is the only thing that turns a hold into a `confirmed`
booking. If it is not confirmed in time, the slot goes back to everyone. After confirming, the
student gets a second email with a calendar file, and reminders follow 24 hours and 1 hour before.

**Reminders survive restarts.** Scheduled mail lives in a table that is checked every minute,
not in timers that vanish when the server restarts.

**Privacy.** The availability screen shows free or busy only, never who booked. Students see
only their own bookings. Counsellors see only their own schedule. The note a student writes for
the counsellor is shown to that counsellor only, and not to admins.

## Stack

React 18, Vite, TypeScript | Node, Express, TypeScript | PostgreSQL with plain SQL (`pg`) |
Google Identity Services | SMTP (nodemailer) or Resend for email.

## Running it locally

You need Node 18 or newer and PostgreSQL.

```bash
# 1. Backend
cd server
cp .env.example .env         # on Windows: copy .env.example .env
npm install
npm run migrate              # creates the tables
npm run seed                 # loads the three Health Center counsellors
npm run dev                  # http://localhost:4000

# 2. Frontend, in a second terminal
cd client
npm install
npm run dev                  # http://localhost:5173
```

Smallest `.env` that works (everything else has a default):

```
DATABASE_URL=postgresql://user:password@localhost:5432/wellbeing
JWT_SECRET=any-long-random-string-at-least-16-chars
CONFIRMATION_TOKEN_SECRET=another-long-random-string-at-least-16
AUTH_TOKEN_SECRET=a-third-long-random-string-at-least-16
ALLOW_DEV_LOGIN=true
ADMIN_EMAILS=your.name@iitism.ac.in
```

Editing `.env` needs a full restart of the backend.

### Working without Google or real email

`ALLOW_DEV_LOGIN=true` adds a box on the login page where any `@iitism.ac.in` address signs in
with no password. The server refuses to start with it on when `NODE_ENV=production`.

With no email settings, no email is sent. Every link (verify, confirm, reset) is printed in the
server console, and you open it in the browser. There is no button in the app that skips the
confirmation link, on purpose.

### Sending real email

Pick one:

1. **SMTP, easiest.** For Gmail, turn on 2 step verification, create an app password, then set
   `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<app password>`
   and `MAIL_FROM=IIT ISM Wellbeing <you@gmail.com>`. This delivers to any student.
2. **Resend.** Set `RESEND_API_KEY`. Resend only delivers to arbitrary addresses after you verify
   a sending domain, so it is not suitable until the college gives you a domain.

If `SMTP_HOST` is set it is used and Resend is ignored.

### Tests

```bash
cd server
npm run migrate:test && npm run seed:test   # once, builds the separate test database
npm run verify                              # 136 + 121 checks
```

`verify` runs two suites against `TEST_DATABASE_URL` and a built in fake mail server. It refuses to
run against your real database. It covers slot generation, the double booking race, the
confirmation link rules, the cancellation window, all password flows, Google account linking,
role rules, privacy, rate limits, email escaping, and the admin tools. Run it after any change to
booking or sign in.

The browser walkthrough in `e2e/` drives the real screens for a student, a counsellor and an
admin (37 checks). See `e2e/README.md`.

### Environment

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `TEST_DATABASE_URL` | A separate database used only by `npm run verify` |
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud Console |
| `ALLOWED_EMAIL_DOMAIN` | `iitism.ac.in`. Anything else is rejected on the server |
| `ADMIN_EMAILS` | Comma separated list of admin emails. Removing one removes admin at once |
| `JWT_SECRET`, `CONFIRMATION_TOKEN_SECRET`, `AUTH_TOKEN_SECRET` | Three different long random strings |
| `ALLOW_DEV_LOGIN` | `true` only on your own machine |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Send mail over SMTP |
| `RESEND_API_KEY` | Send mail with Resend (needs a verified domain) |
| `MAIL_FROM` | The From address on every email |
| `CLIENT_ORIGIN` | The address of the website, used for CORS and email links |
| `SLOT_MINUTES` | 20 (cannot be more) |
| `MIN_BOOKING_LEAD_MINUTES` | Booking must be at least this far ahead (60) |
| `PENDING_EXPIRY_MINUTES` | How long an unconfirmed hold lasts (10) |
| `CANCELLATION_CUTOFF_HOURS` | Students cannot cancel inside this window (4) |
| `BOOKING_HORIZON_DAYS` | How far ahead slots show (14) |
| `EMAIL_VERIFICATION_EXPIRY_MINUTES` | Verify link lifetime (1440) |
| `PASSWORD_RESET_EXPIRY_MINUTES` | Reset link lifetime (60) |

### Google OAuth setup

In Google Cloud Console create an **OAuth 2.0 Client ID** of type Web application. Add
`http://localhost:5173` and your real website address under Authorised JavaScript origins. No
redirect address is needed. Put the client ID in `GOOGLE_CLIENT_ID`.

## Counsellors

The three Health Center counsellors are loaded by `npm run seed`. After that, admins manage
everything from the **Admin** area, so the seed file is only the starting point.

| Counsellor | Days | Hours |
| --- | --- | --- |
| Ms. Aishwarya Rao, Psychologist (M.A.) | Mon to Fri | 9:30 to 13:30, 15:30 to 19:30 |
| Ms. Neethu AT, Psychologist (M.A.) | Mon to Sat | 9:30 to 13:30, 15:30 to 19:30 |
| Dr. Shilpi Kumari, M.D. (Psychiatrist) | Thu | 15:30 to 17:30 |

Dr. Shilpi Kumari has no email on the institute page. An admin can add one in the Admin area.
Counsellors are never deleted, only deactivated, so past bookings are kept.

## API

| Method | Route | Who | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Public | Needs an institute email. Sends a verify link |
| `POST` | `/api/auth/verify-email` | Public | Uses the emailed token |
| `POST` | `/api/auth/login` | Public | Email and password |
| `POST` | `/api/auth/google` | Public | Google ID token |
| `POST` | `/api/auth/resend-verification`, `/forgot-password`, `/reset-password` | Public | Always answer the same way |
| `GET` | `/api/auth/me`, `/api/auth/config` | Session, public | Current user, public settings |
| `POST` | `/api/auth/logout` | Any | |
| `GET` | `/api/counsellors` | Public | List |
| `GET` | `/api/counsellors/:id/availability` | Signed in | `?from=YYYY-MM-DD&days=7`. Free or busy only |
| `POST` | `/api/appointments` | Student | Creates a pending hold |
| `POST` | `/api/appointments/confirm` | Anyone with the link | Needs the emailed token. No sign in needed, so it works from any device |
| `POST` | `/api/appointments/:id/resend` | Owner | Sends the confirm email again |
| `POST` | `/api/appointments/:id/cancel` | Owner or counsellor | |
| `GET` | `/api/appointments/mine` | Signed in | `?scope=upcoming,past,all` |
| `GET`, `PATCH` | `/api/me/profile` | Signed in | |
| `*` | `/api/me/counsellor/...` | Counsellor | Own hours, leave and extra hours |
| `*` | `/api/admin/counsellors/...` | Admin | Add, edit, hours, leave |
| `GET` | `/api/admin/stats` | Admin | Overview numbers |
| `GET` | `/api/admin/appointments` | Admin | Filter by scope, status, counsellor |
| `POST` | `/api/admin/appointments/:id/cancel` | Admin | Emails student and counsellor |

## Before going live

- Rotate every secret that was ever in a shared `.env` file (database password, Resend key,
  token secrets). Never commit `.env`.
- Set `ALLOW_DEV_LOGIN=false` and `NODE_ENV=production`.
- Set `ADMIN_EMAILS` to the real operators.
- Set up real email (SMTP or a verified Resend domain).
- Serve the website and the API from the same domain if you can (for example the website at
  `/` and the API at `/api`). Cookies are then first party and sign in is far more reliable on
  phones. If they must be on different domains, use HTTPS on both and set `CLIENT_ORIGIN`.
- Run `npm run build` in both folders and serve `client/dist` as static files.
- Decide how long `student_note` text is kept.

## Known limits

- An admin who is also a counsellor gets the admin area, not the counsellor dashboard.
- Changing a password does not sign out other devices that are already signed in.
- Registering with an email that already has a password account says so. Sign in and reset are
  the safe paths, but this does show that the email is registered.
- Google sign in and real email delivery need internet access and credentials, so they are
  tested by hand with the checklist in the requirements document.

## Not built yet

Rescheduling, waitlists for full days, a retention rule for `student_note`, no show tracking, and
exportable reports.
