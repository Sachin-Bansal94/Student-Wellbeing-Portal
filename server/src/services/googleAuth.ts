import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env";
import { withTransaction } from "../db/pool";
import { forbidden, unauthorized } from "../lib/errors";
import { isAllowedEmailDomain, normalizeEmail } from "../lib/emailValidation";
import { SessionPayload } from "../lib/tokens";

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
    const counsellor = await db.query<{ id: string }>(
      "SELECT id FROM counsellors WHERE lower(email) = $1",
      [profile.email]
    );
    const role = counsellor.rowCount ? "counsellor" : "student";

    const upserted = await db.query<{
      id: string;
      email: string;
      full_name: string;
      avatar_url: string | null;
      role: SessionPayload["role"];
    }>(
      `INSERT INTO users (google_sub, email, full_name, avatar_url, role, last_login_at, email_verified_at)
       VALUES ($1, $2, $3, $4, $5, now(), now())
       ON CONFLICT (email) DO UPDATE
         SET google_sub = EXCLUDED.google_sub,
             full_name = EXCLUDED.full_name,
             avatar_url = EXCLUDED.avatar_url,
             role = CASE WHEN users.role = 'admin' THEN users.role ELSE EXCLUDED.role END,
             last_login_at = now(),
             email_verified_at = COALESCE(users.email_verified_at, now())
       RETURNING id, email, full_name, avatar_url, role`,
      [profile.sub, profile.email, profile.name, profile.picture, role]
    );

    const user = upserted.rows[0];

    if (counsellor.rowCount) {
      await db.query("UPDATE counsellors SET user_id = $1 WHERE id = $2", [
        user.id,
        counsellor.rows[0].id,
      ]);
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
      avatarUrl: user.avatar_url,
    };
  });
}
