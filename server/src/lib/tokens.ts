import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type SessionPayload = {
  userId: string;
  email: string;
  role: "student" | "counsellor" | "admin";
};

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: SESSION_TTL_SECONDS });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, env.JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export function createConfirmationToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, hash: hashConfirmationToken(token) };
}

export function hashConfirmationToken(token: string): string {
  return crypto.createHmac("sha256", env.CONFIRMATION_TOKEN_SECRET).update(token).digest("hex");
}

// Deliberately a separate primitive (own secret) from the appointment-confirmation token above —
// used for account-level tokens (email verification, password reset) so the two purposes can
// never be confused or substituted for one another.
export function createAuthToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, hash: hashAuthToken(token) };
}

export function hashAuthToken(token: string): string {
  return crypto.createHmac("sha256", env.AUTH_TOKEN_SECRET).update(token).digest("hex");
}

export const SESSION_COOKIE = "wb_session";
export const SESSION_MAX_AGE_MS = SESSION_TTL_SECONDS * 1000;
