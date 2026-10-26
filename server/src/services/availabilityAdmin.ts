import { pool } from "../db/pool";
import { badRequest, conflict, notFound } from "../lib/errors";

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

export type AvailabilityRule = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

export type AvailabilityException = {
  id: string;
  exception_date: string;
  kind: "blocked" | "extra";
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
};

export async function listRules(counsellorId: string): Promise<AvailabilityRule[]> {
  const result = await pool.query<AvailabilityRule>(
    `SELECT id, weekday, start_time, end_time, is_active
       FROM availability_rules
      WHERE counsellor_id = $1
      ORDER BY weekday, start_time`,
    [counsellorId]
  );
  return result.rows;
}

export async function addRule(
  counsellorId: string,
  weekday: number,
  startTime: string,
  endTime: string
): Promise<AvailabilityRule> {
  if (startTime >= endTime) {
    throw badRequest("invalid_range", "The end time must be after the start time");
  }

  // Overlapping blocks on the same weekday would produce duplicate slots once merged, so they
  // are rejected rather than silently collapsed.
  const overlap = await pool.query(
    `SELECT 1 FROM availability_rules
      WHERE counsellor_id = $1 AND weekday = $2 AND is_active = TRUE
        AND start_time < $4::time AND end_time > $3::time`,
    [counsellorId, weekday, startTime, endTime]
  );
  if (overlap.rowCount) {
    throw conflict("overlapping_rule", "This overlaps an existing block on that day");
  }

  try {
    const result = await pool.query<AvailabilityRule>(
      `INSERT INTO availability_rules (counsellor_id, weekday, start_time, end_time)
       VALUES ($1, $2, $3, $4)
       RETURNING id, weekday, start_time, end_time, is_active`,
      [counsellorId, weekday, startTime, endTime]
    );
    return result.rows[0];
  } catch (err: any) {
    if (err?.code === UNIQUE_VIOLATION) {
      throw conflict("duplicate_rule", "That exact block already exists");
    }
    if (err?.code === CHECK_VIOLATION) {
      throw badRequest("invalid_range", "The end time must be after the start time");
    }
    throw err;
  }
}

/** Scoped by counsellor id so one counsellor can never delete another's rule by guessing an id. */
export async function removeRule(counsellorId: string, ruleId: string): Promise<void> {
  const result = await pool.query(
    "DELETE FROM availability_rules WHERE id = $1 AND counsellor_id = $2",
    [ruleId, counsellorId]
  );
  if (!result.rowCount) throw notFound("Availability block not found");
}

export async function listExceptions(
  counsellorId: string,
  fromDate: string
): Promise<AvailabilityException[]> {
  const result = await pool.query<AvailabilityException>(
    `SELECT id, to_char(exception_date, 'YYYY-MM-DD') AS exception_date,
            kind, start_time, end_time, reason
       FROM availability_exceptions
      WHERE counsellor_id = $1 AND exception_date >= $2::date
      ORDER BY exception_date, start_time NULLS FIRST`,
    [counsellorId, fromDate]
  );
  return result.rows;
}

export type ExceptionInput = {
  date: string;
  kind: "blocked" | "extra";
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
};

export async function addException(
  counsellorId: string,
  input: ExceptionInput
): Promise<AvailabilityException> {
  if (input.kind === "extra" && (!input.startTime || !input.endTime)) {
    throw badRequest("times_required", "Extra hours need a start and end time");
  }
  if (input.startTime && input.endTime && input.startTime >= input.endTime) {
    throw badRequest("invalid_range", "The end time must be after the start time");
  }

  try {
    const result = await pool.query<AvailabilityException>(
      `INSERT INTO availability_exceptions
         (counsellor_id, exception_date, kind, start_time, end_time, reason)
       VALUES ($1, $2::date, $3, $4, $5, $6)
       RETURNING id, to_char(exception_date, 'YYYY-MM-DD') AS exception_date,
                 kind, start_time, end_time, reason`,
      [counsellorId, input.date, input.kind, input.startTime, input.endTime, input.reason]
    );
    return result.rows[0];
  } catch (err: any) {
    if (err?.code === CHECK_VIOLATION) {
      throw badRequest("invalid_exception", "Check the dates and times for this entry");
    }
    throw err;
  }
}

/** Scoped by counsellor id, same reasoning as removeRule. */
export async function removeException(counsellorId: string, exceptionId: string): Promise<void> {
  const result = await pool.query(
    "DELETE FROM availability_exceptions WHERE id = $1 AND counsellor_id = $2",
    [exceptionId, counsellorId]
  );
  if (!result.rowCount) throw notFound("Entry not found");
}
