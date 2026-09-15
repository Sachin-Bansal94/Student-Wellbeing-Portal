import { PoolClient } from "pg";
import { pool, withTransaction } from "../db/pool";
import { env } from "../config/env";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { createConfirmationToken, hashConfirmationToken } from "../lib/tokens";
import { resolveSlot } from "./availability";
import {
  AppointmentEmailContext,
  sendBookingConfirmed,
  sendCancellation,
  sendConfirmationRequest,
  sendCounsellorNotice,
} from "./email";
import { SessionPayload } from "../lib/tokens";

const UNIQUE_VIOLATION = "23505";

export type AppointmentRow = {
  id: string;
  counsellor_id: string;
  student_id: string;
  starts_at: Date;
  ends_at: Date;
  status: string;
  student_note: string | null;
  confirmation_expires_at: Date | null;
  counsellor_name: string;
  counsellor_title: string | null;
  venue: string | null;
  room: string | null;
  student_name?: string;
};

export async function loadEmailContext(appointmentId: string): Promise<AppointmentEmailContext> {
  const result = await pool.query(
    `SELECT a.id, a.starts_at, a.ends_at,
            u.full_name AS student_name, u.email AS student_email,
            c.full_name AS counsellor_name, c.email AS counsellor_email,
            c.venue, c.room
       FROM appointments a
       JOIN users u ON u.id = a.student_id
       JOIN counsellors c ON c.id = a.counsellor_id
      WHERE a.id = $1`,
    [appointmentId]
  );
  if (!result.rowCount) throw notFound("Appointment not found");
  const row = result.rows[0];
  return {
    appointmentId: row.id,
    studentName: row.student_name,
    studentEmail: row.student_email,
    counsellorName: row.counsellor_name,
    counsellorEmail: row.counsellor_email,
    venue: row.venue,
    room: row.room,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
  };
}

async function scheduleReminders(client: PoolClient, appointmentId: string, startsAt: Date): Promise<void> {
  const plans: Array<{ kind: string; sendAfter: Date }> = [
    { kind: "reminder_24h", sendAfter: new Date(startsAt.getTime() - 24 * 60 * 60_000) },
    { kind: "reminder_1h", sendAfter: new Date(startsAt.getTime() - 60 * 60_000) },
  ];

  for (const plan of plans) {
    if (plan.sendAfter.getTime() <= Date.now()) continue;
    await client.query(
      `INSERT INTO scheduled_emails (appointment_id, kind, send_after)
       VALUES ($1, $2, $3)
       ON CONFLICT ON CONSTRAINT scheduled_emails_unique
       DO UPDATE SET send_after = EXCLUDED.send_after, status = 'pending', attempts = 0`,
      [appointmentId, plan.kind, plan.sendAfter]
    );
  }
}

