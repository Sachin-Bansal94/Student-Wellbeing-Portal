import { PoolClient } from "pg";
import { pool, withTransaction } from "../db/pool";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { normalizeEmail } from "../lib/emailValidation";
import { isAdminEmail } from "./roleAssignment";

const UNIQUE_VIOLATION = "23505";

export type CounsellorRecord = {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string;
  title: string | null;
  venue: string | null;
  room: string | null;
  slot_minutes: number;
  is_active: boolean;
  display_order: number;
};

const COUNSELLOR_COLUMNS = `id, user_id, email, full_name, title, venue, room,
                            slot_minutes, is_active, display_order`;

/**
 * The counsellor record belonging to the signed-in user. Counsellor self-service routes call
 * this instead of accepting a counsellor id from the client, so acting on another counsellor's
 * record is impossible by construction rather than by a check that could be forgotten.
 *
 * Requires is_active: a deactivated counsellor keeps read access to their own appointment
 * history (via listMyAppointments) but may not act.
 */
export async function resolveOwnCounsellor(userId: string): Promise<CounsellorRecord> {
  const result = await pool.query<CounsellorRecord>(
    `SELECT ${COUNSELLOR_COLUMNS} FROM counsellors WHERE user_id = $1`,
    [userId]
  );

  if (!result.rowCount) throw forbidden("No counsellor record is linked to this account");
  const counsellor = result.rows[0];
  if (!counsellor.is_active) throw forbidden("This counsellor record is deactivated");

  return counsellor;
}

export type CounsellorListRecord = CounsellorRecord & { upcoming_count: number };

export async function listAllCounsellors(): Promise<CounsellorListRecord[]> {
  const result = await pool.query<CounsellorListRecord>(
    `SELECT c.id, c.user_id, c.email, c.full_name, c.title, c.venue, c.room,
            c.slot_minutes, c.is_active, c.display_order,
            (SELECT count(*)::int FROM appointments a
              WHERE a.counsellor_id = c.id
                AND a.status IN ('pending', 'confirmed')
                AND a.starts_at > now()) AS upcoming_count
       FROM counsellors c
      ORDER BY c.is_active DESC, c.display_order, c.full_name`
  );
  return result.rows;
}

export async function getCounsellorRecord(counsellorId: string): Promise<CounsellorRecord> {
  const result = await pool.query<CounsellorRecord>(
    `SELECT ${COUNSELLOR_COLUMNS} FROM counsellors WHERE id = $1`,
    [counsellorId]
  );
  if (!result.rowCount) throw notFound("Counsellor not found");
  return result.rows[0];
}

export type CounsellorInput = {
  email: string | null;
  fullName: string;
  title: string | null;
  venue: string | null;
  room: string | null;
  slotMinutes: number;
  displayOrder: number;
};

export type CreateCounsellorResult = {
  counsellor: CounsellorRecord;
  /** True when an existing, email-verified account was linked and promoted immediately. */
  linkedExistingUser: boolean;
};

type Client = Pick<PoolClient, "query">;

/**
 * Links a counsellor record to an existing account, but only one that has already proven its
 * email. An unverified account is deliberately left alone, otherwise someone who registered with
 * a counsellor's address could claim the record without ever proving they control it.
 */
async function linkVerifiedAccount(
  client: Client,
  counsellorId: string,
  email: string
): Promise<string | null> {
  const existingUser = await client.query<{ id: string }>(
    `SELECT u.id FROM users u
      WHERE u.email = $1
        AND u.email_verified_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM counsellors c WHERE c.user_id = u.id)`,
    [email]
  );
  if (!existingUser.rowCount) return null;

  const userId = existingUser.rows[0].id;
  await client.query("UPDATE counsellors SET user_id = $1 WHERE id = $2", [userId, counsellorId]);
  await client.query("UPDATE users SET role = $2 WHERE id = $1", [
    userId,
    isAdminEmail(email) ? "admin" : "counsellor",
  ]);
  return userId;
}

