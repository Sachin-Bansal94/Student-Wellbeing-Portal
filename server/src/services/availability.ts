import { pool } from "../db/pool";
import { env } from "../config/env";
import {
  addDaysISO,
  istToUtc,
  istWeekday,
  minutesFromTime,
  timeFromMinutes,
  todayIstISO,
} from "../lib/ist";
import { badRequest, notFound } from "../lib/errors";

export type Counsellor = {
  id: string;
  email: string | null;
  full_name: string;
  title: string | null;
  venue: string | null;
  room: string | null;
  slot_minutes: number;
  is_active: boolean;
};

export type SlotView = {
  startsAt: string;
  endsAt: string;
  available: boolean;
};

export type DayView = {
  date: string;
  weekday: number;
  slots: SlotView[];
};

type Interval = { start: number; end: number };

function subtractInterval(base: Interval[], cut: Interval): Interval[] {
  const result: Interval[] = [];
  for (const interval of base) {
    if (cut.end <= interval.start || cut.start >= interval.end) {
      result.push(interval);
      continue;
    }
    if (cut.start > interval.start) result.push({ start: interval.start, end: cut.start });
    if (cut.end < interval.end) result.push({ start: cut.end, end: interval.end });
  }
  return result;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

export async function listCounsellors(): Promise<Counsellor[]> {
  const result = await pool.query<Counsellor>(
    `SELECT id, email, full_name, title, venue, room, slot_minutes, is_active
       FROM counsellors
      WHERE is_active = TRUE
      ORDER BY display_order, full_name`
  );
  return result.rows;
}

export async function getCounsellor(counsellorId: string): Promise<Counsellor> {
  const result = await pool.query<Counsellor>(
    `SELECT id, email, full_name, title, venue, room, slot_minutes, is_active
       FROM counsellors
      WHERE id = $1`,
    [counsellorId]
  );
  if (!result.rowCount) throw notFound("Counsellor not found");
  return result.rows[0];
}

async function buildDayIntervals(
  counsellorId: string,
  fromDate: string,
  toDate: string
): Promise<Map<string, Interval[]>> {
  const [rules, exceptions] = await Promise.all([
    pool.query<{ weekday: number; start_time: string; end_time: string }>(
      `SELECT weekday, start_time, end_time
         FROM availability_rules
        WHERE counsellor_id = $1 AND is_active = TRUE`,
      [counsellorId]
    ),
    pool.query<{ exception_date: string; kind: string; start_time: string | null; end_time: string | null }>(
      `SELECT to_char(exception_date, 'YYYY-MM-DD') AS exception_date, kind, start_time, end_time
         FROM availability_exceptions
        WHERE counsellor_id = $1
          AND exception_date BETWEEN $2::date AND $3::date`,
      [counsellorId, fromDate, toDate]
    ),
  ]);

  const rulesByWeekday = new Map<number, Interval[]>();
  for (const rule of rules.rows) {
    const list = rulesByWeekday.get(rule.weekday) ?? [];
    list.push({ start: minutesFromTime(rule.start_time), end: minutesFromTime(rule.end_time) });
    rulesByWeekday.set(rule.weekday, list);
  }

  const exceptionsByDate = new Map<string, typeof exceptions.rows>();
  for (const exception of exceptions.rows) {
    const list = exceptionsByDate.get(exception.exception_date) ?? [];
    list.push(exception);
    exceptionsByDate.set(exception.exception_date, list);
  }

  const dayIntervals = new Map<string, Interval[]>();
  let cursor = fromDate;

  while (cursor <= toDate) {
    const weekday = istWeekday(cursor);
    let intervals = [...(rulesByWeekday.get(weekday) ?? [])];
    const dayExceptions = exceptionsByDate.get(cursor) ?? [];

    for (const exception of dayExceptions) {
      if (exception.kind === "extra" && exception.start_time && exception.end_time) {
        intervals.push({
          start: minutesFromTime(exception.start_time),
          end: minutesFromTime(exception.end_time),
        });
      }
    }

    intervals = mergeIntervals(intervals);

    for (const exception of dayExceptions) {
      if (exception.kind !== "blocked") continue;
      if (!exception.start_time || !exception.end_time) {
        intervals = [];
        break;
      }
      intervals = subtractInterval(intervals, {
        start: minutesFromTime(exception.start_time),
        end: minutesFromTime(exception.end_time),
      });
    }

    dayIntervals.set(cursor, intervals);
    cursor = addDaysISO(cursor, 1);
  }

  return dayIntervals;
}

export async function getAvailability(
  counsellorId: string,
  fromDate: string,
  days: number
): Promise<{ counsellor: Counsellor; days: DayView[] }> {
  const counsellor = await getCounsellor(counsellorId);
  const today = todayIstISO();
  const horizonEnd = addDaysISO(today, env.BOOKING_HORIZON_DAYS);

  if (fromDate < today) fromDate = today;
  if (fromDate > horizonEnd) throw badRequest("beyond_horizon", "That week is outside the booking window");

  const requestedEnd = addDaysISO(fromDate, days - 1);
  const toDate = requestedEnd > horizonEnd ? horizonEnd : requestedEnd;

  const dayIntervals = await buildDayIntervals(counsellorId, fromDate, toDate);

  const rangeStart = istToUtc(fromDate, "00:00");
  const rangeEnd = istToUtc(addDaysISO(toDate, 1), "00:00");

  const booked = await pool.query<{ starts_at: Date }>(
    `SELECT starts_at
       FROM appointments
      WHERE counsellor_id = $1
        AND starts_at >= $2 AND starts_at < $3
        AND status IN ('pending', 'confirmed', 'completed')`,
    [counsellorId, rangeStart, rangeEnd]
  );

  const bookedSet = new Set(booked.rows.map((row) => new Date(row.starts_at).toISOString()));
  const earliest = new Date(Date.now() + env.MIN_BOOKING_LEAD_MINUTES * 60_000);

  const result: DayView[] = [];
  let cursor = fromDate;

  while (cursor <= toDate) {
    const intervals = dayIntervals.get(cursor) ?? [];
    const slots: SlotView[] = [];

    for (const interval of intervals) {
      for (
        let minute = interval.start;
        minute + counsellor.slot_minutes <= interval.end;
        minute += counsellor.slot_minutes
      ) {
        const startsAt = istToUtc(cursor, timeFromMinutes(minute));
        const endsAt = new Date(startsAt.getTime() + counsellor.slot_minutes * 60_000);
        const iso = startsAt.toISOString();
        if (startsAt < earliest) continue;
        slots.push({
          startsAt: iso,
          endsAt: endsAt.toISOString(),
          available: !bookedSet.has(iso),
        });
      }
    }

    result.push({ date: cursor, weekday: istWeekday(cursor), slots });
    cursor = addDaysISO(cursor, 1);
  }

  return { counsellor, days: result };
}

export async function resolveSlot(
  counsellorId: string,
  startsAt: Date
): Promise<{ counsellor: Counsellor; endsAt: Date }> {
  const counsellor = await getCounsellor(counsellorId);
  if (!counsellor.is_active) throw badRequest("counsellor_inactive", "This counsellor is not taking bookings");

  const today = todayIstISO();
  const horizonEnd = addDaysISO(today, env.BOOKING_HORIZON_DAYS);
  const dateISO = new Date(startsAt.getTime() + 330 * 60_000).toISOString().slice(0, 10);

  if (dateISO < today || dateISO > horizonEnd) {
    throw badRequest("beyond_horizon", "That date is outside the booking window");
  }

  const earliest = new Date(Date.now() + env.MIN_BOOKING_LEAD_MINUTES * 60_000);
  if (startsAt < earliest) {
    throw badRequest(
      "too_soon",
      `Appointments must be booked at least ${env.MIN_BOOKING_LEAD_MINUTES} minutes in advance`
    );
  }

  const dayIntervals = await buildDayIntervals(counsellorId, dateISO, dateISO);
  const intervals = dayIntervals.get(dateISO) ?? [];

  for (const interval of intervals) {
    for (
      let minute = interval.start;
      minute + counsellor.slot_minutes <= interval.end;
      minute += counsellor.slot_minutes
    ) {
      const candidate = istToUtc(dateISO, timeFromMinutes(minute));
      if (candidate.getTime() === startsAt.getTime()) {
        return {
          counsellor,
          endsAt: new Date(candidate.getTime() + counsellor.slot_minutes * 60_000),
        };
      }
    }
  }

  throw badRequest("invalid_slot", "That time is not one of the counsellor's slots");
}
