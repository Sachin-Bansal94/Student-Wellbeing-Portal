// Starts the API for the walkthrough. Run it from server/: npx tsx ../e2e/api-test-db.ts
// The walkthrough creates users and a counsellor that can never be deleted, and it signs in with a
// real counsellor's address, so it must never touch the main database. server/scripts/testEnv.ts
// swaps DATABASE_URL for TEST_DATABASE_URL, and refuses to continue if they match or the test one
// is unset. It also clears the SMTP login so mail only reaches the local sink.
//
// It listens on its own port because a normal `npm run dev` on :4000 uses the main database. The
// website must be started with VITE_API_BASE pointing here, see README.md.
process.env.PORT = "4100";
process.env.TEST_SMTP_PORT = "2527";
process.env.NODE_ENV = "development";
process.env.ALLOW_DEV_LOGIN = "true";
process.env.ADMIN_EMAILS = "admin@iitism.ac.in";
process.env.CLIENT_ORIGIN = process.env.BASE_URL || "http://127.0.0.1:5173";
delete process.env.ALLOW_VERIFY_ON_APP_DB;

// A hosted database can drop a connection mid run. Keep going so one drop does not end the test run.
process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
  if (err.code === "ECONNRESET" || err.message === "Connection terminated unexpectedly") {
    console.error("database connection dropped, continuing");
    return;
  }
  console.error(err);
  process.exit(1);
});

const { usingTestDatabase } = require("../server/scripts/testEnv");
if (!usingTestDatabase) {
  console.error("Refusing to start: this run is not pointed at the test database.");
  process.exit(1);
}

require("../server/src/index");
