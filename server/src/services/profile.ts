import { pool } from "../db/pool";
import { badRequest, notFound } from "../lib/errors";
import { Role } from "./roleAssignment";

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: Role;
  department: string | null;
  admission_number: string | null;
  phone: string | null;
  email_verified_at: Date | null;
  created_at: Date;
};

/**
 * Field visibility is defined here, once, so no route can widen it by accident.
 *
 * `appointments.student_note` is deliberately absent from every projection below: it is
 * appointment-scoped and is only ever served alongside the appointment it belongs to.
 */

/** Everything a user may see about themselves. `email` and `role` are view-only. */
export function selfProjection(row: ProfileRow) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    department: row.department,
    admissionNumber: row.admission_number,
    phone: row.phone,
    emailVerified: row.email_verified_at !== null,
    createdAt: row.created_at,
  };
}

/**
 * What an admin may see, limited to what counsellor/user management actually needs.
 * Excludes `phone` — no admin workflow here requires a student's personal contact number.
 */
export function adminProjection(row: ProfileRow) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    department: row.department,
    admissionNumber: row.admission_number,
    emailVerified: row.email_verified_at !== null,
  };
}

export async function getOwnProfile(userId: string) {
  const result = await pool.query<ProfileRow>(
    `SELECT id, email, full_name, avatar_url, role, department, admission_number,
            phone, email_verified_at, created_at
       FROM users WHERE id = $1`,
    [userId]
  );
  if (!result.rowCount) throw notFound("Account not found");
  return selfProjection(result.rows[0]);
}

export type ProfilePatch = {
  fullName?: string;
  department?: string | null;
  admissionNumber?: string | null;
  phone?: string | null;
};

/**
 * Only the fields a user is permitted to change. `email` is the verified account identity that
 * Google linking, email verification and password reset all key on, and `role` is server-derived
 * authority — neither is accepted here, and both are rejected at the route's zod boundary too.
 */
export async function updateOwnProfile(userId: string, patch: ProfilePatch) {
  const fields: string[] = [];
  const values: unknown[] = [userId];

  const set = (column: string, value: unknown) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };

  if (patch.fullName !== undefined) set("full_name", patch.fullName);
  if (patch.department !== undefined) set("department", patch.department);
  if (patch.admissionNumber !== undefined) set("admission_number", patch.admissionNumber);
  if (patch.phone !== undefined) set("phone", patch.phone);

  if (!fields.length) throw badRequest("nothing_to_update", "No changes were provided");

  const result = await pool.query<ProfileRow>(
    `UPDATE users SET ${fields.join(", ")} WHERE id = $1
     RETURNING id, email, full_name, avatar_url, role, department, admission_number,
               phone, email_verified_at, created_at`,
    values
  );
  if (!result.rowCount) throw notFound("Account not found");
  return selfProjection(result.rows[0]);
}
