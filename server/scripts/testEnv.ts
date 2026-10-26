import dotenv from "dotenv";

/**
 * Test-database guard. This module MUST be the first import of any script that touches the
 * database in a test context, because it rewrites DATABASE_URL before config/env.ts and
 * db/pool.ts read it — the pool is created once at import time, so a later swap would be
 * ignored.
 *
 * The suite TRUNCATEs appointments and creates counsellor records, which are publicly listed.
 * Pointing it at the application database would both destroy real bookings and show fake
 * counsellors to real students, so the default is to refuse rather than to clean up afterwards.
 */

dotenv.config();

const appUrl = process.env.DATABASE_URL ?? "";
const testUrl = process.env.TEST_DATABASE_URL ?? "";
const override = process.env.ALLOW_VERIFY_ON_APP_DB === "true";

function refuse(reason: string): never {
  console.error(`\nRefusing to run tests: ${reason}\n`);
  console.error("The verification suite truncates appointments and creates counsellor records,");
  console.error("which are visible to real students. It must target a dedicated test database.\n");
  console.error("Set TEST_DATABASE_URL in server/.env to a separate database, then run:");
  console.error("  npm run migrate:test");
  console.error("  npm run seed:test");
  console.error("  npm run verify\n");
  console.error("To deliberately run against the application database anyway (destructive),");
  console.error("set ALLOW_VERIFY_ON_APP_DB=true.\n");
  process.exit(1);
}

if (override) {
  console.warn("\n*** ALLOW_VERIFY_ON_APP_DB=true — running against the APPLICATION database.");
  console.warn("*** This truncates appointments and creates publicly visible counsellors.\n");
} else if (!testUrl) {
  refuse("TEST_DATABASE_URL is not set");
} else if (testUrl === appUrl) {
  refuse("TEST_DATABASE_URL is identical to DATABASE_URL");
} else {
  // Everything downstream (config/env.ts, db/pool.ts, every service) now sees the test database.
  process.env.DATABASE_URL = testUrl;
}

// Mail never leaves the machine during tests: every message goes over real SMTP to a local sink
// (scripts/mailSink.ts) so the suite can read links out of the emails exactly as a student would.
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = process.env.TEST_SMTP_PORT ?? "2526";
process.env.SMTP_SECURE = "false";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";
process.env.RESEND_API_KEY = "";
process.env.GOOGLE_CLIENT_ID ||= "test-client-id.apps.googleusercontent.com";

export const usingTestDatabase = !override;
