// Captures every page at 1440 and 375 pixels and audits the layout at four widths.
// Needs the same setup as the walkthrough (see README.md). Uses fixture data only.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const SINK = process.env.SINK_URL || "http://127.0.0.1:2528";
const API = process.env.API_URL || "http://127.0.0.1:4100";
const OUT = process.env.SHOT_DIR || path.join(__dirname, "..", "docs", "screenshots");
const SHOT_WIDTHS = [1440, 375];
const AUDIT_WIDTHS = [1440, 1024, 768, 375];
const PASSWORD = "Sup3r-secret-pass";
const stamp = Date.now();
const student = `shot${stamp}@iitism.ac.in`;

const problems = [];

async function mailFor(to, subjectPart) {
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    const list = await (await fetch(`${SINK}/?to=${encodeURIComponent(to)}`)).json();
    const hit = list.reverse().find((m) => m.subject.includes(subjectPart));
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no mail for ${to}: ${subjectPart}`);
}
const linkTo = (mail, p) => mail.links.find((l) => new URL(l).pathname === p);

async function audit(page, name) {
  const report = await page.evaluate((isPhone) => {
    const found = [];
    const root = document.documentElement;
    if (root.scrollWidth > window.innerWidth) found.push(`horizontal scroll ${root.scrollWidth}px`);

    const h1s = document.querySelectorAll("h1").length;
    if (h1s !== 1) found.push(`${h1s} h1 elements`);

    let last = 0;
    for (const heading of document.querySelectorAll("main h1, main h2, main h3, main h4")) {
      const level = Number(heading.tagName[1]);
      if (last && level > last + 1) found.push(`heading skips to ${heading.tagName}: ${heading.textContent.slice(0, 30)}`);
      last = level;
    }

    for (const field of document.querySelectorAll("input, select, textarea")) {
      const labelled = field.labels?.length || field.getAttribute("aria-label");
      if (!labelled) found.push(`no label on ${field.tagName} ${field.id || field.type}`);
    }

    const textOverflow = [...document.querySelectorAll("main *, header *, footer *")].filter((el) => {
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.right > window.innerWidth + 1 && !el.closest(".table-card");
    });
    if (textOverflow.length) found.push(`past the right edge: ${textOverflow[0].tagName}.${textOverflow[0].className}`);

    if (isPhone) {
      for (const el of document.querySelectorAll("a, button, input, select, textarea, summary")) {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        const inSentence = el.tagName === "A" && el.closest("p") && !el.classList.contains("button");
        if (inSentence || el.type === "checkbox") continue;
        if (box.height < 43.5) found.push(`tap target ${Math.round(box.height)}px: ${(el.textContent || el.id).trim().slice(0, 28)}`);
      }
    }
    return [...new Set(found)];
  }, page.viewportSize().width < 500);
  for (const item of report) problems.push(`${name} @${page.viewportSize().width}: ${item}`);
}

async function capture(page, name, prepare) {
  for (const width of AUDIT_WIDTHS) {
    await page.setViewportSize({ width, height: width < 500 ? 812 : 900 });
    if (prepare) await prepare();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(350);
    await audit(page, name);
    if (SHOT_WIDTHS.includes(width)) {
      await page.screenshot({
        path: path.join(OUT, `${name}-${width}.jpg`),
        fullPage: true,
        type: "jpeg",
        quality: 62,
      });
    }
  }
}

(async () => {
  const health = await fetch(`${API}/api/auth/config`).catch(() => null);
  if (!health?.ok) throw new Error(`The test API is not running on ${API}. See e2e/README.md.`);

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const open = async () => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    // Anything not going to the test API is blocked, so a stray dev server can never receive a write.
    await context.route(/\/api\//, (route) =>
      new URL(route.request().url()).origin === API ? route.continue() : route.abort()
    );
    const page = await context.newPage();
    await page.route(/accounts\.google\.com/, (route) => route.abort());
    return page;
  };

  const visitor = await open();
  const shoot = async (page, name, url, ready, prepare) => {
    await page.goto(`${BASE}${url}`);
    await page.waitForSelector(ready);
    await capture(page, name, prepare);
  };

  await shoot(visitor, "home", "/", "#counsellors .card h3");
  await shoot(visitor, "login", "/login", "#login-email");
  await shoot(visitor, "register", "/register", "#reg-email");
  await shoot(visitor, "forgot-password", "/forgot-password", "#forgot-email");
  await shoot(visitor, "reset-password", "/reset-password?token=example", "#new-password");
  await shoot(visitor, "reset-password-invalid", "/reset-password", "h1");
  await shoot(visitor, "confirm-invalid", "/confirm", "h1");
  await shoot(visitor, "verify-invalid", "/verify-email", "h1");

  const reg = await open();
  await reg.goto(`${BASE}/register`);
  await reg.fill("#reg-email", student);
  await reg.fill("#reg-password", PASSWORD);
  await reg.fill("#reg-confirm", PASSWORD);
  await reg.getByRole("button", { name: /create account/i }).click();
  await reg.waitForSelector("h1:has-text('Check your email')");
  await capture(reg, "check-your-email");

  const verify = linkTo(await mailFor(student, "Verify"), "/verify-email");
  await reg.goto(verify);
  await reg.waitForSelector("h1:has-text('Email verified')");
  await capture(reg, "email-verified");

  await reg.goto(`${BASE}/login`);
  await reg.fill("#login-email", student);
  await reg.fill("#login-password", PASSWORD);
  await reg.locator("form button[type=submit]").click();
  await reg.waitForURL(`${BASE}/`);
  await reg.waitForSelector(".card h2");
  await capture(reg, "counsellors");

  await reg.goto(`${BASE}/appointments`);
  await reg.waitForSelector("h1");
  await reg.waitForSelector(".empty-state-panel");
  await capture(reg, "appointments-empty");

  await reg.goto(`${BASE}/`);
  await reg.locator('.card:has(h2:has-text("Aishwarya")) a[href^="/book/"]').click();
  await reg.waitForSelector(".day-strip");
  await reg.locator(".day-chip:not([disabled])").first().click();
  await capture(reg, "book");
  await reg.locator(".slot:not([disabled])").first().click();
  await reg.fill("textarea", "Fixture note for the screenshots.");
  await capture(reg, "book-selected");

  await reg.getByRole("button", { name: "Request appointment" }).click();
  await reg.waitForSelector("h1:has-text('Appointment request created')");
  await capture(reg, "appointment-requested");

  const confirm = linkTo(await mailFor(student, "Confirm"), "/confirm");
  await reg.goto(`${BASE}/appointments`);
  await reg.waitForSelector(".appointment");
  await capture(reg, "appointments-pending");

  await reg.goto(confirm);
  await reg.waitForSelector("h1:has-text('Appointment confirmed')");
  await capture(reg, "appointment-confirmed");

  await reg.goto(`${BASE}/appointments`);
  await reg.waitForSelector(".appointment");
  await capture(reg, "appointments");
  await shoot(reg, "profile", "/profile", "#profile-name");

  const counsellor = await open();
  await counsellor.goto(`${BASE}/login`);
  await counsellor.fill(".dev-row input", "aishwaryarao@iitism.ac.in");
  await counsellor.click(".dev-row button");
  await counsellor.waitForURL(`${BASE}/`);
  await shoot(counsellor, "counsellor-dashboard", "/counsellor", ".stat");
  await counsellor.getByRole("tab", { name: "Availability" }).click();
  await counsellor.waitForSelector(".is-active-day .availability-track");
  await capture(counsellor, "counsellor-availability");

  const admin = await open();
  await admin.goto(`${BASE}/login`);
  await admin.fill(".dev-row input", "admin@iitism.ac.in");
  await admin.click(".dev-row button");
  await admin.waitForURL(`${BASE}/`);
  await shoot(admin, "admin-overview", "/admin/overview", ".stat");
  await shoot(admin, "admin-appointments", "/admin/appointments", ".appointment");
  await admin.goto(`${BASE}/admin/counsellors`);
  await admin.waitForSelector(".counsellor-admin-row");
  await admin.getByRole("tab", { name: "Active", exact: true }).click();
  await capture(admin, "admin-counsellors");
  await admin.getByRole("button", { name: "Add counsellor" }).first().click();
  await admin.waitForSelector("[role=dialog]");
  await capture(admin, "admin-counsellor-dialog");
  await admin.keyboard.press("Escape");
  await admin.locator(".counsellor-admin-row").first().getByRole("button", { name: "Deactivate" }).click();
  await admin.waitForSelector("[role=dialog]");
  await capture(admin, "admin-confirm-dialog");

  await browser.close();
  console.log(`saved to ${OUT}`);
  console.log(problems.length ? `\n${problems.length} layout problems:\n${problems.join("\n")}` : "\nNo layout problems found.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
