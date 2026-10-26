// MUST stay first: rewrites DATABASE_URL to the test database before db/pool.ts creates the
// pool, and refuses to run at all if no isolated test database is configured.
import "./testEnv";

import type { AddressInfo } from "net";
import { startMailSink } from "./mailSink";
import { pool } from "../src/db/pool";
import { createApp } from "../src/app";
import { getAvailability, resolveSlot, listCounsellors } from "../src/services/availability";
import {
  createBooking,
  confirmByToken,
  cancelAppointment,
  listMyAppointments,
  resendConfirmation,
} from "../src/services/booking";
import { sweep } from "../src/workers/appointmentSweeper";
import { upsertUserFromGoogle } from "../src/services/googleAuth";
import {
  loginWithPassword,
  registerWithPassword,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
  verifyEmailToken,
} from "../src/services/passwordAuth";
import { verifyPassword } from "../src/lib/password";
import { createConfirmationToken, hashConfirmationToken, SESSION_COOKIE, signSession } from "../src/lib/tokens";
import { createAuthToken, hashAuthToken } from "../src/lib/tokens";
import { addDaysISO, istWeekday, todayIstISO, istToUtc } from "../src/lib/ist";
import { SessionPayload } from "../src/lib/tokens";

let passed = 0;
let failed = 0;

/**
 * Counsellor fixtures created by the role tests. These MUST be removed at the end of every run:
 * counsellors are publicly listed (listCounsellors only filters on is_active), so leaving them
 * behind would show fake counsellors to real students.
 */
const FIXTURE_COUNSELLOR_EMAILS = [
  "counsellora@iitism.ac.in",
  "counsellorb@iitism.ac.in",
  "claimlater@iitism.ac.in",
  "squatter@iitism.ac.in",
];

const FIXTURE_USER_EMAILS = [
  "pwstudent1@iitism.ac.in",
  "pwstudent2@iitism.ac.in",
  "pwstudent3@iitism.ac.in",
  "googleonlystudent@iitism.ac.in",
  "mismatchtest@iitism.ac.in",
  "ratelimittest@iitism.ac.in",
  "verifyadmin@iitism.ac.in",
  "staleadmin@iitism.ac.in",
  "profilestudent@iitism.ac.in",
  ...FIXTURE_COUNSELLOR_EMAILS,
];

async function clearFixtures(): Promise<void> {
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [FIXTURE_USER_EMAILS]);
  await pool.query("DELETE FROM counsellors WHERE email = ANY($1)", [FIXTURE_COUNSELLOR_EMAILS]);
}

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

async function makeStudent(email: string, name: string): Promise<SessionPayload> {
  const result = await pool.query<{ id: string; role: SessionPayload["role"] }>(
    `INSERT INTO users (google_sub, email, full_name, role)
     VALUES ($1, $2, $3, 'student')
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id, role`,
    [`sub-${email}`, email, name]
  );
  return { userId: result.rows[0].id, email, role: result.rows[0].role };
}

function nextWeekdayISO(target: number, minDaysAhead: number): string {
  let date = addDaysISO(todayIstISO(), minDaysAhead);
  while (istWeekday(date) !== target) date = addDaysISO(date, 1);
  return date;
}

