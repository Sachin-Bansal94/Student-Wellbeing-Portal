// MUST stay first: points DATABASE_URL at the test database and mail at the local sink.
import "./testEnv";

import type { AddressInfo } from "net";
import { OAuth2Client } from "google-auth-library";
import { pool } from "../src/db/pool";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { getAvailability, listCounsellors } from "../src/services/availability";
import { createBooking } from "../src/services/booking";
import { upsertUserFromGoogle, verifyGoogleCredential } from "../src/services/googleAuth";
import { loginWithPassword, registerWithPassword, verifyEmailToken } from "../src/services/passwordAuth";
import { SESSION_COOKIE, SessionPayload, signSession } from "../src/lib/tokens";
import { addDaysISO, todayIstISO } from "../src/lib/ist";
import { escapeHtml } from "../src/lib/html";
import { processDueEmails } from "../src/workers/emailWorker";
import { sweep } from "../src/workers/appointmentSweeper";
import { CapturedMail, MailSink, recipients, startMailSink, tokenFrom } from "./mailSink";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

const FIXTURE_PATTERN = "hx-%@iitism.ac.in";
const ADMIN_EMAIL = "verifyadmin@iitism.ac.in";

const FIXTURE_COUNSELLOR_NAMES = ["Hx %", "Dr <u>Markup</u>"];

async function clearFixtures() {
  await pool.query("DELETE FROM counsellors WHERE email LIKE $1 OR full_name LIKE ANY($2)", [
    FIXTURE_PATTERN,
    FIXTURE_COUNSELLOR_NAMES,
  ]);
  await pool.query("DELETE FROM users WHERE email LIKE $1 OR email = $2", [FIXTURE_PATTERN, ADMIN_EMAIL]);
}

type Reply = { status: number; body: any; headers: Headers };

function client(base: string) {
  return async function call(
    method: string,
    path: string,
    options: { cookie?: string; body?: unknown; origin?: string } = {}
  ): Promise<Reply> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (options.cookie) headers.Cookie = options.cookie;
    if (options.origin) headers.Origin = options.origin;
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body, headers: response.headers };
  };
}

const cookieFor = (session: SessionPayload) => `${SESSION_COOKIE}=${signSession(session)}`;
const sessionOf = (user: { userId: string; email: string; role: SessionPayload["role"] }): SessionPayload => ({
  userId: user.userId,
  email: user.email,
  role: user.role,
});

async function googleUser(email: string, name: string) {
  return upsertUserFromGoogle({ sub: `sub-${email}`, email, name, picture: null });
}

const mailTo = (email: string, subjectStart: string) => (mail: CapturedMail) =>
  recipients(mail).includes(email) && (mail.subject ?? "").startsWith(subjectStart);

