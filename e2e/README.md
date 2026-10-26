# Browser walkthrough

Drives the real screens in a real browser: a student registers, verifies by email, books and
confirms from the emailed link, a counsellor signs in and sees the booking, and an admin views,
cancels and manages counsellors. 37 checks.

## Run it

Four terminals, from the project root. Use a development database, because it creates users,
bookings and one counsellor.

```bash
# 1. fake mail server (collects email so the test can read the links)
cd e2e && npm install && npx playwright install chromium && node mail-sink.js

# 2. API, sending mail to the fake server and treating admin@iitism.ac.in as admin
cd server
SMTP_HOST=127.0.0.1 SMTP_PORT=2527 ADMIN_EMAILS=admin@iitism.ac.in ALLOW_DEV_LOGIN=true npm run dev

# 3. website
cd client && npm run dev

# 4. the walkthrough (set SHOT_DIR=some/folder to save screenshots)
cd e2e && npm test
```

On Windows PowerShell set the variables first, for example `$env:SMTP_HOST="127.0.0.1"`.
The test uses `http://127.0.0.1:5173`. Override with `BASE_URL` and `SINK_URL` if yours differ.