async function main() {
  if (process.env.RESEND_API_KEY) {
    throw new Error(
      "RESEND_API_KEY must be unset when running verify — it books ~15 test appointments " +
        "and would otherwise hit the real Resend API for fake @iitism.ac.in addresses. " +
        "Run via `npm run verify`, which clears it for this process only."
    );
  }

  const mailSink = await startMailSink();

  await pool.query("TRUNCATE scheduled_emails, appointments CASCADE");

  // Unlike makeStudent() below (an idempotent upsert), registerWithPassword() correctly refuses
  // to re-register an existing email — that's the point of the "duplicate registration" test —
  // so these fixtures must be reset on every run rather than reused across runs.
  // Safe to delete: these fixtures never hold appointments. Production code never deletes
  // counsellors, because appointments cascade.
  await clearFixtures();

  console.log("\n== slot generation ==");
  const counsellors = await listCounsellors();
  const neethu = counsellors.find((c) => c.full_name.includes("Neethu"))!;
  const aishwarya = counsellors.find((c) => c.full_name.includes("Aishwarya"))!;
  const shilpi = counsellors.find((c) => c.full_name.includes("Shilpi"))!;

  check("three counsellors seeded", counsellors.length === 3, `got ${counsellors.length}`);

  const monday = nextWeekdayISO(1, 2);
  const week = await getAvailability(neethu.id, monday, 7);
  const mondayView = week.days[0];

  check(
    "Neethu Monday has 24 slots (4h morning + 4h evening at 20 min)",
    mondayView.slots.length === 24,
    `got ${mondayView.slots.length}`
  );

  const first = mondayView.slots[0];
  const slotMs = new Date(first.endsAt).getTime() - new Date(first.startsAt).getTime();
  check("slot length is 20 minutes", slotMs === 20 * 60_000, `got ${slotMs / 60000} min`);

  const firstIstHour = new Date(new Date(first.startsAt).getTime() + 330 * 60_000)
    .toISOString()
    .slice(11, 16);
  check("first slot starts 09:30 IST", firstIstHour === "09:30", `got ${firstIstHour}`);

  const sundayView = week.days.find((d) => d.weekday === 0);
  check("Neethu has no Sunday slots", (sundayView?.slots.length ?? 0) === 0);

  const saturdayView = week.days.find((d) => d.weekday === 6);
  check("Neethu works Saturday", (saturdayView?.slots.length ?? 0) === 24);

  const aishWeek = await getAvailability(aishwarya.id, monday, 7);
  const aishSat = aishWeek.days.find((d) => d.weekday === 6);
  check("Aishwarya has no Saturday slots", (aishSat?.slots.length ?? 0) === 0);

  const thursday = nextWeekdayISO(4, 2);
  const shilpiWeek = await getAvailability(shilpi.id, thursday, 1);
  check(
    "Shilpi Thursday has 6 slots (15:30-17:30)",
    shilpiWeek.days[0].slots.length === 6,
    `got ${shilpiWeek.days[0].slots.length}`
  );

  console.log("\n== slot validation ==");
  const validSlot = new Date(mondayView.slots[5].startsAt);
  const resolved = await resolveSlot(neethu.id, validSlot);
  check("valid slot resolves", resolved.endsAt.getTime() - validSlot.getTime() === 20 * 60_000);

  const offGrid = new Date(validSlot.getTime() + 5 * 60_000);
  let rejectedOffGrid = false;
  try {
    await resolveSlot(neethu.id, offGrid);
  } catch (err: any) {
    rejectedOffGrid = err.code === "invalid_slot";
  }
  check("off-grid time rejected", rejectedOffGrid);

  let rejectedMidnight = false;
  try {
    await resolveSlot(neethu.id, istToUtc(monday, "02:00"));
  } catch (err: any) {
    rejectedMidnight = err.code === "invalid_slot";
  }
  check("time outside working hours rejected", rejectedMidnight);

  let rejectedFarFuture = false;
  try {
    await resolveSlot(neethu.id, istToUtc(addDaysISO(todayIstISO(), 60), "10:00"));
  } catch (err: any) {
    rejectedFarFuture = err.code === "beyond_horizon";
  }
  check("date beyond booking horizon rejected", rejectedFarFuture);

  let rejectedSoon = false;
  try {
    await resolveSlot(neethu.id, new Date(Date.now() + 5 * 60_000));
  } catch (err: any) {
    rejectedSoon = err.code === "too_soon" || err.code === "invalid_slot";
  }
  check("slot inside lead time rejected", rejectedSoon);

  console.log("\n== concurrent booking ==");
  const alice = await makeStudent("alice@iitism.ac.in", "Alice Student");
  const bob = await makeStudent("bob@iitism.ac.in", "Bob Student");
  const contested = mondayView.slots[8].startsAt;

  const results = await Promise.allSettled([
    createBooking(alice, neethu.id, contested, "first"),
    createBooking(bob, neethu.id, contested, "second"),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

  check("exactly one booking wins the race", fulfilled.length === 1, `got ${fulfilled.length}`);
  check(
    "loser gets slot_taken",
    rejected.length === 1 && rejected[0].reason?.code === "slot_taken",
    rejected[0] ? `got ${rejected[0].reason?.code}` : ""
  );

  const afterRace = await getAvailability(neethu.id, monday, 1);
  const contestedSlot = afterRace.days[0].slots.find((s) => s.startsAt === contested);
  check("contested slot now shows unavailable", contestedSlot?.available === false);

  console.log("\n== confirmation ==");
  const winner = (fulfilled[0] as PromiseFulfilledResult<any>).value;
  const { token, hash } = createConfirmationToken();
  await pool.query("UPDATE appointments SET confirmation_token_hash = $2 WHERE id = $1", [
    winner.appointmentId,
    hash,
  ]);

  await confirmByToken(token);
  const confirmed = await pool.query("SELECT status FROM appointments WHERE id = $1", [
    winner.appointmentId,
  ]);
  check("token confirms the booking", confirmed.rows[0].status === "confirmed");

  let reusedRejected = false;
  try {
    await confirmByToken(token);
  } catch (err: any) {
    reusedRejected = err.code === "already_confirmed";
  }
  check("confirmation token is single use (reports already_confirmed, not a duplicate booking)", reusedRejected);

  let garbageRejected = false;
  try {
    await confirmByToken("this-was-never-issued-to-anyone");
  } catch (err: any) {
    garbageRejected = err.code === "invalid_token";
  }
  check("a token that was never issued is rejected as invalid_token", garbageRejected);

  const reminders = await pool.query(
    "SELECT kind, send_after FROM scheduled_emails WHERE appointment_id = $1 ORDER BY send_after",
    [winner.appointmentId]
  );
  check("two reminders scheduled", reminders.rowCount === 2, `got ${reminders.rowCount}`);
  check(
    "reminders are 24h and 1h before",
    reminders.rows[0].kind === "reminder_24h" && reminders.rows[1].kind === "reminder_1h"
  );

  console.log("\n== duplicate requests ==");
  const dave = await makeStudent("dave@iitism.ac.in", "Dave Student");
  const dupSlot = mondayView.slots[10].startsAt;
  await createBooking(dave, neethu.id, dupSlot, null);

  let duplicateRejected = false;
  let duplicateCode = "";
  try {
    await createBooking(dave, neethu.id, dupSlot, null);
  } catch (err: any) {
    duplicateCode = err.code;
    duplicateRejected = err.code === "already_booked";
  }
  check(
    "double-clicking Request Appointment does not create a second booking",
    duplicateRejected,
    `got ${duplicateCode}`
  );

  const daveCount = await pool.query(
    "SELECT count(*)::int AS n FROM appointments WHERE student_id = $1 AND starts_at = $2",
    [dave.userId, dupSlot]
  );
  check("exactly one appointment row exists for the duplicate request", daveCount.rows[0].n === 1);

  console.log("\n== email send outcome is reported, never fatal ==");
  // createBooking/resendConfirmation wrap sendConfirmationRequest in trySendConfirmationRequest,
  // which catches any error and returns emailSent: false instead of throwing — a real send
  // failure can't roll back or fail the booking (see services/booking.ts). This suite runs with
  // RESEND_API_KEY unset (see the guard above `main`), so every send here takes the dev-console
  // fallback and succeeds; there is no mocking layer in this project to simulate a live Resend
  // outage without either a real network call or a test-only seam in production code, so that
  // exact branch is verified by code inspection rather than executed here.
  const erin = await makeStudent("erin@iitism.ac.in", "Erin Student");
  const emailFailSlot = mondayView.slots[11].startsAt;
  const emailResult = await createBooking(erin, neethu.id, emailFailSlot, null);

  check("booking response reports emailSent for the caller to act on", emailResult.emailSent === true);

  const emailRow = await pool.query("SELECT status FROM appointments WHERE id = $1", [
    emailResult.appointmentId,
  ]);
  check("appointment is pending and recoverable regardless of email outcome", emailRow.rows[0].status === "pending");

  console.log("\n== resend confirmation ==");
  const frank = await makeStudent("frank@iitism.ac.in", "Frank Student");
  const resendSlot = mondayView.slots[12].startsAt;
  const resendBooking = await createBooking(frank, neethu.id, resendSlot, null);

  const { token: staleToken, hash: staleHash } = createConfirmationToken();
  await pool.query("UPDATE appointments SET confirmation_token_hash = $2 WHERE id = $1", [
    resendBooking.appointmentId,
    staleHash,
  ]);

  const resendResult = await resendConfirmation(frank, resendBooking.appointmentId);
  check("resend reports the email as sent", resendResult.emailSent === true);

  const resendCount = await pool.query(
    "SELECT count(*)::int AS n FROM appointments WHERE student_id = $1 AND starts_at = $2",
    [frank.userId, resendSlot]
  );
  check("resend does not create a second appointment or slot hold", resendCount.rows[0].n === 1);

  let staleTokenRejected = false;
  try {
    await confirmByToken(staleToken);
  } catch (err: any) {
    staleTokenRejected = err.code === "invalid_token";
  }
  check("the token replaced by resend no longer confirms the booking", staleTokenRejected);

  let resendByOther = false;
  try {
    await resendConfirmation(bob, resendBooking.appointmentId);
  } catch (err: any) {
    resendByOther = err.code === "cannot_resend";
  }
  check("a student cannot resend confirmation for someone else's appointment", resendByOther);

  console.log("\n== pending expiry sweep ==");
  const grace = await makeStudent("grace@iitism.ac.in", "Grace Student");
  const expirySlot = mondayView.slots[13].startsAt;
  const expiryBooking = await createBooking(grace, neethu.id, expirySlot, null);
  const { token: expiryToken, hash: expiryHash } = createConfirmationToken();
  await pool.query(
    `UPDATE appointments
        SET confirmation_token_hash = $2, confirmation_expires_at = now() - interval '1 minute'
      WHERE id = $1`,
    [expiryBooking.appointmentId, expiryHash]
  );

  await sweep();

  const sweptRow = await pool.query("SELECT status FROM appointments WHERE id = $1", [
    expiryBooking.appointmentId,
  ]);
  check(
    "sweeper expires a pending appointment past its confirmation window",
    sweptRow.rows[0].status === "expired"
  );

  const freedAfterSweep = await getAvailability(neethu.id, monday, 1);
  const expirySlotView = freedAfterSweep.days[0].slots.find((s) => s.startsAt === expirySlot);
  check("an expired appointment releases its slot", expirySlotView?.available === true);

  let expiredTokenRejected = false;
  try {
    await confirmByToken(expiryToken);
  } catch (err: any) {
    expiredTokenRejected = err.code === "expired_token";
  }
  check(
    "confirming after the sweep reports expired_token, not a generic invalid link",
    expiredTokenRejected
  );

  const henry = await makeStudent("henry@iitism.ac.in", "Henry Student");
  const stillPendingSlot = mondayView.slots[14].startsAt;
  await createBooking(henry, neethu.id, stillPendingSlot, null);
  await sweep();
  const stillBlocked = await getAvailability(neethu.id, monday, 1);
  const stillBlockedSlot = stillBlocked.days[0].slots.find((s) => s.startsAt === stillPendingSlot);
  check("a non-expired pending appointment keeps blocking its slot", stillBlockedSlot?.available === false);

  console.log("\n== concurrent confirmation ==");
  const ivy = await makeStudent("ivy@iitism.ac.in", "Ivy Student");
  const concurrentConfirmSlot = mondayView.slots[15].startsAt;
  const concurrentBooking = await createBooking(ivy, neethu.id, concurrentConfirmSlot, null);
  const { token: concurrentToken, hash: concurrentHash } = createConfirmationToken();
  await pool.query("UPDATE appointments SET confirmation_token_hash = $2 WHERE id = $1", [
    concurrentBooking.appointmentId,
    concurrentHash,
  ]);

  const confirmRaces = await Promise.allSettled([
    confirmByToken(concurrentToken),
    confirmByToken(concurrentToken),
  ]);
  const confirmFulfilled = confirmRaces.filter((r) => r.status === "fulfilled");
  const confirmRejected = confirmRaces.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  check(
    "exactly one concurrent confirmation click wins",
    confirmFulfilled.length === 1,
    `got ${confirmFulfilled.length}`
  );
  check(
    "the losing click sees already_confirmed, not an error",
    confirmRejected.length === 1 && confirmRejected[0].reason?.code === "already_confirmed"
  );

  console.log("\n== email verification cannot be bypassed ==");
  const kate = await makeStudent("kate@iitism.ac.in", "Kate Student");
  const bypassSlot = mondayView.slots[17].startsAt;
  const bypassBooking = await createBooking(kate, neethu.id, bypassSlot, null);

  const app = createApp();
  const bypassServer = app.listen(0);
  await new Promise((resolve) => bypassServer.once("listening", resolve));
  const { port: bypassPort } = bypassServer.address() as AddressInfo;
  const kateSession = signSession({ userId: kate.userId, email: kate.email, role: kate.role });

  const bypassResponse = await fetch(
    `http://127.0.0.1:${bypassPort}/api/appointments/${bypassBooking.appointmentId}/confirm`,
    { method: "POST", headers: { Cookie: `${SESSION_COOKIE}=${kateSession}` } }
  );
  const bypassBody = await bypassResponse.json().catch(() => ({}));
  await new Promise((resolve) => bypassServer.close(resolve));

  check(
    "there is no authenticated endpoint that confirms a pending appointment without a token",
    bypassResponse.status === 404,
    `got ${bypassResponse.status} ${JSON.stringify(bypassBody)}`
  );

  const bypassRow = await pool.query("SELECT status FROM appointments WHERE id = $1", [
    bypassBooking.appointmentId,
  ]);
  check(
    "the appointment is still pending after the bypass attempt",
    bypassRow.rows[0].status === "pending"
  );

  console.log("\n== cancel while pending ==");
  const jack = await makeStudent("jack@iitism.ac.in", "Jack Student");
  const cancelPendingSlot = mondayView.slots[16].startsAt;
  const cancelPendingBooking = await createBooking(jack, neethu.id, cancelPendingSlot, null);
  const { token: cancelledToken, hash: cancelledHash } = createConfirmationToken();
  await pool.query("UPDATE appointments SET confirmation_token_hash = $2 WHERE id = $1", [
    cancelPendingBooking.appointmentId,
    cancelledHash,
  ]);

  await cancelAppointment(jack, cancelPendingBooking.appointmentId);

  let cancelledTokenRejected = false;
  try {
    await confirmByToken(cancelledToken);
  } catch (err: any) {
    cancelledTokenRejected = err.code === "invalid_token";
  }
  check("confirming a cancelled pending appointment does not revive it", cancelledTokenRejected);

  const cancelledRow = await pool.query("SELECT status FROM appointments WHERE id = $1", [
    cancelPendingBooking.appointmentId,
  ]);
  check(
    "appointment stays cancelled after a stale confirm attempt",
    cancelledRow.rows[0].status === "cancelled"
  );

  console.log("\n== cancellation window ==");
  const soonSlot = new Date(Date.now() + 2 * 60 * 60_000);
  const soonAppt = await pool.query<{ id: string }>(
    `INSERT INTO appointments (counsellor_id, student_id, starts_at, ends_at, status, confirmed_at)
     VALUES ($1, $2, $3, $4, 'confirmed', now()) RETURNING id`,
    [neethu.id, bob.userId, soonSlot, new Date(soonSlot.getTime() + 20 * 60_000)]
  );

  let windowClosed = false;
  try {
    await cancelAppointment(bob, soonAppt.rows[0].id);
  } catch (err: any) {
    windowClosed = err.code === "cancellation_window_closed";
  }
  check("cannot cancel inside the 4 hour window", windowClosed);

  const ownerRow = await pool.query<{ student_id: string }>(
    "SELECT student_id FROM appointments WHERE id = $1",
    [winner.appointmentId]
  );
  const owner = ownerRow.rows[0].student_id === alice.userId ? alice : bob;

  await cancelAppointment(owner, winner.appointmentId);
  const cancelled = await pool.query("SELECT status FROM appointments WHERE id = $1", [
    winner.appointmentId,
  ]);
  check("cancel outside the window succeeds", cancelled.rows[0].status === "cancelled");

  const pendingReminders = await pool.query(
    "SELECT status FROM scheduled_emails WHERE appointment_id = $1 AND status = 'pending'",
    [winner.appointmentId]
  );
  check("cancelling kills pending reminders", pendingReminders.rowCount === 0);

  const freed = await getAvailability(neethu.id, monday, 1);
  const freedSlot = freed.days[0].slots.find((s) => s.startsAt === contested);
  check("cancelled slot returns to the pool", freedSlot?.available === true);

  let notOwner = false;
  const carol = await makeStudent("carol@iitism.ac.in", "Carol Student");
  try {
    await cancelAppointment(carol, soonAppt.rows[0].id);
  } catch (err: any) {
    notOwner = err.code === "forbidden";
  }
  check("a student cannot cancel someone else's appointment", notOwner);

  console.log("\n== roles and privacy ==");
  const counsellorUser = await upsertUserFromGoogle({
    sub: "google-neethu",
    email: "neethuat@iitism.ac.in",
    name: "Ms. Neethu AT",
    picture: null,
  });
  check("seeded counsellor email logs in as counsellor", counsellorUser.role === "counsellor");

  const studentUser = await upsertUserFromGoogle({
    sub: "google-random",
    email: "random@iitism.ac.in",
    name: "Random Student",
    picture: null,
  });
  check("other college emails log in as student", studentUser.role === "student");

  const studentView = (await listMyAppointments(bob)) as any[];
  const leaksOtherStudents = studentView.some((a) => a.student_name || a.student_email);
  check("student appointment list exposes no other student data", !leaksOtherStudents);

  const weekPayload = JSON.stringify(await getAvailability(neethu.id, monday, 7));
  check(
    "availability payload never contains student identity",
    !weekPayload.includes("alice") && !weekPayload.includes("bob") && !weekPayload.includes("student_id")
  );

  async function seedUserToken(
    email: string,
    purpose: "email_verification" | "password_reset",
    opts: { expired?: boolean } = {}
  ): Promise<string> {
    const user = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
    const { token, hash } = createAuthToken();
    const expiresAt = opts.expired ? new Date(Date.now() - 60_000) : new Date(Date.now() + 60 * 60_000);
    await pool.query(
      `INSERT INTO user_tokens (user_id, purpose, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, purpose) DO UPDATE
         SET token_hash = $3, expires_at = $4, used_at = NULL`,
      [user.rows[0].id, purpose, hash, expiresAt]
    );
    return token;
  }

  console.log("\n== password registration ==");

  await registerWithPassword("PwStudent1@IITISM.ac.in ", "password123");
  const normalizedRow = await pool.query("SELECT 1 FROM users WHERE email = $1", ["pwstudent1@iitism.ac.in"]);
  check("email is normalized (trimmed + lowercased) before storage", normalizedRow.rowCount === 1);

  let nonIitRejected = false;
  try {
    await registerWithPassword("someone@gmail.com", "password123");
  } catch (err: any) {
    nonIitRejected = err.code === "wrong_domain";
  }
  check("non-IIT email is rejected", nonIitRejected);

  let lookalikeRejected = false;
  try {
    await registerWithPassword("attacker@iitism.ac.in.fake.com", "password123");
  } catch (err: any) {
    lookalikeRejected = err.code === "wrong_domain";
  }
  check("lookalike domain (iitism.ac.in.fake.com) is rejected, not substring-matched", lookalikeRejected);

  const pwHashRow = await pool.query<{ password_hash: string }>(
    "SELECT password_hash FROM users WHERE email = 'pwstudent1@iitism.ac.in'"
  );
  const storedHash = pwHashRow.rows[0].password_hash;
  check(
    "password is stored as a salted hash, never plaintext",
    storedHash !== "password123" && storedHash.startsWith("scrypt:")
  );
  check("the stored hash actually verifies the original password", await verifyPassword("password123", storedHash));

  const unverifiedRow = await pool.query(
    "SELECT email_verified_at FROM users WHERE email = 'pwstudent1@iitism.ac.in'"
  );
  check("registration creates an unverified account", unverifiedRow.rows[0].email_verified_at === null);

  let duplicateRegRejected = false;
  try {
    await registerWithPassword("pwstudent1@iitism.ac.in", "differentpassword1");
  } catch (err: any) {
    duplicateRegRejected = err.code === "email_registered";
  }
  check("duplicate registration for the same email is rejected safely", duplicateRegRejected);

  const dupCount = await pool.query("SELECT count(*)::int AS n FROM users WHERE email = 'pwstudent1@iitism.ac.in'");
  check("duplicate registration attempt does not create a second row", dupCount.rows[0].n === 1);

  console.log("\n== email verification tokens ==");

  const pw2 = await registerWithPassword("pwstudent2@iitism.ac.in", "password123");
  check("registration reports needsVerification for a brand-new account", pw2.needsVerification === true);

  const verifyToken = await seedUserToken("pwstudent2@iitism.ac.in", "email_verification");
  const verifyResult = await verifyEmailToken(verifyToken);
  check("verification token works", verifyResult.email === "pwstudent2@iitism.ac.in");

  let alreadyVerifiedRejected = false;
  try {
    await verifyEmailToken(verifyToken);
  } catch (err: any) {
    alreadyVerifiedRejected = err.code === "already_verified";
  }
  check("verification token cannot be reused", alreadyVerifiedRejected);

  const expiredVerifyToken = await seedUserToken("pwstudent2@iitism.ac.in", "email_verification", {
    expired: true,
  });
  let expiredVerifyRejected = false;
  try {
    await verifyEmailToken(expiredVerifyToken);
  } catch (err: any) {
    expiredVerifyRejected = err.code === "expired_token";
  }
  check("expired verification token is rejected", expiredVerifyRejected);

  let garbageVerifyRejected = false;
  try {
    await verifyEmailToken("this-token-was-never-issued");
  } catch (err: any) {
    garbageVerifyRejected = err.code === "invalid_token";
  }
  check("a verification token that was never issued is rejected", garbageVerifyRejected);

  console.log("\n== resend verification email ==");

  let resendDoesNotThrow = true;
  try {
    await resendVerificationEmail("pwstudent1@iitism.ac.in");
  } catch {
    resendDoesNotThrow = false;
  }
  check("resend-verification does not throw for an eligible unverified account", resendDoesNotThrow);

  const resendTokenRow = await pool.query(
    `SELECT count(*)::int AS n FROM user_tokens
      WHERE user_id = (SELECT id FROM users WHERE email = 'pwstudent1@iitism.ac.in')
        AND purpose = 'email_verification'`
  );
  check(
    "resend-verification upserts the single live token rather than creating duplicates",
    resendTokenRow.rows[0].n === 1
  );

  let resendForVerifiedDoesNotThrow = true;
  try {
    await resendVerificationEmail("pwstudent2@iitism.ac.in");
  } catch {
    resendForVerifiedDoesNotThrow = false;
  }
  check(
    "resend-verification for an already-verified account is a silent no-op, not an error",
    resendForVerifiedDoesNotThrow
  );

  console.log("\n== password login ==");

  const loggedIn = await loginWithPassword("pwstudent2@iitism.ac.in", "password123");
  check("correct password succeeds", loggedIn.email === "pwstudent2@iitism.ac.in");
  check(
    "login result never carries a password hash",
    !Object.keys(loggedIn).some((k) => k.toLowerCase().includes("password"))
  );

  let wrongPwRejected = false;
  try {
    await loginWithPassword("pwstudent2@iitism.ac.in", "wrongpassword");
  } catch (err: any) {
    wrongPwRejected = err.code === "unauthorized";
  }
  check("wrong password is rejected", wrongPwRejected);

  let unverifiedLoginRejected = false;
  try {
    await loginWithPassword("pwstudent1@iitism.ac.in", "password123");
  } catch (err: any) {
    unverifiedLoginRejected = err.code === "email_not_verified";
  }
  check("unverified account cannot log in", unverifiedLoginRejected);

  let noAccountMessage = "";
  try {
    await loginWithPassword("nosuchaccount@iitism.ac.in", "whatever123");
  } catch (err: any) {
    noAccountMessage = err.message;
  }
  let wrongPwMessage = "";
  try {
    await loginWithPassword("pwstudent2@iitism.ac.in", "wrongpassword");
  } catch (err: any) {
    wrongPwMessage = err.message;
  }
  check(
    "nonexistent account and wrong password return identical messages (no enumeration)",
    noAccountMessage === wrongPwMessage && noAccountMessage === "Invalid email or password"
  );

  console.log("\n== password reset ==");

  let forgotDoesNotThrow = true;
  try {
    await requestPasswordReset("nosuchaccount@iitism.ac.in");
  } catch {
    forgotDoesNotThrow = false;
  }
  check("forgot-password never reveals whether an account exists", forgotDoesNotThrow);

  const resetToken = await seedUserToken("pwstudent2@iitism.ac.in", "password_reset");
  await resetPassword(resetToken, "brandnewpassword1");

  let oldPasswordFails = false;
  try {
    await loginWithPassword("pwstudent2@iitism.ac.in", "password123");
  } catch (err: any) {
    oldPasswordFails = err.code === "unauthorized";
  }
  check("old password no longer works after reset", oldPasswordFails);

  const relogged = await loginWithPassword("pwstudent2@iitism.ac.in", "brandnewpassword1");
  check("new password works after reset", relogged.email === "pwstudent2@iitism.ac.in");

  let usedResetTokenRejected = false;
  try {
    await resetPassword(resetToken, "anotherpassword2");
  } catch (err: any) {
    usedResetTokenRejected = err.code === "invalid_token";
  }
  check("a used reset token is rejected on reuse", usedResetTokenRejected);

  const expiredResetToken = await seedUserToken("pwstudent2@iitism.ac.in", "password_reset", { expired: true });
  let expiredResetRejected = false;
  try {
    await resetPassword(expiredResetToken, "yetanotherpassword3");
  } catch (err: any) {
    expiredResetRejected = err.code === "expired_token";
  }
  check("expired reset token is rejected", expiredResetRejected);

  let garbageResetRejected = false;
  try {
    await resetPassword("never-issued-token", "somepassword4");
  } catch (err: any) {
    garbageResetRejected = err.code === "invalid_token";
  }
  check("a reset token that was never issued is rejected", garbageResetRejected);

  console.log("\n== Google account linking ==");

  const pw3 = await registerWithPassword("pwstudent3@iitism.ac.in", "password123");
  const linkedViaGoogle = await upsertUserFromGoogle({
    sub: "google-pwstudent3",
    email: "pwstudent3@iitism.ac.in",
    name: "PW Student Three",
    picture: null,
  });
  check(
    "Google sign-in links onto an existing password account instead of duplicating",
    linkedViaGoogle.userId === pw3.user.userId
  );
  const linkedCount = await pool.query("SELECT count(*)::int AS n FROM users WHERE email = 'pwstudent3@iitism.ac.in'");
  check("linking does not create a second row", linkedCount.rows[0].n === 1);
  const linkedHashRow = await pool.query<{ password_hash: string | null; email_verified_at: Date | null }>(
    "SELECT password_hash, email_verified_at FROM users WHERE email = 'pwstudent3@iitism.ac.in'"
  );
  check(
    "a password set before the email was ever verified is discarded once Google proves the inbox",
    linkedHashRow.rows[0].password_hash === null
  );
  check("Google sign-in marks the email verified", linkedHashRow.rows[0].email_verified_at !== null);

  let discardedPasswordRejected = false;
  try {
    await loginWithPassword("pwstudent3@iitism.ac.in", "password123");
  } catch (err: any) {
    discardedPasswordRejected = err.code === "unauthorized";
  }
  check("the discarded password can no longer log in", discardedPasswordRejected);

  const googleFirst = await upsertUserFromGoogle({
    sub: "google-onlystudent",
    email: "googleonlystudent@iitism.ac.in",
    name: "Google Only Student",
    picture: null,
  });
  const passwordAdded = await registerWithPassword("googleonlystudent@iitism.ac.in", "password123");
  check(
    "asking to add a password to a Google account targets that same account, not a new one",
    passwordAdded.user.userId === googleFirst.userId
  );
  check(
    "adding a password to a Google account always requires proof of the inbox",
    passwordAdded.needsVerification === true
  );
  const untouched = await pool.query<{ password_hash: string | null }>(
    "SELECT password_hash FROM users WHERE email = 'googleonlystudent@iitism.ac.in'"
  );
  check("the typed password is not stored until the owner follows the emailed link", untouched.rows[0].password_hash === null);

  let notLoggedInEarly = false;
  try {
    await loginWithPassword("googleonlystudent@iitism.ac.in", "password123");
  } catch (err: any) {
    notLoggedInEarly = err.code === "unauthorized";
  }
  check("that password does not log in before the owner confirms", notLoggedInEarly);

  const setPasswordMail = await mailSink.waitFor(
    (mail) => mail.subject?.startsWith("Finish adding a password") === true
  );
  const setPasswordToken = new URL(
    (setPasswordMail.html as string).match(/href="([^"]+)"/)![1]
  ).searchParams.get("token")!;
  await resetPassword(setPasswordToken, "chosenbytheowner1");
  const ownerLogin = await loginWithPassword("googleonlystudent@iitism.ac.in", "chosenbytheowner1");
  check("the owner can set a password through the emailed link and then log in", ownerLogin.userId === googleFirst.userId);

  const sameGoogleAgain = await upsertUserFromGoogle({
    sub: "google-pwstudent3",
    email: "pwstudent3@iitism.ac.in",
    name: "PW Student Three",
    picture: null,
  });
  check("the same Google identity always resolves to the same account", sameGoogleAgain.userId === pw3.user.userId);

  console.log("\n== auth tokens and appointment tokens are logically separate ==");

  const { token: realAppointmentToken, hash: realAppointmentHash } = createConfirmationToken();
  const crossBooking = await createBooking(alice, aishwarya.id, aishWeek.days[0].slots[0].startsAt, null);
  await pool.query("UPDATE appointments SET confirmation_token_hash = $2 WHERE id = $1", [
    crossBooking.appointmentId,
    realAppointmentHash,
  ]);

  let appointmentTokenRejectedAsAuthToken = false;
  try {
    await verifyEmailToken(realAppointmentToken);
  } catch (err: any) {
    appointmentTokenRejectedAsAuthToken = err.code === "invalid_token";
  }
  check(
    "a valid appointment-confirmation token cannot be used as an email-verification token",
    appointmentTokenRejectedAsAuthToken
  );

  const { token: realAuthToken, hash: realAuthHash } = createAuthToken();
  await pool.query(
    `INSERT INTO user_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, 'email_verification', $2, now() + interval '1 hour')
     ON CONFLICT (user_id, purpose) DO UPDATE SET token_hash = $2, expires_at = now() + interval '1 hour', used_at = NULL`,
    [pw3.user.userId, realAuthHash]
  );

  let authTokenRejectedAsAppointmentToken = false;
  try {
    await confirmByToken(realAuthToken);
  } catch (err: any) {
    authTokenRejectedAsAppointmentToken = err.code === "invalid_token";
  }
  check(
    "a valid email-verification token cannot be used as an appointment-confirmation token",
    authTokenRejectedAsAppointmentToken
  );

  console.log("\n== new auth is compatible with the existing booking flow ==");

  const bookingSession: SessionPayload = { userId: pw3.user.userId, email: pw3.user.email, role: pw3.user.role };
  const compatBooking = await createBooking(bookingSession, aishwarya.id, aishWeek.days[0].slots[1].startsAt, null);
  check(
    "a student authenticated via the new password/Google auth can still book an appointment",
    !!compatBooking.appointmentId
  );
  const compatRow = await pool.query("SELECT status FROM appointments WHERE id = $1", [compatBooking.appointmentId]);
  check(
    "the new booking still starts pending and still requires email confirmation",
    compatRow.rows[0].status === "pending"
  );

  console.log("\n== HTTP-level: password mismatch, logout, rate limiting ==");

  const authApp = createApp();
  const authServer = authApp.listen(0);
  await new Promise((resolve) => authServer.once("listening", resolve));
  const { port: authPort } = authServer.address() as AddressInfo;
  const authBase = `http://127.0.0.1:${authPort}/api/auth`;

  const mismatchResponse = await fetch(`${authBase}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "mismatchtest@iitism.ac.in",
      password: "password123",
      confirmPassword: "different456",
    }),
  });
  const mismatchBody = await mismatchResponse.json();
  check(
    "registering with mismatched passwords is rejected at the API boundary",
    mismatchResponse.status === 400 && mismatchBody.error?.code === "password_mismatch"
  );

  const loginResp = await fetch(`${authBase}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "pwstudent2@iitism.ac.in", password: "brandnewpassword1" }),
  });
  const sessionCookie = (loginResp.headers.get("set-cookie") ?? "").split(";")[0];
  check("login sets a session cookie", sessionCookie.startsWith(`${SESSION_COOKIE}=`));

  const meBeforeLogout = await fetch(`${authBase}/me`, { headers: { Cookie: sessionCookie } });
  check("session cookie is authenticated before logout", meBeforeLogout.status === 200);

  const logoutResp = await fetch(`${authBase}/logout`, { method: "POST", headers: { Cookie: sessionCookie } });
  const logoutSetCookie = logoutResp.headers.get("set-cookie") ?? "";
  check("logout clears the session cookie", /wb_session=;|Max-Age=0/i.test(logoutSetCookie));

  let sawRateLimit = false;
  for (let i = 0; i < 12; i++) {
    const r = await fetch(`${authBase}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ratelimittest@iitism.ac.in", password: "whatever123" }),
    });
    if (r.status === 429) {
      sawRateLimit = true;
      break;
    }
  }
  check("repeated login attempts are eventually rate-limited", sawRateLimit);

  await new Promise((resolve) => authServer.close(resolve));

  console.log("\n== roles: authorization ==");

  const roleApp = createApp();
  const roleServer = roleApp.listen(0);
  await new Promise((resolve) => roleServer.once("listening", resolve));
  const { port: rolePort } = roleServer.address() as AddressInfo;
  const apiBase = `http://127.0.0.1:${rolePort}/api`;

  const as = (session: SessionPayload) => {
    const cookie = `${SESSION_COOKIE}=${signSession(session)}`;
    return (path: string, init?: RequestInit) =>
      fetch(`${apiBase}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", Cookie: cookie, ...(init?.headers ?? {}) },
      });
  };

  const plainStudent = await makeStudent("profilestudent@iitism.ac.in", "Profile Student");
  const studentApi = as(plainStudent);

  check("unauthenticated request to admin routes is 401", (await fetch(`${apiBase}/admin/counsellors`)).status === 401);
  check("student cannot list counsellors as admin", (await studentApi("/admin/counsellors")).status === 403);
  check(
    "student cannot create a counsellor",
    (
      await studentApi("/admin/counsellors", {
        method: "POST",
        body: JSON.stringify({ fullName: "Should Not Exist" }),
      })
    ).status === 403
  );
  check("student cannot reach counsellor self-service", (await studentApi("/me/counsellor")).status === 403);

  // A forged claim is the direct attack on the JWT-vs-DB question: the cookie is genuinely
  // signed (so it passes verifySession) but asserts a role the database does not grant.
  const forgedAdmin = as({ ...plainStudent, role: "admin" });
  const forgedCounsellor = as({ ...plainStudent, role: "counsellor" });

  check(
    "a validly-signed JWT claiming role=admin does not grant admin access",
    (await forgedAdmin("/admin/counsellors")).status === 403
  );
  check(
    "a forged admin claim cannot create a counsellor",
    (
      await forgedAdmin("/admin/counsellors", {
        method: "POST",
        body: JSON.stringify({ fullName: "Forged" }),
      })
    ).status === 403
  );
  check(
    "a validly-signed JWT claiming role=counsellor does not grant counsellor access",
    (await forgedCounsellor("/me/counsellor")).status === 403
  );
  check(
    "a forged counsellor claim cannot add availability",
    (
      await forgedCounsellor("/me/counsellor/availability-rules", {
        method: "POST",
        body: JSON.stringify({ weekday: 1, startTime: "09:00", endTime: "10:00" }),
      })
    ).status === 403
  );

  const noForgedCounsellor = await pool.query("SELECT 1 FROM counsellors WHERE full_name = 'Forged'");
  check("the forged admin request created nothing", noForgedCounsellor.rowCount === 0);

  console.log("\n== roles: ADMIN_EMAILS is authoritative ==");

  // verifyadmin@ is in ADMIN_EMAILS for this run (set by the npm script), but its stored role is
  // still 'student' — the allowlist alone must grant authority.
  const allowlistAdmin = await makeStudent("verifyadmin@iitism.ac.in", "Allowlist Admin");
  const adminApi = as({ ...allowlistAdmin, role: "student" });
  check("allowlisted email gets admin authority even while stored role is student", (await adminApi("/admin/counsellors")).status === 200);

  // The reverse: stored role says admin, but the email is not on the allowlist.
  const staleAdmin = await makeStudent("staleadmin@iitism.ac.in", "Stale Admin");
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [staleAdmin.userId]);
  const staleApi = as({ ...staleAdmin, role: "admin" });
  check(
    "stored 'admin' without an allowlist entry is denied (revocation works, stickiness is gone)",
    (await staleApi("/admin/counsellors")).status === 403
  );

  console.log("\n== roles: counsellor onboarding ==");

  // Case A — an existing, email-verified account is linked and promoted immediately.
  const futureCounsellor = await makeStudent("counsellora@iitism.ac.in", "Counsellor A");
  await pool.query("UPDATE users SET email_verified_at = now() WHERE id = $1", [futureCounsellor.userId]);

  const createA = await adminApi("/admin/counsellors", {
    method: "POST",
    body: JSON.stringify({ email: "counsellora@iitism.ac.in", fullName: "Counsellor A", slotMinutes: 20 }),
  });
  const createABody = await createA.json();
  check("admin can create a counsellor", createA.status === 201, `got ${createA.status}`);
  check("case A reports that an existing account was linked", createABody.linkedExistingUser === true);

  const promotedRole = await pool.query<{ role: string }>("SELECT role FROM users WHERE id = $1", [
    futureCounsellor.userId,
  ]);
  check("case A promotes the existing account to counsellor immediately", promotedRole.rows[0].role === "counsellor");

  // Case B — no account yet: record is created unclaimed, and no user/password is fabricated.
  const createB = await adminApi("/admin/counsellors", {
    method: "POST",
    body: JSON.stringify({ email: "claimlater@iitism.ac.in", fullName: "Claim Later" }),
  });
  const createBBody = await createB.json();
  check("case B creates the counsellor without linking", createBBody.linkedExistingUser === false);
  check("case B leaves the record unclaimed", createBBody.counsellor.linkedAccount === false);

  const noUserCreated = await pool.query("SELECT 1 FROM users WHERE email = 'claimlater@iitism.ac.in'");
  check("case B does not fabricate a user account", noUserCreated.rowCount === 0);

  // The record is claimed only once the email is actually proven.
  const claimed = await upsertUserFromGoogle({
    sub: "google-claimlater",
    email: "claimlater@iitism.ac.in",
    name: "Claim Later",
    picture: null,
  });
  check("a verified sign-in claims the waiting counsellor record", claimed.role === "counsellor");

  console.log("\n== roles: counsellor record cannot be spoofed ==");

  await adminApi("/admin/counsellors", {
    method: "POST",
    body: JSON.stringify({ email: "squatter@iitism.ac.in", fullName: "Squat Target" }),
  });

  // Someone registers with the counsellor's address but never proves ownership of the inbox.
  const squat = await registerWithPassword("squatter@iitism.ac.in", "password123");
  check("registering with a counsellor's email yields a plain student", squat.user.role === "student");

  const squatLink = await pool.query<{ user_id: string | null }>(
    "SELECT user_id FROM counsellors WHERE email = 'squatter@iitism.ac.in'"
  );
  check("an unverified registration does NOT claim the counsellor record", squatLink.rows[0].user_id === null);

  const squatRole = await pool.query<{ role: string }>(
    "SELECT role FROM users WHERE email = 'squatter@iitism.ac.in'"
  );
  check("an unverified registration does NOT gain the counsellor role", squatRole.rows[0].role === "student");

  console.log("\n== roles: counsellor ownership ==");

  const counsellorBUser = await makeStudent("counsellorb@iitism.ac.in", "Counsellor B");
  await pool.query("UPDATE users SET email_verified_at = now() WHERE id = $1", [counsellorBUser.userId]);
  await adminApi("/admin/counsellors", {
    method: "POST",
    body: JSON.stringify({ email: "counsellorb@iitism.ac.in", fullName: "Counsellor B" }),
  });

  const counsellorAApi = as({ ...futureCounsellor, role: "counsellor" });
  const counsellorBApi = as({ ...counsellorBUser, role: "counsellor" });

  const ruleResp = await counsellorAApi("/me/counsellor/availability-rules", {
    method: "POST",
    body: JSON.stringify({ weekday: 2, startTime: "10:00", endTime: "12:00" }),
  });
  const ruleBody = await ruleResp.json();
  check("a counsellor can add a block to their own availability", ruleResp.status === 201, `got ${ruleResp.status}`);

  const crossDelete = await counsellorBApi(
    `/me/counsellor/availability-rules/${ruleBody.rule.id}`,
    { method: "DELETE" }
  );
  check("counsellor B cannot delete counsellor A's block", crossDelete.status === 404);

  const stillThere = await pool.query("SELECT 1 FROM availability_rules WHERE id = $1", [ruleBody.rule.id]);
  check("counsellor A's block survives the cross-account delete attempt", stillThere.rowCount === 1);

  check(
    "a counsellor cannot create counsellors",
    (
      await counsellorAApi("/admin/counsellors", {
        method: "POST",
        body: JSON.stringify({ fullName: "Nope" }),
      })
    ).status === 403
  );

  console.log("\n== roles: deactivation semantics ==");

  const counsellorAId = createABody.counsellor.id;
  const deactivate = await adminApi(`/admin/counsellors/${counsellorAId}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive: false }),
  });
  check("admin can deactivate a counsellor", deactivate.status === 200);

  const publicList = await listCounsellors();
  check(
    "a deactivated counsellor disappears from the public list",
    !publicList.some((c) => c.id === counsellorAId)
  );

  let inactiveBookingRejected = false;
  try {
    await resolveSlot(counsellorAId, istToUtc(nextWeekdayISO(2, 2), "10:00"));
  } catch (err: any) {
    inactiveBookingRejected = err.code === "counsellor_inactive";
  }
  check("a deactivated counsellor cannot receive new bookings", inactiveBookingRejected);

  check(
    "a deactivated counsellor cannot modify availability",
    (
      await counsellorAApi("/me/counsellor/availability-rules", {
        method: "POST",
        body: JSON.stringify({ weekday: 3, startTime: "10:00", endTime: "11:00" }),
      })
    ).status === 403
  );
  check("a deactivated counsellor cannot use self-service at all", (await counsellorAApi("/me/counsellor")).status === 403);

  const historyIntact = await pool.query("SELECT 1 FROM availability_rules WHERE id = $1", [ruleBody.rule.id]);
  check("deactivation deletes nothing", historyIntact.rowCount === 1);

  const reactivate = await adminApi(`/admin/counsellors/${counsellorAId}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive: true }),
  });
  check("admin can reactivate a counsellor", reactivate.status === 200);
  check("reactivation restores self-service", (await counsellorAApi("/me/counsellor")).status === 200);

  console.log("\n== roles: profile scoping ==");

  const profileGet = await studentApi("/me/profile");
  const profileBody = await profileGet.json();
  check("a student can read their own profile", profileGet.status === 200);
  check("the profile never includes a password hash", !JSON.stringify(profileBody).toLowerCase().includes("password"));

  const patched = await studentApi("/me/profile", {
    method: "PATCH",
    body: JSON.stringify({ fullName: "Renamed Student", department: "Computer Science", phone: "9999999999" }),
  });
  check("a student can update their permitted fields", patched.status === 200, `got ${patched.status}`);

  const emailAttempt = await studentApi("/me/profile", {
    method: "PATCH",
    body: JSON.stringify({ email: "someoneelse@iitism.ac.in" }),
  });
  check("a student cannot change their email through the profile", emailAttempt.status === 400);

  const roleAttempt = await studentApi("/me/profile", {
    method: "PATCH",
    body: JSON.stringify({ role: "admin" }),
  });
  check("a student cannot escalate their role through the profile", roleAttempt.status === 400);

  const unchanged = await pool.query<{ email: string; role: string }>(
    "SELECT email, role FROM users WHERE id = $1",
    [plainStudent.userId]
  );
  check(
    "email and role are untouched after those attempts",
    unchanged.rows[0].email === "profilestudent@iitism.ac.in" && unchanged.rows[0].role === "student"
  );

  const counsellorView = JSON.stringify(await listMyAppointments({ ...counsellorBUser, role: "counsellor" }));
  check(
    "a counsellor's appointment view exposes no phone/department/admission number",
    !counsellorView.includes("phone") &&
      !counsellorView.includes("department") &&
      !counsellorView.includes("admission")
  );

  await new Promise((resolve) => roleServer.close(resolve));

  // Leave no fake counsellors behind: counsellors are publicly listed, so fixtures left in the
  // database would be visible to real students.
  await clearFixtures();
  const leftovers = await pool.query("SELECT 1 FROM counsellors WHERE email = ANY($1)", [
    FIXTURE_COUNSELLOR_EMAILS,
  ]);
  check("the suite leaves no test counsellors in the database", leftovers.rowCount === 0);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  await mailSink.close();
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