async function releaseAccount(client: Client, counsellorId: string, userId: string): Promise<void> {
  await client.query("UPDATE counsellors SET user_id = NULL WHERE id = $1", [counsellorId]);
  const user = await client.query<{ email: string }>("SELECT email FROM users WHERE id = $1", [userId]);
  if (!user.rowCount) return;
  await client.query("UPDATE users SET role = $2 WHERE id = $1", [
    userId,
    isAdminEmail(user.rows[0].email) ? "admin" : "student",
  ]);
}

export async function createCounsellor(input: CounsellorInput): Promise<CreateCounsellorResult> {
  const email = input.email ? normalizeEmail(input.email) : null;

  return withTransaction(async (client) => {
    let inserted;
    try {
      inserted = await client.query<CounsellorRecord>(
        `INSERT INTO counsellors (email, full_name, title, venue, room, slot_minutes, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${COUNSELLOR_COLUMNS}`,
        [
          email,
          input.fullName,
          input.title,
          input.venue,
          input.room,
          input.slotMinutes,
          input.displayOrder,
        ]
      );
    } catch (err: any) {
      if (err?.code === UNIQUE_VIOLATION) {
        throw conflict("counsellor_exists", "A counsellor with this email already exists");
      }
      throw err;
    }

    const counsellor = inserted.rows[0];
    if (!email) return { counsellor, linkedExistingUser: false };

    const userId = await linkVerifiedAccount(client, counsellor.id, email);
    if (!userId) return { counsellor, linkedExistingUser: false };

    return { counsellor: { ...counsellor, user_id: userId }, linkedExistingUser: true };
  });
}

export type CounsellorPatch = Partial<CounsellorInput> & { isActive?: boolean };

export async function updateCounsellor(
  counsellorId: string,
  patch: CounsellorPatch
): Promise<CounsellorRecord> {
  return withTransaction(async (client) => {
    const current = await client.query<CounsellorRecord>(
      `SELECT ${COUNSELLOR_COLUMNS} FROM counsellors WHERE id = $1 FOR UPDATE`,
      [counsellorId]
    );
    if (!current.rowCount) throw notFound("Counsellor not found");
    const before = current.rows[0];

    const fields: string[] = [];
    const values: unknown[] = [counsellorId];

    const set = (column: string, value: unknown) => {
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    };

    const nextEmail =
      patch.email === undefined ? before.email : patch.email ? normalizeEmail(patch.email) : null;
    const emailChanged = nextEmail !== before.email;

    if (emailChanged) set("email", nextEmail);
    if (patch.fullName !== undefined) set("full_name", patch.fullName);
    if (patch.title !== undefined) set("title", patch.title);
    if (patch.venue !== undefined) set("venue", patch.venue);
    if (patch.room !== undefined) set("room", patch.room);
    if (patch.slotMinutes !== undefined) set("slot_minutes", patch.slotMinutes);
    if (patch.displayOrder !== undefined) set("display_order", patch.displayOrder);
    if (patch.isActive !== undefined) set("is_active", patch.isActive);

    if (!fields.length) throw badRequest("nothing_to_update", "No changes were provided");

    let updated: CounsellorRecord;
    try {
      const result = await client.query<CounsellorRecord>(
        `UPDATE counsellors SET ${fields.join(", ")} WHERE id = $1 RETURNING ${COUNSELLOR_COLUMNS}`,
        values
      );
      updated = result.rows[0];
    } catch (err: any) {
      if (err?.code === UNIQUE_VIOLATION) {
        throw conflict("counsellor_exists", "Another counsellor already uses this email");
      }
      throw err;
    }

    if (!emailChanged) return updated;

    // The email is what proves who a counsellor is. Changing it means the account that held the
    // record no longer matches, so it loses the counsellor role immediately, and the record is
    // handed to whichever verified account owns the new address, if one exists yet.
    if (before.user_id) {
      await releaseAccount(client, counsellorId, before.user_id);
      updated = { ...updated, user_id: null };
    }

    if (nextEmail) {
      const userId = await linkVerifiedAccount(client, counsellorId, nextEmail);
      if (userId) updated = { ...updated, user_id: userId };
    }

    return updated;
  });
}