export async function createBooking(
  session: SessionPayload,
  counsellorId: string,
  startsAtISO: string,
  note: string | null
): Promise<{ appointmentId: string; expiresAt: Date; emailSent: boolean }> {
  const startsAt = new Date(startsAtISO);
  if (Number.isNaN(startsAt.getTime())) throw badRequest("invalid_time", "Invalid appointment time");

  const { endsAt } = await resolveSlot(counsellorId, startsAt);

  const active = await pool.query(
    `SELECT 1 FROM appointments
      WHERE student_id = $1
        AND status IN ('pending', 'confirmed')
        AND starts_at > now()`,
    [session.userId]
  );
  if (active.rowCount && active.rowCount >= 2) {
    throw conflict("too_many_active", "You already have two upcoming appointments");
  }

  const { token, hash } = createConfirmationToken();
  const expiresAt = new Date(Date.now() + env.PENDING_EXPIRY_MINUTES * 60_000);

  let appointmentId: string;

  try {
    appointmentId = await withTransaction(async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO appointments
           (counsellor_id, student_id, starts_at, ends_at, status, student_note,
            confirmation_token_hash, confirmation_expires_at)
         VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)
         RETURNING id`,
        [counsellorId, session.userId, startsAt, endsAt, note, hash, expiresAt]
      );
      return inserted.rows[0].id;
    });
  } catch (err: any) {
    if (err?.code === UNIQUE_VIOLATION) {
      // Both appointments_slot_unique and appointments_student_slot_unique can be violated by
      // the same insert (a student double-submitting their own request); which one Postgres
      // reports isn't guaranteed, so check what actually happened instead of trusting the
      // constraint name.
      const mine = await pool.query(
        `SELECT 1 FROM appointments
          WHERE student_id = $1 AND starts_at = $2
            AND status IN ('pending', 'confirmed')`,
        [session.userId, startsAt]
      );
      if (mine.rowCount) {
        throw conflict("already_booked", "You already have a booking at this time");
      }
      throw conflict("slot_taken", "Someone just took this slot. Pick another one.");
    }
    throw err;
  }

  const ctx = await loadEmailContext(appointmentId);
  const emailSent = await trySendConfirmationRequest(ctx, token);

  return { appointmentId, expiresAt, emailSent };
}

async function trySendConfirmationRequest(
  ctx: AppointmentEmailContext,
  token: string
): Promise<boolean> {
  try {
    await sendConfirmationRequest(ctx, token);
    return true;
  } catch (err) {
    console.error(`failed to send confirmation email for appointment ${ctx.appointmentId}`, err);
    return false;
  }
}

async function markConfirmed(appointmentId: string): Promise<AppointmentEmailContext> {
  const ctx = await loadEmailContext(appointmentId);

  // The status transition has already committed by the time this runs — a failure sending
  // either of these follow-up emails must never surface as a "confirmation failed" error for an
  // appointment that is, in fact, confirmed.
  try {
    await sendBookingConfirmed(ctx);
  } catch (err) {
    console.error(`failed to send booking-confirmed email for appointment ${appointmentId}`, err);
  }
  try {
    await sendCounsellorNotice(ctx);
  } catch (err) {
    console.error(`failed to send counsellor notice for appointment ${appointmentId}`, err);
  }

  return ctx;
}

export async function confirmByToken(token: string): Promise<{
  appointmentId: string;
  counsellorName: string;
  startsAt: Date;
  endsAt: Date;
}> {
  const hash = hashConfirmationToken(token);

  const appointmentId = await withTransaction(async (client) => {
    const result = await client.query<{ id: string; starts_at: Date }>(
      `UPDATE appointments
          SET status = 'confirmed',
              confirmed_at = now()
        WHERE confirmation_token_hash = $1
          AND status = 'pending'
          AND confirmation_expires_at > now()
        RETURNING id, starts_at`,
      [hash]
    );

    if (!result.rowCount) {
      const known = await client.query<{ status: string }>(
        `SELECT status FROM appointments WHERE confirmation_token_hash = $1`,
        [hash]
      );
      if (!known.rowCount) throw badRequest("invalid_token", "This confirmation link is not valid");

      const status = known.rows[0].status;
      if (status === "confirmed") {
        throw conflict("already_confirmed", "This appointment has already been confirmed");
      }
      if (status === "pending" || status === "expired") {
        throw badRequest("expired_token", "This confirmation link has expired");
      }
      throw badRequest("invalid_token", "This confirmation link is not valid");
    }

    const row = result.rows[0];
    await scheduleReminders(client, row.id, new Date(row.starts_at));
    return row.id;
  });

  const ctx = await markConfirmed(appointmentId);
  return {
    appointmentId,
    counsellorName: ctx.counsellorName,
    startsAt: ctx.startsAt,
    endsAt: ctx.endsAt,
  };
}

export async function resendConfirmation(
  session: SessionPayload,
  appointmentId: string
): Promise<{ expiresAt: Date; emailSent: boolean }> {
  const { token, hash } = createConfirmationToken();
  const expiresAt = new Date(Date.now() + env.PENDING_EXPIRY_MINUTES * 60_000);

  const result = await pool.query<{ id: string }>(
    `UPDATE appointments
        SET confirmation_token_hash = $3,
            confirmation_expires_at = $4
      WHERE id = $1
        AND student_id = $2
        AND status = 'pending'
      RETURNING id`,
    [appointmentId, session.userId, hash, expiresAt]
  );

  if (!result.rowCount) {
    throw badRequest("cannot_resend", "This appointment can no longer be confirmed by email");
  }

  const ctx = await loadEmailContext(appointmentId);
  const emailSent = await trySendConfirmationRequest(ctx, token);

  return { expiresAt, emailSent };
}

export async function cancelAppointment(session: SessionPayload, appointmentId: string): Promise<void> {
  const ctx = await loadEmailContext(appointmentId);

  const cancelledByCounsellor = await withTransaction(async (client) => {
    const existing = await client.query<{
      student_id: string;
      counsellor_id: string;
      starts_at: Date;
      status: string;
    }>(
      `SELECT student_id, counsellor_id, starts_at, status
         FROM appointments
        WHERE id = $1
        FOR UPDATE`,
      [appointmentId]
    );

    if (!existing.rowCount) throw notFound("Appointment not found");
    const row = existing.rows[0];

    let isCounsellor = false;
    if (row.student_id !== session.userId) {
      const owns = await client.query(
        `SELECT 1 FROM counsellors WHERE id = $1 AND user_id = $2`,
        [row.counsellor_id, session.userId]
      );
      if (!owns.rowCount) throw forbidden("This is not your appointment");
      isCounsellor = true;
    }

    if (!["pending", "confirmed"].includes(row.status)) {
      throw badRequest("not_cancellable", "This appointment is not active");
    }

    if (!isCounsellor) {
      const cutoff = new Date(Date.now() + env.CANCELLATION_CUTOFF_HOURS * 60 * 60_000);
      if (new Date(row.starts_at) <= cutoff) {
        throw badRequest(
          "cancellation_window_closed",
          `Appointments can only be cancelled more than ${env.CANCELLATION_CUTOFF_HOURS} hours in advance. Please email the counsellor directly.`
        );
      }
    }

    await client.query(
      `UPDATE appointments
          SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2,
              confirmation_token_hash = NULL, confirmation_expires_at = NULL
        WHERE id = $1`,
      [appointmentId, session.userId]
    );

    await client.query(
      `UPDATE scheduled_emails SET status = 'cancelled'
        WHERE appointment_id = $1 AND status = 'pending'`,
      [appointmentId]
    );

    return isCounsellor;
  });

  // The cancellation already committed above — a failed notification must not make a
  // successfully cancelled appointment look like a failed request.
  try {
    await sendCancellation(ctx, cancelledByCounsellor);
  } catch (err) {
    console.error(`failed to send cancellation email for appointment ${appointmentId}`, err);
  }
}

export async function listMyAppointments(session: SessionPayload): Promise<unknown[]> {
  if (session.role === "counsellor") {
    const result = await pool.query(
      `SELECT a.id, a.starts_at, a.ends_at, a.status, a.student_note,
              u.full_name AS student_name, u.email AS student_email,
              c.full_name AS counsellor_name, c.title AS counsellor_title, c.venue, c.room
         FROM appointments a
         JOIN counsellors c ON c.id = a.counsellor_id
         JOIN users u ON u.id = a.student_id
        WHERE c.user_id = $1
          AND a.status IN ('pending', 'confirmed', 'completed')
          AND a.starts_at > now() - interval '7 days'
        ORDER BY a.starts_at`,
      [session.userId]
    );
    return result.rows;
  }

  const result = await pool.query(
    `SELECT a.id, a.starts_at, a.ends_at, a.status, a.student_note, a.confirmation_expires_at,
            c.full_name AS counsellor_name, c.title AS counsellor_title, c.venue, c.room
       FROM appointments a
       JOIN counsellors c ON c.id = a.counsellor_id
      WHERE a.student_id = $1
        AND a.starts_at > now() - interval '30 days'
      ORDER BY a.starts_at DESC`,
    [session.userId]
  );
  return result.rows;
}
