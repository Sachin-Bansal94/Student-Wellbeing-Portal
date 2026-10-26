import { pool } from "../db/pool";

export type AdminAppointmentStatus = "pending" | "confirmed" | "cancelled" | "completed" | "expired";

export type AdminAppointmentFilter = {
  status?: AdminAppointmentStatus;
  counsellorId?: string;
  scope: "upcoming" | "past" | "all";
  limit: number;
};

/**
 * Deliberately has no student_note column. Notes are for the counsellor on the appointment and
 * no one else, administrators included.
 */
export async function listAppointmentsForAdmin(filter: AdminAppointmentFilter) {
  const clauses: string[] = [];
  const values: unknown[] = [];

  const add = (clause: string, value: unknown) => {
    values.push(value);
    clauses.push(clause.replace("?", `$${values.length}`));
  };

  if (filter.status) add("a.status = ?", filter.status);
  if (filter.counsellorId) add("a.counsellor_id = ?", filter.counsellorId);
  if (filter.scope === "upcoming") clauses.push("a.starts_at >= now()");
  if (filter.scope === "past") clauses.push("a.starts_at < now()");

  values.push(filter.limit);

  const result = await pool.query(
    `SELECT a.id, a.starts_at, a.ends_at, a.status, a.created_at,
            a.counsellor_id, c.full_name AS counsellor_name, c.room,
            u.full_name AS student_name, u.email AS student_email
       FROM appointments a
       JOIN counsellors c ON c.id = a.counsellor_id
       JOIN users u ON u.id = a.student_id
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY ${filter.scope === "past" ? "a.starts_at DESC" : "a.starts_at ASC"}
      LIMIT $${values.length}`,
    values
  );

  return result.rows;
}

export type AdminStats = {
  totals: Record<AdminAppointmentStatus, number>;
  upcomingActive: number;
  last30Days: { booked: number; completed: number; cancelled: number };
  students: number;
  byCounsellor: Array<{
    counsellorId: string;
    fullName: string;
    isActive: boolean;
    upcoming: number;
    last30Days: number;
  }>;
};

export async function getAdminStats(): Promise<AdminStats> {
  const [totals, upcoming, recent, students, perCounsellor] = await Promise.all([
    pool.query<{ status: AdminAppointmentStatus; n: number }>(
      "SELECT status, count(*)::int AS n FROM appointments GROUP BY status"
    ),
    pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM appointments
        WHERE status IN ('pending', 'confirmed') AND starts_at > now()`
    ),
    pool.query<{ booked: number; completed: number; cancelled: number }>(
      `SELECT count(*) FILTER (WHERE status IN ('confirmed', 'completed'))::int AS booked,
              count(*) FILTER (WHERE status = 'completed')::int AS completed,
              count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
         FROM appointments
        WHERE starts_at >= now() - interval '30 days'`
    ),
    pool.query<{ n: number }>("SELECT count(*)::int AS n FROM users WHERE role = 'student'"),
    pool.query<{
      id: string;
      full_name: string;
      is_active: boolean;
      upcoming: number;
      last_30_days: number;
    }>(
      `SELECT c.id, c.full_name, c.is_active,
              count(a.id) FILTER (
                WHERE a.status IN ('pending', 'confirmed') AND a.starts_at > now()
              )::int AS upcoming,
              count(a.id) FILTER (
                WHERE a.status IN ('confirmed', 'completed') AND a.starts_at >= now() - interval '30 days'
              )::int AS last_30_days
         FROM counsellors c
         LEFT JOIN appointments a ON a.counsellor_id = c.id
        GROUP BY c.id
        ORDER BY c.is_active DESC, c.display_order, c.full_name`
    ),
  ]);

  const byStatus: Record<AdminAppointmentStatus, number> = {
    pending: 0,
    confirmed: 0,
    cancelled: 0,
    completed: 0,
    expired: 0,
  };
  for (const row of totals.rows) byStatus[row.status] = row.n;

  return {
    totals: byStatus,
    upcomingActive: upcoming.rows[0].n,
    last30Days: recent.rows[0],
    students: students.rows[0].n,
    byCounsellor: perCounsellor.rows.map((row) => ({
      counsellorId: row.id,
      fullName: row.full_name,
      isActive: row.is_active,
      upcoming: row.upcoming,
      last30Days: row.last_30_days,
    })),
  };
}
