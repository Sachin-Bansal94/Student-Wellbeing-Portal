import { pool, withTransaction } from "../db/pool";
import { env } from "../config/env";
import { badRequest, conflict, unauthorized } from "../lib/errors";
import { deriveNameFromEmail, isAllowedEmailDomain, normalizeEmail } from "../lib/emailValidation";
import { hashPassword, verifyPassword } from "../lib/password";
import { createAuthToken, hashAuthToken } from "../lib/tokens";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email";
import { SessionUser } from "./googleAuth";

// A fixed, valid hash checked whenever no real account/password exists, so login always pays
// the same scrypt cost regardless of whether the email is registered — otherwise response time
// itself would leak account existence.
const DUMMY_HASH = hashPassword("not-a-real-password-used-only-for-timing-safety");

async function trySend(kind: string, email: string, send: () => Promise<void>): Promise<boolean> {
  try {
    await send();
    return true;
  } catch (err) {
    console.error(`failed to send ${kind} email to ${email}`, err);
    return false;
  }
}

async function issueUserToken(
  userId: string,
  purpose: "email_verification" | "password_reset"
): Promise<string> {
  const { token, hash } = createAuthToken();
  const minutes =
    purpose === "email_verification" ? env.EMAIL_VERIFICATION_EXPIRY_MINUTES : env.PASSWORD_RESET_EXPIRY_MINUTES;
  const expiresAt = new Date(Date.now() + minutes * 60_000);

  await pool.query(
    `INSERT INTO user_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, purpose) DO UPDATE
       SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, used_at = NULL`,
    [userId, purpose, hash, expiresAt]
  );

  return token;
}

export type RegisterResult = { needsVerification: boolean; emailSent: boolean; user: SessionUser };

export async function registerWithPassword(rawEmail: string, password: string): Promise<RegisterResult> {
  const email = normalizeEmail(rawEmail);
  if (!isAllowedEmailDomain(email)) {
    throw badRequest("wrong_domain", `Use your @${env.ALLOWED_EMAIL_DOMAIN} email address`);
  }

  const passwordHash = await hashPassword(password);

  const outcome = await withTransaction(async (client) => {
    const existing = await client.query<{
      id: string;
      full_name: string;
      avatar_url: string | null;
      role: SessionUser["role"];
      password_hash: string | null;
      email_verified_at: Date | null;
    }>(
      `SELECT id, full_name, avatar_url, role, password_hash, email_verified_at
         FROM users WHERE email = $1 FOR UPDATE`,
      [email]
    );

    if (existing.rowCount) {
      const row = existing.rows[0];
      if (row.password_hash) {
        throw conflict("email_registered", "An account with this email already exists. Try logging in instead.");
      }

      // A Google-created account is adding a password — link, don't duplicate.
      await client.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [row.id, passwordHash]);
      return {
        needsVerification: !row.email_verified_at,
        user: {
          userId: row.id,
          email,
          role: row.role,
          fullName: row.full_name,
          avatarUrl: row.avatar_url,
        } satisfies SessionUser,
      };
    }

    // Match upsertUserFromGoogle's behavior: a seeded counsellor email still gets the
    // counsellor role even if they choose password auth instead of Google.
    const counsellor = await client.query<{ id: string }>(
      "SELECT id FROM counsellors WHERE lower(email) = $1",
      [email]
    );
    const role: SessionUser["role"] = counsellor.rowCount ? "counsellor" : "student";

    const fullName = deriveNameFromEmail(email);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [email, passwordHash, fullName, role]
    );

    if (counsellor.rowCount) {
      await client.query("UPDATE counsellors SET user_id = $1 WHERE id = $2", [
        inserted.rows[0].id,
        counsellor.rows[0].id,
      ]);
    }

    return {
      needsVerification: true,
      user: {
        userId: inserted.rows[0].id,
        email,
        role,
        fullName,
        avatarUrl: null,
      } satisfies SessionUser,
    };
  });

  let emailSent = true;
  if (outcome.needsVerification) {
    const token = await issueUserToken(outcome.user.userId, "email_verification");
    emailSent = await trySend("verification", email, () => sendVerificationEmail(email, token));
  }

  return { ...outcome, emailSent };
}