async function main() {
  const sink: MailSink = await startMailSink();

  await pool.query("TRUNCATE scheduled_emails, appointments CASCADE");
  await clearFixtures();

  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  const call = client(`http://127.0.0.1:${port}/api`);

  const counsellors = await listCounsellors();
  const neethu = counsellors.find((c) => c.full_name.includes("Neethu"))!;

  const slotPool: string[] = [];
  const week = await getAvailability(neethu.id, addDaysISO(todayIstISO(), 2), 7);
  for (const day of week.days) {
    for (const slot of day.slots) if (slot.available) slotPool.push(slot.startsAt);
  }
  const takeSlot = () => {
    const slot = slotPool.shift();
    if (!slot) throw new Error("ran out of free slots for the suite");
    return slot;
  };

  console.log("\n== account takeover through password registration ==");

  const victim = await googleUser("hx-victim@iitism.ac.in", "Victim Student");
  const attack = await call("POST", "/auth/register", {
    body: { email: "hx-victim@iitism.ac.in", password: "attackerpass1", confirmPassword: "attackerpass1" },
  });
  check("registering over a Google account is accepted as a request, not a login", attack.status === 201);
  check("the response says verification is needed", attack.body.needsVerification === true);
  check("no session cookie is issued to the person who submitted the form", !attack.headers.get("set-cookie"));
  check("the response carries no user object", attack.body.user === undefined);

  const victimRow = await pool.query<{ password_hash: string | null }>(
    "SELECT password_hash FROM users WHERE id = $1",
    [victim.userId]
  );
  check("the attacker's password was not stored", victimRow.rows[0].password_hash === null);

  const attackLogin = await call("POST", "/auth/login", {
    body: { email: "hx-victim@iitism.ac.in", password: "attackerpass1" },
  });
  check("the attacker's password does not log in", attackLogin.status === 401);
  check("still no session without a cookie", (await call("GET", "/auth/me")).status === 401);

  const setMail = await sink.waitFor(mailTo("hx-victim@iitism.ac.in", "Finish adding a password"));
  check("only the real owner's inbox gets the link", recipients(setMail).length === 1);

  const ownerToken = tokenFrom(setMail, "/reset-password");
  const ownerReset = await call("POST", "/auth/reset-password", {
    body: { token: ownerToken, password: "ownerchoice123", confirmPassword: "ownerchoice123" },
  });
  check("the owner can choose a password through the link", ownerReset.status === 200);
  const ownerLogin = await call("POST", "/auth/login", {
    body: { email: "hx-victim@iitism.ac.in", password: "ownerchoice123" },
  });
  check("and then log in with it", ownerLogin.status === 200 && !!ownerLogin.headers.get("set-cookie"));
  check(
    "the attacker's password still does not work after the owner sets theirs",
    (await call("POST", "/auth/login", { body: { email: "hx-victim@iitism.ac.in", password: "attackerpass1" } }))
      .status === 401
  );

  const secondAttempt = await call("POST", "/auth/register", {
    body: { email: "hx-victim@iitism.ac.in", password: "attackerpass2", confirmPassword: "attackerpass2" },
  });
  check("once a password exists, registering again is refused", secondAttempt.status === 409);

  const adminGoogle = await googleUser(ADMIN_EMAIL, "Real Admin");
  check("the allowlisted address signs in as admin", adminGoogle.role === "admin");
  const adminAttack = await call("POST", "/auth/register", {
    body: { email: ADMIN_EMAIL, password: "attackerpass1", confirmPassword: "attackerpass1" },
  });
  check("the same attack on the admin address gives no session", !adminAttack.headers.get("set-cookie"));
  check(
    "and the admin area stays closed to it",
    (await call("GET", "/admin/counsellors")).status === 401 &&
      (await call("POST", "/auth/login", { body: { email: ADMIN_EMAIL, password: "attackerpass1" } })).status === 401
  );

  console.log("\n== pre-registered password does not survive the owner's Google sign in ==");

  await registerWithPassword("hx-prehijack@iitism.ac.in", "attackerpass1");
  const verifyMail = await sink.waitFor(mailTo("hx-prehijack@iitism.ac.in", "Verify your IIT"));
  const staleVerifyToken = tokenFrom(verifyMail, "/verify-email");
  await googleUser("hx-prehijack@iitism.ac.in", "Real Owner");

  let attackerBlocked = false;
  try {
    await loginWithPassword("hx-prehijack@iitism.ac.in", "attackerpass1");
  } catch (err: any) {
    attackerBlocked = err.code === "unauthorized";
  }
  check("the attacker's earlier password is gone", attackerBlocked);

  let staleLinkDead = false;
  try {
    await verifyEmailToken(staleVerifyToken);
  } catch (err: any) {
    staleLinkDead = err.code === "invalid_token";
  }
  check("the old verification link no longer works", staleLinkDead);

  console.log("\n== names ==");

  await googleUser("hx-name@iitism.ac.in", "Name From Google");
  await pool.query("UPDATE users SET full_name = 'Name I Chose' WHERE email = 'hx-name@iitism.ac.in'");
  await googleUser("hx-name@iitism.ac.in", "Name From Google");
  const keptName = await pool.query<{ full_name: string }>(
    "SELECT full_name FROM users WHERE email = 'hx-name@iitism.ac.in'"
  );
  check("signing in with Google again does not overwrite a name the student chose", keptName.rows[0].full_name === "Name I Chose");

  console.log("\n== Google ID token handling (verifier stubbed) ==");

  const original = OAuth2Client.prototype.verifyIdToken;
  const payloads: Record<string, any> = {
    good: { sub: "g1", email: "Hx-Good@IITISM.AC.IN", email_verified: true, name: "Good Student" },
    unverified: { sub: "g2", email: "hx-unverified@iitism.ac.in", email_verified: false, name: "X" },
    gmail: { sub: "g3", email: "someone@gmail.com", email_verified: true, name: "X" },
    lookalike1: { sub: "g4", email: "a@iitism.ac.in.evil.com", email_verified: true, name: "X" },
    lookalike2: { sub: "g5", email: "a@fakeiitism.ac.in", email_verified: true, name: "X" },
    subdomain: { sub: "g6", email: "a@mail.iitism.ac.in", email_verified: true, name: "X" },
    embedded: { sub: "g7", email: "iitism.ac.in@evil.com", email_verified: true, name: "X" },
    noEmail: { sub: "g8", name: "X" },
  };
  let lastAudience: unknown;
  (OAuth2Client.prototype as any).verifyIdToken = async ({ idToken, audience }: any) => {
    lastAudience = audience;
    if (!payloads[idToken]) throw new Error("bad signature");
    return { getPayload: () => payloads[idToken] };
  };

  async function googleOutcome(credential: string): Promise<string> {
    try {
      const profile = await verifyGoogleCredential(credential);
      return `ok:${profile.email}`;
    } catch (err: any) {
      return `${err.status}`;
    }
  }

  check("a verified college address is accepted and normalised", (await googleOutcome("good")) === "ok:hx-good@iitism.ac.in");
  check("the token is checked against our own client id", lastAudience === env.GOOGLE_CLIENT_ID);
  check("an unverified Google email is refused", (await googleOutcome("unverified")) === "401");
  check("a gmail.com account is refused", (await googleOutcome("gmail")) === "403");
  check("iitism.ac.in.evil.com is refused", (await googleOutcome("lookalike1")) === "403");
  check("fakeiitism.ac.in is refused", (await googleOutcome("lookalike2")) === "403");
  check("a subdomain of the college domain is refused", (await googleOutcome("subdomain")) === "403");
  check("the college domain inside the local part is refused", (await googleOutcome("embedded")) === "403");
  check("a token without an email is refused", (await googleOutcome("noEmail")) === "401");
  check("a token that fails signature checks is refused", (await googleOutcome("forged")) === "401");

  const viaHttpUnknown = await call("POST", "/auth/google", { body: { credential: "unknown-credential-value" } });
  check("an unknown credential over HTTP is a 401", viaHttpUnknown.status === 401);
  payloads["goodlong0000"] = payloads.good;
  const viaHttp = await call("POST", "/auth/google", { body: { credential: "goodlong0000" } });
  check("a valid credential over HTTP signs in and sets the cookie", viaHttp.status === 200 && !!viaHttp.headers.get("set-cookie"));
  payloads["gmaillong000"] = payloads.gmail;
  check(
    "a non college credential over HTTP is a 403",
    (await call("POST", "/auth/google", { body: { credential: "gmaillong000" } })).status === 403
  );
  check("a missing credential is a 400", (await call("POST", "/auth/google", { body: {} })).status === 400);
  (OAuth2Client.prototype as any).verifyIdToken = original;

  console.log("\n== registration rules over HTTP ==");

  const gmailRegister = await call("POST", "/auth/register", {
    body: { email: "someone@gmail.com", password: "password123", confirmPassword: "password123" },
  });
  check("a non college email cannot register", gmailRegister.status === 400 && gmailRegister.body.error?.code === "wrong_domain");
  const lookalikeRegister = await call("POST", "/auth/register", {
    body: { email: "hx-x@iitism.ac.in.evil.com", password: "password123", confirmPassword: "password123" },
  });
  check("a lookalike domain cannot register", lookalikeRegister.status === 400);
  const shortPassword = await call("POST", "/auth/register", {
    body: { email: "hx-short@iitism.ac.in", password: "short12", confirmPassword: "short12" },
  });
  check("a password under 8 characters is refused", shortPassword.status === 400);
  const devGmail = await call("POST", "/auth/dev-login", { body: { email: "someone@gmail.com" } });
  check("dev sign in also refuses non college addresses", devGmail.status === 400);

  console.log("\n== full student journey, through real emails ==");

  const s1 = "hx-s1@iitism.ac.in";
  const registered = await call("POST", "/auth/register", {
    body: { email: s1, password: "studentpass1", confirmPassword: "studentpass1" },
  });
  check("a student registers with a college email", registered.status === 201 && registered.body.emailSent === true);

  const unverifiedLogin = await call("POST", "/auth/login", { body: { email: s1, password: "studentpass1" } });
  check("they cannot log in before verifying", unverifiedLogin.status === 400 && unverifiedLogin.body.error?.code === "email_not_verified");

  const welcome = await sink.waitFor(mailTo(s1, "Verify your IIT"));
  const verified = await call("POST", "/auth/verify-email", { body: { token: tokenFrom(welcome, "/verify-email") } });
  check("the emailed link verifies the account", verified.status === 200);

  const login = await call("POST", "/auth/login", { body: { email: s1, password: "studentpass1" } });
  const studentCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  check("after verifying they can log in", login.status === 200 && login.body.user.role === "student");

  const publicList = await call("GET", "/counsellors");
  check("the counsellor list is visible", publicList.status === 200 && publicList.body.counsellors.length >= 3);
  check(
    "the public list exposes no emails or account ids",
    !JSON.stringify(publicList.body).includes("@") && !JSON.stringify(publicList.body).includes("user_id")
  );
  check("availability needs a login", (await call("GET", `/counsellors/${neethu.id}/availability`)).status === 401);

  const availability = await call("GET", `/counsellors/${neethu.id}/availability?from=${addDaysISO(todayIstISO(), 2)}&days=3`, {
    cookie: studentCookie,
  });
  check("a logged in student sees availability", availability.status === 200 && availability.body.days.length === 3);
  check(
    "slots only say free or busy",
    availability.body.days.every((d: any) =>
      d.slots.every((s: any) => Object.keys(s).sort().join() === "available,endsAt,startsAt")
    )
  );

  const journeySlot = takeSlot();
  const journeyDay = new Date(new Date(journeySlot).getTime() + 330 * 60_000).toISOString().slice(0, 10);
  const booked = await call("POST", "/appointments", {
    cookie: studentCookie,
    body: { counsellorId: neethu.id, startsAt: journeySlot, note: "hx note" },
  });
  check("booking creates a pending appointment", booked.status === 201 && booked.body.status === "pending");

  const confirmMail = await sink.waitFor(mailTo(s1, "Confirm your counselling appointment"));
  check("a confirmation email arrives with a confirm link", confirmMail.html !== false && !!tokenFrom(confirmMail, "/confirm"));

  const beforeConfirm = await call("GET", "/appointments/mine", { cookie: studentCookie });
  check("until confirmed, the appointment is still pending", beforeConfirm.body.appointments[0].status === "pending");

  sink.clear();
  const confirmToken = tokenFrom(confirmMail, "/confirm");
  const confirmed = await call("POST", "/appointments/confirm", { body: { token: confirmToken } });
  check("the emailed link confirms the appointment", confirmed.status === 200 && confirmed.body.status === "confirmed");

  const confirmedMail = await sink.waitFor(mailTo(s1, "Appointment confirmed"));
  const ics = confirmedMail.attachments.find((a) => a.filename === "appointment.ics");
  const icsText = ics ? ics.content.toString("utf8") : "";
  check("the confirmed email carries a calendar invite", !!ics && icsText.includes("BEGIN:VCALENDAR") && icsText.includes("METHOD:REQUEST"));
  const counsellorMail = await sink.waitFor(mailTo("neethuat@iitism.ac.in", "New booking"));
  check("the counsellor is told about the booking", !!counsellorMail);

  check(
    "the same link cannot be used twice",
    (await call("POST", "/appointments/confirm", { body: { token: confirmToken } })).body.error?.code === "already_confirmed"
  );
  check(
    "a made up token is refused",
    (await call("POST", "/appointments/confirm", { body: { token: "this-token-was-never-issued" } })).body.error?.code === "invalid_token"
  );

  const afterConfirm = await call("GET", "/appointments/mine", { cookie: studentCookie });
  check("the student now sees it as confirmed", afterConfirm.body.appointments[0].status === "confirmed");

  const journeyId = afterConfirm.body.appointments[0].id as string;
  await pool.query("UPDATE scheduled_emails SET send_after = now() - interval '1 minute' WHERE appointment_id = $1", [journeyId]);
  sink.clear();
  await processDueEmails();
  const reminders = sink.inbox.filter((m) => (m.subject ?? "").startsWith("Reminder:"));
  check("both reminders are sent when they fall due", reminders.length === 2 && reminders.every((m) => recipients(m).includes(s1)));
  const sentRows = await pool.query("SELECT status FROM scheduled_emails WHERE appointment_id = $1", [journeyId]);
  check("sent reminders are marked sent", sentRows.rows.every((r) => r.status === "sent"));
  sink.clear();
  await processDueEmails();
  check("reminders are never sent twice", sink.inbox.length === 0);

  sink.clear();
  const cancelled = await call("POST", `/appointments/${journeyId}/cancel`, { cookie: studentCookie });
  check("the student can cancel outside the cutoff window", cancelled.status === 200);
  const cancelMail = await sink.waitFor(mailTo(s1, "Appointment cancelled"));
  const cancelIcs = cancelMail.attachments.find((a) => a.filename === "cancelled.ics");
  check("the cancellation email retracts the calendar entry", !!cancelIcs && cancelIcs.content.toString("utf8").includes("METHOD:CANCEL"));
  check("the counsellor hears about the cancellation", !!(await sink.waitFor(mailTo("neethuat@iitism.ac.in", "Cancellation"))));

  console.log("\n== emails escape what students type ==");

  check("escapeHtml handles every special character", escapeHtml(`<a href="x">'&'</a>`) === "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  const sneaky = await googleUser("hx-sneaky@iitism.ac.in", "<img/src=x/onerror=alert(1)>");
  sink.clear();
  await createBooking(sessionOf(sneaky), neethu.id, takeSlot(), null);
  const sneakyMail = await sink.waitFor(mailTo("hx-sneaky@iitism.ac.in", "Confirm your counselling appointment"));
  const sneakyHtml = String(sneakyMail.html);
  check("a student name containing markup is not rendered as markup", !sneakyHtml.includes("<img/src") && sneakyHtml.includes("&lt;img/src"));

  const markupCounsellor = await call("POST", "/admin/counsellors", {
    cookie: cookieFor(sessionOf(await googleUser(ADMIN_EMAIL, "Real Admin"))),
    body: { fullName: "Dr <u>Markup</u>", venue: "<script>alert(2)</script>", room: "Room <b>1</b>", slotMinutes: 20 },
  });
  const markupId = markupCounsellor.body.counsellor.id as string;
  const markupDay = (await getAvailability(neethu.id, journeyDay, 1)).days[0].weekday;
  await call("POST", `/admin/counsellors/${markupId}/availability-rules`, {
    cookie: cookieFor(sessionOf(await googleUser(ADMIN_EMAIL, "Real Admin"))),
    body: { weekday: markupDay, startTime: "10:00", endTime: "12:00" },
  });
  const markupSlot = (await getAvailability(markupId, journeyDay, 1)).days[0].slots[0].startsAt;
  sink.clear();
  await createBooking(sessionOf(sneaky), markupId, markupSlot, null);
  const markupMail = await sink.waitFor(mailTo("hx-sneaky@iitism.ac.in", "Confirm your counselling appointment"));
  const markupHtml = String(markupMail.html);
  check(
    "counsellor name, venue and room are escaped in the appointment table",
    !markupHtml.includes("<script>alert(2)") && !markupHtml.includes("<u>Markup") && markupHtml.includes("&lt;script&gt;alert(2)")
  );
  await pool.query("DELETE FROM counsellors WHERE id = $1", [markupId]);

  console.log("\n== booking rules ==");

  const greedy = await googleUser("hx-greedy@iitism.ac.in", "Greedy Student");
  const greedyResults = await Promise.allSettled(
    [0, 1, 2, 3].map(() => createBooking(sessionOf(greedy), neethu.id, takeSlot(), null))
  );
  const greedyWins = greedyResults.filter((r) => r.status === "fulfilled").length;
  const greedyCodes = greedyResults
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason?.code);
  check("four parallel requests from one student produce exactly two bookings", greedyWins === 2, `got ${greedyWins}`);
  check("the rest are told they hit the limit", greedyCodes.length === 2 && greedyCodes.every((c) => c === "too_many_active"), greedyCodes.join());

  const holder = await googleUser("hx-holder@iitism.ac.in", "Holder Student");
  const taker = await googleUser("hx-taker@iitism.ac.in", "Taker Student");
  const contested = takeSlot();
  const heldBooking = await createBooking(sessionOf(holder), neethu.id, contested, null);
  await pool.query("UPDATE appointments SET confirmation_expires_at = now() - interval '1 minute' WHERE id = $1", [
    heldBooking.appointmentId,
  ]);
  let takeoverWorked = true;
  try {
    await createBooking(sessionOf(taker), neethu.id, contested, null);
  } catch {
    takeoverWorked = false;
  }
  check("a hold that ran out of time frees its slot straight away, before the sweeper runs", takeoverWorked);
  const holderRow = await pool.query("SELECT status FROM appointments WHERE id = $1", [heldBooking.appointmentId]);
  check("the lapsed hold is marked expired", holderRow.rows[0].status === "expired");

  const lapsed = await googleUser("hx-lapsed@iitism.ac.in", "Lapsed Student");
  for (let i = 0; i < 2; i++) {
    const b = await createBooking(sessionOf(lapsed), neethu.id, takeSlot(), null);
    await pool.query("UPDATE appointments SET confirmation_expires_at = now() - interval '1 minute' WHERE id = $1", [b.appointmentId]);
  }
  let lapsedCanBook = true;
  try {
    await createBooking(sessionOf(lapsed), neethu.id, takeSlot(), null);
  } catch {
    lapsedCanBook = false;
  }
  check("lapsed holds do not count against the two appointment limit", lapsedCanBook);

  const neethuUser = await upsertUserFromGoogle({ sub: "sub-neethu", email: "neethuat@iitism.ac.in", name: "Ms. Neethu AT", picture: null });
  check("the seeded counsellor email signs in as a counsellor", neethuUser.role === "counsellor");
  const counsellorBook = await call("POST", "/appointments", {
    cookie: cookieFor(sessionOf(neethuUser)),
    body: { counsellorId: neethu.id, startsAt: takeSlot() },
  });
  check("counsellor accounts cannot book", counsellorBook.status === 400 && counsellorBook.body.error?.code === "counsellors_cannot_book");

  const anyCookie = cookieFor(sessionOf(holder));
  check("a malformed appointment id is a 404, not a server error", (await call("POST", "/appointments/not-a-uuid/cancel", { cookie: anyCookie })).status === 404);
  check("a malformed counsellor id is a 404", (await call("GET", "/counsellors/xyz/availability", { cookie: anyCookie })).status === 404);

  console.log("\n== administrator ==");

  const adminCookie = cookieFor(sessionOf(adminGoogle));
  const noteStudent = await googleUser("hx-notes@iitism.ac.in", "Notes Student");
  const noteBooking = await createBooking(sessionOf(noteStudent), neethu.id, takeSlot(), "my very private note");
  await pool.query("UPDATE appointments SET status = 'confirmed', confirmed_at = now() WHERE id = $1", [noteBooking.appointmentId]);
  await pool.query(
    "INSERT INTO scheduled_emails (appointment_id, kind, send_after) VALUES ($1, 'reminder_1h', now() + interval '1 day')",
    [noteBooking.appointmentId]
  );

  const adminList = await call("GET", "/admin/appointments?scope=all", { cookie: adminCookie });
  check("an admin can list every appointment", adminList.status === 200 && adminList.body.appointments.length > 0);
  check(
    "the list shows who booked with whom",
    adminList.body.appointments.some((a: any) => a.student_email === "hx-notes@iitism.ac.in" && a.counsellor_name.includes("Neethu"))
  );
  check("student notes never reach the admin list", !JSON.stringify(adminList.body).includes("private note") && !JSON.stringify(adminList.body).includes("student_note"));
  check("filtering by status works", (await call("GET", "/admin/appointments?scope=all&status=confirmed", { cookie: adminCookie })).body.appointments.every((a: any) => a.status === "confirmed"));
  check("a bad filter is a 400", (await call("GET", "/admin/appointments?status=bogus", { cookie: adminCookie })).status === 400);
  check("a student cannot list appointments as admin", (await call("GET", "/admin/appointments", { cookie: anyCookie })).status === 403);
  check("a student cannot cancel through the admin route", (await call("POST", `/admin/appointments/${noteBooking.appointmentId}/cancel`, { cookie: anyCookie })).status === 403);

  const stats = await call("GET", "/admin/stats", { cookie: adminCookie });
  const totalRows = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM appointments");
  const statTotal = Object.values(stats.body.stats.totals as Record<string, number>).reduce((a, b) => a + b, 0);
  check("stats totals add up to the real number of appointments", stats.status === 200 && statTotal === totalRows.rows[0].n, `${statTotal} vs ${totalRows.rows[0].n}`);
  const upcomingRows = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM appointments WHERE status IN ('pending','confirmed') AND starts_at > now()");
  check("stats upcoming count matches the database", stats.body.stats.upcomingActive === upcomingRows.rows[0].n);
  check("stats contain no student emails", !JSON.stringify(stats.body).includes("@"));
  check("a student cannot read stats", (await call("GET", "/admin/stats", { cookie: anyCookie })).status === 403);

  const adminCounsellors = await call("GET", "/admin/counsellors", { cookie: adminCookie });
  const neethuRow = adminCounsellors.body.counsellors.find((c: any) => c.id === neethu.id);
  check("the counsellor list says how many upcoming appointments each has", typeof neethuRow.upcomingCount === "number" && neethuRow.upcomingCount > 0);

  sink.clear();
  const adminCancel = await call("POST", `/admin/appointments/${noteBooking.appointmentId}/cancel`, { cookie: adminCookie });
  check("an admin can cancel an appointment", adminCancel.status === 200);
  const adminRow = await pool.query<{ status: string; cancelled_by: string }>(
    "SELECT status, cancelled_by FROM appointments WHERE id = $1",
    [noteBooking.appointmentId]
  );
  check("it is recorded as cancelled by the admin", adminRow.rows[0].status === "cancelled" && adminRow.rows[0].cancelled_by === adminGoogle.userId);
  const reminderLeft = await pool.query("SELECT 1 FROM scheduled_emails WHERE appointment_id = $1 AND status = 'pending'", [noteBooking.appointmentId]);
  check("its reminders are stopped", reminderLeft.rowCount === 0);
  const adminMail = await sink.waitFor(mailTo("hx-notes@iitism.ac.in", "Appointment cancelled"));
  check("the student is told the Health Center cancelled", String(adminMail.html).includes("Health Center had to cancel"));
  check("the counsellor is told an administrator cancelled", String((await sink.waitFor(mailTo("neethuat@iitism.ac.in", "Cancellation"))).html).includes("administrator"));
  check("cancelling twice is refused", (await call("POST", `/admin/appointments/${noteBooking.appointmentId}/cancel`, { cookie: adminCookie })).body.error?.code === "not_cancellable");

  const soon = new Date(Date.now() + 2 * 60 * 60_000);
  const soonRow = await pool.query<{ id: string }>(
    `INSERT INTO appointments (counsellor_id, student_id, starts_at, ends_at, status, confirmed_at)
     VALUES ($1, $2, $3, $4, 'confirmed', now()) RETURNING id`,
    [neethu.id, noteStudent.userId, soon, new Date(soon.getTime() + 20 * 60_000)]
  );
  check(
    "an admin can cancel inside the window that locks students out",
    (await call("POST", `/admin/appointments/${soonRow.rows[0].id}/cancel`, { cookie: adminCookie })).status === 200
  );
  await pool.query("DELETE FROM appointments WHERE id = $1", [soonRow.rows[0].id]);

  console.log("\n== changing a counsellor's email ==");

  const unclaimedPerson = await googleUser("hx-cn-old@iitism.ac.in", "Old Counsellor");
  const created = await call("POST", "/admin/counsellors", {
    cookie: adminCookie,
    body: { email: "hx-cn-old@iitism.ac.in", fullName: "Hx Counsellor", slotMinutes: 20 },
  });
  const cnId = created.body.counsellor.id as string;
  check("a counsellor with an existing verified account is linked on creation", created.body.linkedExistingUser === true);
  const oldCookie = cookieFor({ ...sessionOf(unclaimedPerson), role: "counsellor" });
  check("the linked person can use counsellor self service", (await call("GET", "/me/counsellor", { cookie: oldCookie })).status === 200);

  const sameEmail = await call("PATCH", `/admin/counsellors/${cnId}`, {
    cookie: adminCookie,
    body: { email: "hx-cn-old@iitism.ac.in", title: "Counsellor" },
  });
  check("saving other fields with the same email keeps the link", sameEmail.status === 200 && sameEmail.body.counsellor.linkedAccount === true);

  const moved = await call("PATCH", `/admin/counsellors/${cnId}`, {
    cookie: adminCookie,
    body: { email: "hx-cn-new@iitism.ac.in" },
  });
  check("an admin can change the email", moved.status === 200 && moved.body.counsellor.email === "hx-cn-new@iitism.ac.in");
  check("the record is released while nobody owns the new address", moved.body.counsellor.linkedAccount === false);
  const oldRole = await pool.query<{ role: string }>("SELECT role FROM users WHERE id = $1", [unclaimedPerson.userId]);
  check("the previous account drops back to student", oldRole.rows[0].role === "student");
  check("and loses counsellor access at once, even with an old cookie", (await call("GET", "/me/counsellor", { cookie: oldCookie })).status === 403);

  const newPerson = await googleUser("hx-cn-new@iitism.ac.in", "New Counsellor");
  check("the person who owns the new address claims the record by signing in", newPerson.role === "counsellor");
  check("and gets counsellor access", (await call("GET", "/me/counsellor", { cookie: cookieFor(sessionOf(newPerson)) })).status === 200);

  await googleUser("hx-cn-third@iitism.ac.in", "Third Person");
  const toExisting = await call("PATCH", `/admin/counsellors/${cnId}`, {
    cookie: adminCookie,
    body: { email: "hx-cn-third@iitism.ac.in" },
  });
  check("moving to an address with a verified account links it straight away", toExisting.body.counsellor.linkedAccount === true);
  const thirdRole = await pool.query<{ role: string }>("SELECT role FROM users WHERE email = 'hx-cn-third@iitism.ac.in'");
  check("that account becomes a counsellor", thirdRole.rows[0].role === "counsellor");
  const newRole = await pool.query<{ role: string }>("SELECT role FROM users WHERE id = $1", [newPerson.userId]);
  check("the account that held it before drops back to student", newRole.rows[0].role === "student");

  const otherCn = await call("POST", "/admin/counsellors", {
    cookie: adminCookie,
    body: { email: "hx-cn-other@iitism.ac.in", fullName: "Other Counsellor" },
  });
  const clash = await call("PATCH", `/admin/counsellors/${cnId}`, {
    cookie: adminCookie,
    body: { email: "hx-cn-other@iitism.ac.in" },
  });
  check("using another counsellor's email is a conflict", clash.status === 409 && clash.body.error?.code === "counsellor_exists");
  const thirdStillCounsellor = await pool.query<{ role: string }>("SELECT role FROM users WHERE email = 'hx-cn-third@iitism.ac.in'");
  check("a failed change leaves everything as it was", thirdStillCounsellor.rows[0].role === "counsellor");

  const cleared = await call("PATCH", `/admin/counsellors/${cnId}`, { cookie: adminCookie, body: { email: null } });
  check("an admin can clear the email", cleared.status === 200 && cleared.body.counsellor.email === null && cleared.body.counsellor.linkedAccount === false);
  check("clearing an email that does not exist yet is also fine", otherCn.status === 201);

  console.log("\n== cross site requests and rate limits ==");

  const logoutEvil = await call("POST", "/auth/logout", { origin: "https://evil.example", cookie: anyCookie });
  check("a write from another site is refused", logoutEvil.status === 403);
  const cancelEvil = await call("POST", `/appointments/${journeyId}/cancel`, { origin: "https://evil.example", cookie: anyCookie });
  check("cancelling from another site is refused too", cancelEvil.status === 403);
  check("a write from our own site is allowed", (await call("POST", "/auth/logout", { origin: env.CLIENT_ORIGIN })).status === 200);
  check("a write with no origin header (curl, mobile) is allowed", (await call("POST", "/auth/logout")).status === 200);
  const preflight = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "OPTIONS",
    headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" },
  });
  check("another site gets no permission to read responses", preflight.headers.get("access-control-allow-origin") !== "https://evil.example");

  let hitLimit = 0;
  for (let i = 0; i < 12; i++) {
    const r = await call("POST", "/auth/login", { body: { email: "hx-rl-a@iitism.ac.in", password: "wrongpass123" } });
    if (r.status === 429 && !hitLimit) hitLimit = i + 1;
  }
  check("guessing one account's password is stopped after ten tries", hitLimit === 11, `limit hit on try ${hitLimit}`);
  const otherAccount = await call("POST", "/auth/login", { body: { email: "hx-rl-b@iitism.ac.in", password: "wrongpass123" } });
  check("other students on the same network are not locked out", otherAccount.status === 401);

  console.log("\n== email trouble never breaks a booking ==");

  const outage = await googleUser("hx-outage@iitism.ac.in", "Outage Student");
  await sink.close();
  const duringOutage = await createBooking(sessionOf(outage), neethu.id, takeSlot(), null);
  check("with the mail server down the booking still succeeds", !!duringOutage.appointmentId);
  check("the response says the email did not go out", duringOutage.emailSent === false);
  const outageRow = await pool.query("SELECT status FROM appointments WHERE id = $1", [duringOutage.appointmentId]);
  check("the appointment is held as pending so it can be recovered", outageRow.rows[0].status === "pending");

  const sink2 = await startMailSink();
  const resent = await call("POST", `/appointments/${duringOutage.appointmentId}/resend`, { cookie: cookieFor(sessionOf(outage)) });
  check("once mail is back, resend delivers it", resent.status === 200 && resent.body.emailSent === true);
  check("and the link in it confirms the booking", !!tokenFrom(await sink2.waitFor(mailTo("hx-outage@iitism.ac.in", "Confirm your counselling")), "/confirm"));

  await sweep();
  await sink2.close();
  server.close();
  await clearFixtures();
  await pool.query("TRUNCATE scheduled_emails, appointments CASCADE");
  const leftovers = await pool.query("SELECT 1 FROM users WHERE email LIKE $1", [FIXTURE_PATTERN]);
  check("the suite leaves no fixtures behind", leftovers.rowCount === 0);
  const strayCounsellors = await pool.query("SELECT count(*)::int AS n FROM counsellors");
  check("the suite leaves only the three seeded counsellors", strayCounsellors.rows[0].n === 3, `got ${strayCounsellors.rows[0].n}`);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
