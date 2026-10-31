# Browser walkthrough

Drives the real screens in a real browser: a visitor sees the public home page, a student
registers, verifies by email, books and confirms from the emailed link, a counsellor signs in and
sees the booking, and an admin views, cancels and manages counsellors. 45 checks.

## Run it

Four terminals, from the project root.

**Use the test database, never the main one.** The walkthrough creates users and bookings, adds a
counsellor that can never be deleted, and signs in with a real counsellor's address, which links
that record to the account.

```bash
# once, to prepare the test database named by TEST_DATABASE_URL in server/.env
cd server && npm run migrate:test && npm run seed:test

# 1. fake mail server (collects email so the test can read the links)
cd e2e && npm install && npx playwright install chromium && node mail-sink.js

# 2. API on the test database, with mail going only to the fake server
cd server && npx tsx ../e2e/api-test-db.ts

# 3. website, talking to the test API on port 4100 and not the normal dev API on 4000
cd client && VITE_API_BASE=http://127.0.0.1:4100 npm run dev -- --host 127.0.0.1

# 4. the walkthrough (set SHOT_DIR=some/folder to save screenshots)
cd e2e && npm test
```

On Windows PowerShell set the variable first, `$env:VITE_API_BASE="http://127.0.0.1:4100"`.

A normal `npm run dev` in `server/` listens on port 4000 and uses the main database, and Vite proxies
`/api` to it. That is why the test API has its own port. Both scripts block any browser API call
that does not go to port 4100, and stop at once if the test API is not running.

`e2e/api-test-db.ts` sets everything step 2 needs for that run only: `PORT=4100`,
`DATABASE_URL` from `TEST_DATABASE_URL`, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=2527`,
`SMTP_SECURE=false`, an empty `SMTP_USER` and `SMTP_PASS`, `ADMIN_EMAILS=admin@iitism.ac.in` and
`ALLOW_DEV_LOGIN=true`. The empty `SMTP_USER` and `SMTP_PASS` matter: without them the API tries to
log in with your real mail account, and the fake server refuses it. It will not start if
`TEST_DATABASE_URL` is unset or the same as `DATABASE_URL`.

The test uses `http://127.0.0.1:5173`. Override with `BASE_URL` and `SINK_URL` if yours differ.

## Screenshots

With the same four things running, `node screenshots.js` saves every page at 1440 and 375 pixels
to `docs/screenshots/` and reports any horizontal scroll, small tap target, missing field label or
heading problem it finds at 1440, 1024, 768 and 375 pixels.