export async function loginWithPassword(rawEmail: string, password: string): Promise<SessionUser> {
  const invalid = () => unauthorized("Invalid email or password");
  const email = normalizeEmail(rawEmail);

  if (!isAllowedEmailDomain(email)) {
    await verifyPassword(password, await DUMMY_HASH);
    throw invalid();
  }

  const result = await pool.query<{
    id: string;
    full_name: string;
    avatar_url: string | null;
    role: SessionUser["role"];
    password_hash: string | null;
    email_verified_at: Date | null;
  }>(
    `SELECT id, full_name, avatar_url, role, password_hash, email_verified_at FROM users WHERE email = $1`,
    [email]
  );
  const row = result.rows[0];

  const valid = await verifyPassword(password, row?.password_hash ?? (await DUMMY_HASH));
  if (!row || !row.password_hash || !valid) throw invalid();

  if (!row.email_verified_at) {
    throw badRequest(
      "email_not_verified",
      "Please verify your email before logging in. You can request a new verification link."
    );
  }

  await pool.query("UPDATE users SET last_login_at = now() WHERE id = $1", [row.id]);

  return { userId: row.id, email, role: row.role, fullName: row.full_name, avatarUrl: row.avatar_url };
}

export async function verifyEmailToken(token: string): Promise<{ email: string }> {
  const hash = hashAuthToken(token);

  return withTransaction(async (client) => {
    const result = await client.query<{ user_id: string }>(
      `UPDATE user_tokens SET used_at = now()
        WHERE token_hash = $1 AND purpose = 'email_verification' AND used_at IS NULL AND expires_at > now()
        RETURNING user_id`,
      [hash]
    );

    if (!result.rowCount) {
      const known = await client.query<{ used_at: Date | null }>(
        `SELECT used_at FROM user_tokens WHERE token_hash = $1 AND purpose = 'email_verification'`,
        [hash]
      );
      if (!known.rowCount) throw badRequest("invalid_token", "This verification link is not valid");
      if (known.rows[0].used_at) throw conflict("already_verified", "Your email is already verified");
      throw badRequest("expired_token", "This verification link has expired");
    }

    const updated = await client.query<{ email: string }>(
      `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now())
        WHERE id = $1 RETURNING email`,
      [result.rows[0].user_id]
    );
    return { email: updated.rows[0].email };
  });
}

export async function resendVerificationEmail(rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!isAllowedEmailDomain(email)) return;

  const result = await pool.query<{ id: string; password_hash: string | null; email_verified_at: Date | null }>(
    `SELECT id, password_hash, email_verified_at FROM users WHERE email = $1`,
    [email]
  );
  const row = result.rows[0];
  if (!row || !row.password_hash || row.email_verified_at) return;

  const token = await issueUserToken(row.id, "email_verification");
  await trySend("verification", email, () => sendVerificationEmail(email, token));
}

export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!isAllowedEmailDomain(email)) return;

  const result = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  if (!result.rowCount) return;

  const token = await issueUserToken(result.rows[0].id, "password_reset");
  await trySend("password reset", email, () => sendPasswordResetEmail(email, token));
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const hash = hashAuthToken(token);
  const passwordHash = await hashPassword(newPassword);

  await withTransaction(async (client) => {
    const result = await client.query<{ user_id: string }>(
      `UPDATE user_tokens SET used_at = now()
        WHERE token_hash = $1 AND purpose = 'password_reset' AND used_at IS NULL AND expires_at > now()
        RETURNING user_id`,
      [hash]
    );

    if (!result.rowCount) {
      const known = await client.query<{ used_at: Date | null }>(
        `SELECT used_at FROM user_tokens WHERE token_hash = $1 AND purpose = 'password_reset'`,
        [hash]
      );
      if (!known.rowCount) throw badRequest("invalid_token", "This reset link is not valid");
      if (known.rows[0].used_at) throw badRequest("invalid_token", "This reset link has already been used");
      throw badRequest("expired_token", "This reset link has expired");
    }

    // Using the link proves control of the inbox, same as email verification would.
    await client.query(
      `UPDATE users SET password_hash = $2, email_verified_at = COALESCE(email_verified_at, now())
        WHERE id = $1`,
      [result.rows[0].user_id, passwordHash]
    );
  });
}
