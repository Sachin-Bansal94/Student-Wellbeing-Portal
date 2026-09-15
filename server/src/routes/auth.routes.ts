import { Response, Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { badRequest, notFound, unauthorized } from "../lib/errors";
import { isAllowedEmailDomain, normalizeEmail } from "../lib/emailValidation";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS, signSession } from "../lib/tokens";
import { SessionUser, upsertUserFromGoogle, verifyGoogleCredential } from "../services/googleAuth";
import {
  loginWithPassword,
  registerWithPassword,
  requestPasswordReset,
  resendVerificationEmail,
  resetPassword,
  verifyEmailToken,
} from "../services/passwordAuth";
import { pool } from "../db/pool";
import { env, isProd } from "../config/env";

const router = Router();

function setSessionCookie(res: Response, user: SessionUser): void {
  const token = signSession({ userId: user.userId, email: user.email, role: user.role });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/",
  });
}

function toPublicUser(user: SessionUser) {
  return {
    id: user.userId,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    role: user.role,
  };
}

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many attempts. Try again later." } },
});

const sensitiveAuthLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many attempts. Try again later." } },
});

const googleSchema = z.object({ credential: z.string().min(10) });

router.post(
  "/google",
  authLimiter,
  asyncHandler(async (req, res) => {
    const parsed = googleSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("invalid_body", "Missing Google credential");

    const profile = await verifyGoogleCredential(parsed.data.credential);
    const user = await upsertUserFromGoogle(profile);

    setSessionCookie(res, user);
    res.json({ user: toPublicUser(user) });
  })
);

const devLoginSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(80).optional(),
});

router.post(
  "/dev-login",
  asyncHandler(async (req, res) => {
    if (!env.ALLOW_DEV_LOGIN || isProd) throw notFound("Route not found");

    const parsed = devLoginSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("invalid_body", "Provide a valid email");

    const email = normalizeEmail(parsed.data.email);
    if (!isAllowedEmailDomain(email)) {
      throw badRequest("wrong_domain", `Use an @${env.ALLOWED_EMAIL_DOMAIN} address`);
    }

    const user = await upsertUserFromGoogle({
      sub: `dev:${email}`,
      email,
      name: parsed.data.name ?? email.split("@")[0].replace(/[._]/g, " "),
      picture: null,
    });

    const token = signSession({ userId: user.userId, email: user.email, role: user.role });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_MS,
      path: "/",
    });

    res.json({ user: toPublicUser(user) });
  })
);

const registerSchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(8).max(200),
    confirmPassword: z.string().min(8).max(200),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

router.post(
  "/register",
  authLimiter,
  asyncHandler(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const passwordMismatch = parsed.error.issues.some((issue) => issue.path.includes("confirmPassword"));
      if (passwordMismatch) throw badRequest("password_mismatch", "Passwords do not match");
      throw badRequest("invalid_body", "Check your email and password");
    }

    const { user, needsVerification, emailSent } = await registerWithPassword(
      parsed.data.email,
      parsed.data.password
    );

    if (!needsVerification) {
      setSessionCookie(res, user);
      return res.status(201).json({ needsVerification: false, user: toPublicUser(user) });
    }

    res.status(201).json({ needsVerification: true, email: user.email, emailSent });
  })
);

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
});

router.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("invalid_body", "Enter your email and password");

    const user = await loginWithPassword(parsed.data.email, parsed.data.password);
    setSessionCookie(res, user);
    res.json({ user: toPublicUser(user) });
  })
);

const emailOnlySchema = z.object({ email: z.string().trim().email() });

router.post(
  "/resend-verification",
  sensitiveAuthLimiter,
  asyncHandler(async (req, res) => {
    const parsed = emailOnlySchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("invalid_body", "Provide your email");
    await resendVerificationEmail(parsed.data.email);
    res.json({ ok: true });
  })
);

const verifyEmailSchema = z.object({ token: z.string().min(10) });

router.post(
  "/verify-email",
  asyncHandler(async (req, res) => {
    const parsed = verifyEmailSchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("invalid_body", "Missing verification token");
    const { email } = await verifyEmailToken(parsed.data.token);
    res.json({ email, verified: true });
  })
);

router.post(
  "/forgot-password",
  sensitiveAuthLimiter,
  asyncHandler(async (req, res) => {
    const parsed = emailOnlySchema.safeParse(req.body);
    if (!parsed.success) throw badRequest("invalid_body", "Provide your email");
    await requestPasswordReset(parsed.data.email);
    res.json({ ok: true });
  })
);

const resetPasswordSchema = z
  .object({
    token: z.string().min(10),
    password: z.string().min(8).max(200),
    confirmPassword: z.string().min(8).max(200),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

router.post(
  "/reset-password",
  authLimiter,
  asyncHandler(async (req, res) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const passwordMismatch = parsed.error.issues.some((issue) => issue.path.includes("confirmPassword"));
      if (passwordMismatch) throw badRequest("password_mismatch", "Passwords do not match");
      throw badRequest("invalid_body", "Check your new password");
    }
    await resetPassword(parsed.data.token, parsed.data.password);
    res.json({ ok: true });
  })
);

router.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

router.get(
  "/me",
  asyncHandler(async (req, res) => {
    if (!req.session) throw unauthorized();
    const result = await pool.query(
      "SELECT id, email, full_name, avatar_url, role FROM users WHERE id = $1",
      [req.session.userId]
    );
    if (!result.rowCount) throw unauthorized();
    const user = result.rows[0];
    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        avatarUrl: user.avatar_url,
        role: user.role,
      },
    });
  })
);

router.get("/config", (_req, res) => {
  res.json({
    googleClientId: env.GOOGLE_CLIENT_ID,
    allowedDomain: env.ALLOWED_EMAIL_DOMAIN,
    slotMinutes: env.SLOT_MINUTES,
    cancellationCutoffHours: env.CANCELLATION_CUTOFF_HOURS,
    bookingHorizonDays: env.BOOKING_HORIZON_DAYS,
    pendingExpiryMinutes: env.PENDING_EXPIRY_MINUTES,
    devLoginEnabled: env.ALLOW_DEV_LOGIN && !isProd,
  });
});

export default router;
