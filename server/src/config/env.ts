import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  CLIENT_ORIGIN: z
    .string()
    .url()
    .default("http://localhost:5173")
    .transform((value) => value.replace(/\/+$/, "")),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  ALLOWED_EMAIL_DOMAIN: z.string().min(1).default("iitism.ac.in"),
  ADMIN_EMAILS: z
    .string()
    .optional()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    ),
  ALLOW_DEV_LOGIN: z
    .string()
    .optional()
    .default("false")
    .transform((value) => value === "true"),
  JWT_SECRET: z.string().min(16),
  CONFIRMATION_TOKEN_SECRET: z.string().min(16),
  AUTH_TOKEN_SECRET: z.string().min(16),
  RESEND_API_KEY: z.string().optional().default(""),
  MAIL_FROM: z.string().default("IIT ISM Wellbeing <wellbeing@example.com>"),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .string()
    .optional()
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SLOT_MINUTES: z.coerce.number().int().min(5).max(20).default(20),
  MIN_BOOKING_LEAD_MINUTES: z.coerce.number().int().min(0).default(60),
  PENDING_EXPIRY_MINUTES: z.coerce.number().int().min(5).default(10),
  CANCELLATION_CUTOFF_HOURS: z.coerce.number().int().min(0).default(4),
  BOOKING_HORIZON_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  EMAIL_VERIFICATION_EXPIRY_MINUTES: z.coerce.number().int().min(5).default(60 * 24),
  PASSWORD_RESET_EXPIRY_MINUTES: z.coerce.number().int().min(5).default(60),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";

if (env.ALLOW_DEV_LOGIN && isProd) {
  console.error("ALLOW_DEV_LOGIN cannot be enabled when NODE_ENV=production. Refusing to start.");
  process.exit(1);
}

if (!env.GOOGLE_CLIENT_ID && !env.ALLOW_DEV_LOGIN) {
  console.error("Set GOOGLE_CLIENT_ID, or set ALLOW_DEV_LOGIN=true to test without Google.");
  process.exit(1);
}

if (env.ALLOW_DEV_LOGIN) {
  console.warn("ALLOW_DEV_LOGIN is on: /api/auth/dev-login will sign in any college email without a password.");
}
