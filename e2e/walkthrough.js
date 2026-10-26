// Browser walkthrough of the whole portal. Needs: API on :4000 (SMTP pointed at the sink), Vite on :5173,
// and a mail sink that exposes captured mail as JSON on :2528 (see e2e/README.md).
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const SINK = process.env.SINK_URL || "http://127.0.0.1:2528";
const SHOTS = process.env.SHOT_DIR || "";
const PASSWORD = "Sup3r-secret-pass";
const student = `e2e${Date.now()}@iitism.ac.in`;

let passed = 0;
const failed = [];
function check(name, ok, detail) {
  if (ok) passed++;
  else failed.push(name + (detail ? ` (${detail})` : ""));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? "  -> " + detail : ""}`);
}

async function mailFor(to, subjectPart, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const res = await fetch(`${SINK}/?to=${encodeURIComponent(to)}`);
    const list = await res.json();
    const hit = list.reverse().find((m) => m.subject.includes(subjectPart));
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}
const linkTo = (mail, path) => mail.links.find((l) => new URL(l).pathname === path);

async function newPage(browser, errors) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  await page.route(/accounts\.google\.com|fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text());
  });
  return page;
}
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

async function devLogin(page, email) {
  await page.goto(`${BASE}/login`);
  await page.fill(".dev-row input", email);
  await page.click(".dev-row button");
  await page.waitForURL(`${BASE}/`);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  await fetch(`${SINK}/clear`);

  // ---------- Student: registration rules ----------
  let page = await newPage(browser, errors);
  await page.goto(`${BASE}/register`);
  await page.fill("#reg-email", "someone@gmail.com");
  await page.fill("#reg-password", PASSWORD);
  await page.fill("#reg-confirm", PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForSelector("div.alert.error");
  const domainMsg = await page.textContent("div.alert.error");
  check("Non iitism email is rejected on the register page", /iitism/i.test(domainMsg), domainMsg);

  await page.fill("#reg-email", "attacker@iitism.ac.in.fake.com");
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForTimeout(500);
  check("Look-alike domain is rejected", (await page.locator("h1", { hasText: "Check your email" }).count()) === 0);

  // ---------- Student: register, verify by email, sign in ----------
  await page.fill("#reg-email", student);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForSelector("h1:has-text('Check your email')");
  check("Registering shows the check your email panel and does not sign in", true);
  const verifyMail = await mailFor(student, "Verify");
  check("Verification email arrives for the new student", !!verifyMail, "no mail");

  await page.goto(`${BASE}/login`);
  await page.fill("#login-email", student);
  await page.fill("#login-password", PASSWORD);
  await page.locator("form button[type=submit]").click();
  await page.waitForTimeout(600);
  check("Password login is blocked until the email is verified", page.url().endsWith("/login"));

  await page.goto(linkTo(verifyMail, "/verify-email"));
  await page.waitForSelector("h1:has-text('Email verified')");
  check("Verification link verifies the account", true);

  await page.goto(`${BASE}/login`);
  await page.fill("#login-email", student);
  await page.fill("#login-password", PASSWORD);
  await page.locator("form button[type=submit]").click();
  await page.waitForURL(`${BASE}/`);
  check("Student signs in with the password after verifying", true);

  // ---------- Student: view all counsellors, book a slot ----------
  await page.waitForSelector("h2");
  const names = await page.locator(".card h2").allTextContents();
  check("Student sees all active counsellors", names.length >= 3, names.join(" | "));
  await shot(page, "01-counsellors");

  await page.locator('.card:has(h2:has-text("Aishwarya")) a[href^="/book/"]').click();
  await page.waitForSelector(".day-strip");
  for (let i = 0; i < 6; i++) {
    const next = page.getByRole("button", { name: /Next/ });
    if (await next.isDisabled()) break;
    await next.click();
    await page.waitForSelector(".day-strip");
  }
  check("Next week button stops at the booking horizon", await page.getByRole("button", { name: /Next/ }).isDisabled());
  while (!(await page.getByRole("button", { name: /Previous|Back|←/ }).first().isDisabled())) {
    await page.getByRole("button", { name: /Previous|Back|←/ }).first().click();
    await page.waitForSelector(".day-strip");
  }
  await page.locator(".day-chip:not([disabled])").first().click();
  await page.locator(".slot:not([disabled])").first().click();
  await page.fill("textarea", "E2E test note");
  await page.getByRole("button", { name: "Request appointment" }).click();
  await page.waitForSelector("h1:has-text('Appointment request created')");
  check("Booking creates a pending request", true);
  await shot(page, "02-requested");

  const confirmMail = await mailFor(student, "Confirm");
  check("Confirmation email arrives after booking", !!confirmMail, "no mail");
  const confirmLink = confirmMail && linkTo(confirmMail, "/confirm");
  check("Confirmation email has a confirm link", !!confirmLink);

  await page.goto(`${BASE}/appointments`);
  await page.waitForSelector(".appointment");
  const pendingText = await page.textContent(".appointment");
  check("My appointments shows the booking as awaiting confirmation", /awaiting|pending/i.test(pendingText), pendingText.slice(0, 120));

  // second tab: a different student must not see it as confirmed; confirm via the emailed link
  await page.goto(confirmLink);
  await page.waitForSelector("h1:has-text('Appointment confirmed')");
  check("Clicking the emailed link confirms the appointment", true);
  await shot(page, "03-confirmed");
  const bookedMail = await mailFor(student, "confirmed");
  check("A booked and confirmed email follows, with a calendar file", !!bookedMail && bookedMail.attachments.some((n) => /\.ics$/.test(n)), bookedMail && bookedMail.attachments.join(","));

  await page.goto(`${BASE}/appointments`);
  await page.waitForSelector(".appointment");
  check("My appointments now shows confirmed", /confirmed/i.test(await page.textContent(".appointment")));

  // role gating in the UI
  await page.goto(`${BASE}/admin`);
  await page.waitForTimeout(500);
  check("Student cannot open the admin area", !page.url().includes("/admin"), page.url());
  await page.goto(`${BASE}/counsellor`);
  await page.waitForTimeout(500);
  check("Student cannot open the counsellor dashboard", !page.url().includes("/counsellor"), page.url());

  // ---------- Counsellor ----------
  const counsellorEmail = "aishwaryarao@iitism.ac.in";
  const cpage = await newPage(browser, errors);
  await devLogin(cpage, counsellorEmail);
  await cpage.goto(`${BASE}/counsellor`);
  await cpage.waitForSelector("h1");
  await cpage.waitForTimeout(800);
  const dash = await cpage.textContent("main");
  check("Counsellor logs in and sees their own dashboard", /Aishwarya Rao/.test(dash));
  check("Counsellor dashboard lists the student's confirmed booking", dash.includes(student), dash.slice(0, 200));
  check("Counsellor dashboard shows the availability editor", /availability|weekly/i.test(dash));
  await shot(cpage, "04-counsellor");
  check("Counsellor dashboard renders without errors", errors.length === 0, errors.join(" ; "));
  check("Counsellor cannot open the admin area", await (async () => { await cpage.goto(`${BASE}/admin`); await cpage.waitForTimeout(500); return !cpage.url().includes("/admin"); })());

  // ---------- Admin ----------
  const apage = await newPage(browser, errors);
  await devLogin(apage, "admin@iitism.ac.in");
  await apage.goto(`${BASE}/admin`);
  await apage.waitForSelector("h1:has-text('Overview')");
  await apage.waitForSelector(".stat");
  check("Admin lands on the overview with figures", (await apage.locator(".stat").count()) >= 5);
  const overviewText = await apage.textContent("main");
  check("Overview shows no student email", !overviewText.includes(student));
  await shot(apage, "05-admin-overview");

  await apage.getByRole("link", { name: "Appointments", exact: true }).click();
  await apage.waitForSelector("h1:has-text('Appointments')");
  await apage.waitForSelector(`text=${student}`);
  check("Admin sees the student's booking in the appointments list", true);
  const listText = await apage.textContent("main");
  check("Admin list does not show the student's private note", !listText.includes("E2E test note"));
  await shot(apage, "06-admin-appointments");

  await apage.locator(".appointment", { hasText: student }).getByRole("button", { name: "Cancel" }).click();
  await apage.waitForSelector("[role=dialog]");
  await apage.locator("[role=dialog]").getByRole("button", { name: "Cancel appointment" }).click();
  await apage.waitForSelector(".toast, [role=status]");
  await apage.waitForTimeout(600);
  const cancelledMail = await mailFor(student, "cancel");
  check("Student is emailed when an admin cancels", !!cancelledMail, "no mail");
  check("Cancelled booking leaves the active list", (await apage.locator(".appointment", { hasText: student }).getByRole("button", { name: "Cancel" }).count()) === 0);

  // admin edits a counsellor: typing must keep focus (modal bug)
  await apage.goto(`${BASE}/admin/counsellors`);
  await apage.getByRole("button", { name: "Add counsellor" }).first().click();
  await apage.waitForSelector("[role=dialog]");
  await apage.click("#counsellor-name");
  await apage.keyboard.type("Hello World", { delay: 30 });
  check("Typing in the admin dialog keeps every character", (await apage.inputValue("#counsellor-name")) === "Hello World");
  await shot(apage, "07-admin-counsellor-dialog");
  await apage.keyboard.press("Escape");


  // admin creates a counsellor, the counsellor signs in, admin changes their email, then deactivates
  const stamp = Date.now();
  const newName = `E2E Counsellor ${stamp}`;
  const firstEmail = `e2ec${stamp}@iitism.ac.in`;
  const secondEmail = `e2ed${stamp}@iitism.ac.in`;
  await apage.getByRole("button", { name: "Add counsellor" }).first().click();
  await apage.waitForSelector("[role=dialog]");
  await apage.fill("#counsellor-name", newName);
  await apage.fill("#counsellor-email", firstEmail);
  await apage.fill("#counsellor-room", "Room 9");
  await apage.locator("[role=dialog]").getByRole("button", { name: "Add counsellor" }).click();
  await apage.waitForSelector(`li:has-text("${newName}")`);
  check("Admin can add a counsellor", true);

  const npage = await newPage(browser, errors);
  await devLogin(npage, firstEmail);
  await npage.waitForSelector("nav a[href='/counsellor']");
  check("A new counsellor signs in and gets the counsellor role", true);

  await page.goto(`${BASE}/`);
  await page.waitForSelector(".card h2");
  check("Students see the new counsellor in the list", (await page.locator(".card h2", { hasText: newName }).count()) === 1);

  await apage.locator(`li:has-text("${newName}")`).getByRole("button", { name: "Edit" }).click();
  await apage.waitForSelector("[role=dialog]");
  await apage.fill("#counsellor-email", secondEmail);
  await apage.fill("#counsellor-room", "Room 10");
  await apage.locator("[role=dialog]").getByRole("button", { name: "Save changes" }).click();
  await apage.waitForSelector(`li:has-text("Room 10")`);
  check("Admin can edit counsellor details", true);

  await npage.goto(`${BASE}/counsellor`);
  await npage.waitForTimeout(700);
  check("Changing the email removes counsellor access from the old account", !npage.url().includes("/counsellor"), npage.url());

  await apage.locator(`li:has-text("${newName}")`).getByRole("button", { name: "Deactivate" }).click();
  await apage.waitForSelector("[role=dialog]");
  await apage.locator("[role=dialog]").getByRole("button", { name: "Deactivate" }).click();
  await apage.waitForSelector(`li:has-text("${newName}") .chip:has-text("Deactivated")`);
  await page.goto(`${BASE}/`);
  await page.waitForSelector(".card h2");
  check("A deactivated counsellor disappears from the student list", (await page.locator(".card h2", { hasText: newName }).count()) === 0);
  await shot(apage, "08-admin-counsellors");

  check("No browser console or page errors during the walkthrough", errors.length === 0, errors.join(" ; "));

  await browser.close();
  console.log(`\n${passed} passed, ${failed.length} failed`);
  if (failed.length) {
    console.log(failed.map((f) => " - " + f).join("\n"));
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
