import { PoolClient } from "pg";
import { env } from "../config/env";
import { pool } from "../db/pool";
import { SessionPayload } from "../lib/tokens";

export type Role = SessionPayload["role"];

/** Pool and PoolClient both satisfy this, so callers can pass either. */
type Queryable = Pick<PoolClient, "query">;

/**
 * ADMIN_EMAILS is the authoritative, operator-configured allowlist. users.role is a cache of
 * this decision, never the source of truth — an email removed from the allowlist loses admin
 * authority immediately, even if the database row still says 'admin'.
 */
export function isAdminEmail(email: string): boolean {
  return env.ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * Resolves the role for a user whose email is already proven (Google's verified ID token, or a
 * completed email verification). Claims an unlinked counsellor record for them as a side effect.
 *
 * Precedence: admin (allowlist) > counsellor (linked counsellor record) > student.
 *
 * A counsellor keeps the counsellor role even when their record is deactivated, so they retain
 * read access to their own appointment history. Whether they may *act* is gated separately by
 * resolveOwnCounsellor(), which requires is_active.
 */
export async function resolveVerifiedRole(
  client: Queryable,
  userId: string,
  email: string
): Promise<Role> {
  const normalized = email.trim().toLowerCase();

  // Claim an unclaimed counsellor record for this now-verified email. The user_id IS NULL guard
  // means a record already bound to someone else can never be re-bound by a second account.
  await client.query(
    `UPDATE counsellors
        SET user_id = $1
      WHERE lower(email) = $2
        AND user_id IS NULL`,
    [userId, normalized]
  );

  if (isAdminEmail(normalized)) return "admin";

  const linked = await client.query(
    "SELECT 1 FROM counsellors WHERE user_id = $1",
    [userId]
  );
  return linked.rowCount ? "counsellor" : "student";
}

/**
 * Current authority for an already-authenticated user, read fresh rather than trusted from the
 * JWT claim, so promotion and demotion take effect without waiting for the session to expire.
 */
export async function currentAuthority(userId: string): Promise<Role | null> {
  const result = await pool.query<{ email: string; role: Role; counsellor_id: string | null }>(
    `SELECT u.email, u.role, c.id AS counsellor_id
       FROM users u
       LEFT JOIN counsellors c ON c.user_id = u.id
      WHERE u.id = $1`,
    [userId]
  );
  if (!result.rowCount) return null;

  const { email, role, counsellor_id } = result.rows[0];

  // The allowlist overrides the stored row in both directions.
  if (isAdminEmail(email)) return "admin";

  // Stored 'admin' without a matching allowlist entry is stale and carries no authority.
  if (role === "admin") return counsellor_id ? "counsellor" : "student";

  return role;
}
