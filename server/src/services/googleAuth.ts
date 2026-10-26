import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env";
import { withTransaction } from "../db/pool";
import { forbidden, unauthorized } from "../lib/errors";
import { isAllowedEmailDomain, normalizeEmail } from "../lib/emailValidation";
import { SessionPayload } from "../lib/tokens";
import { resolveVerifiedRole } from "./roleAssignment";

const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);

type GoogleProfile = {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
};

export async function verifyGoogleCredential(credential: string): Promise<GoogleProfile> {
  if (!env.GOOGLE_CLIENT_ID) {
    throw unauthorized("Google sign-in is not configured on this server");
  }

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw unauthorized("Google sign-in could not be verified");
  }

  if (!payload || !payload.sub) throw unauthorized("Google sign-in could not be verified");
  if (!payload.email || payload.email_verified !== true) {
    throw unauthorized("Your Google account email is not verified");
  }

  const email = normalizeEmail(payload.email);

  if (!isAllowedEmailDomain(email)) {
    throw forbidden(`Please sign in with your @${env.ALLOWED_EMAIL_DOMAIN} college account`);
  }

  return {
    sub: payload.sub,
    email,
    name: payload.name || email.split("@")[0],
    picture: payload.picture ?? null,
  };
}

export type SessionUser = SessionPayload & {
  fullName: string;
  avatarUrl: string | null;
};

export async function upsertUserFromGoogle(profile: GoogleProfile): Promise<SessionUser> {
  return withTransaction(async (db) => {
    // Google has already proven this email (email_verified checked in verifyGoogleCredential),
    // so the row is created/updated first, then the role is recomputed from scratch.
    const upserted = await db.query<{
      id: string;
      email: string;
      full_name: string;
      avatar_url: string | null;
    }>(
      `INSERT INTO users (google_sub, email, full_name, avatar_url, role, last_login_at, email_verified_at)
       VALUES ($1, $2, $3, $4, 'student', now(), now())
       ON CONFLICT (email) DO UPDATE
         SET google_sub = EXCLUDED.google_sub,
             full_name = CASE WHEN users.google_sub IS NULL THEN EXCLUDED.full_name ELSE users.full_name END,
             avatar_url = EXCLUDED.avatar_url,
             last_login_at = now(),
             password_hash = CASE WHEN users.email_verified_at IS NULL THEN NULL ELSE users.password_hash END,
             email_verified_at = COALESCE(users.email_verified_at, now())
       RETURNING id, email, full_name, avatar_url`,
      [profile.sub, profile.email, profile.name, profile.picture]
    );

    const user = upserted.rows[0];

    // A password set on an account whose email was never verified was chosen by someone who had
    // not proven they own the inbox. Google has now proven it, so that password is discarded
    // above and any verification link still in flight is retired here.
    await db.query(
      "DELETE FROM user_tokens WHERE user_id = $1 AND purpose = 'email_verification'",
      [user.id]
    );

    // Recomputed every login, never sticky: an email removed from ADMIN_EMAILS is demoted here.
    const role = await resolveVerifiedRole(db, user.id, user.email);
    await db.query("UPDATE users SET role = $2 WHERE id = $1", [user.id, role]);

    return {
      userId: user.id,
      email: user.email,
      role,
      fullName: user.full_name,
      avatarUrl: user.avatar_url,
    };
  });
}
