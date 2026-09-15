import { pool } from "../db/pool";

const POLL_INTERVAL_MS = 60_000;

export async function sweep(): Promise<void> {
  const expired = await pool.query(
    `UPDATE appointments
        SET status = 'expired'
      WHERE status = 'pending'
        AND confirmation_expires_at IS NOT NULL
        AND confirmation_expires_at < now()`
  );

  const completed = await pool.query(
    `UPDATE appointments
        SET status = 'completed'
      WHERE status = 'confirmed'
        AND ends_at < now()`
  );

  if (expired.rowCount || completed.rowCount) {
    console.log(`sweeper: ${expired.rowCount} expired, ${completed.rowCount} completed`);
  }
}

export function startAppointmentSweeper(): NodeJS.Timeout {
  const run = () => {
    sweep().catch((err) => console.error("sweeper error", err));
  };
  run();
  return setInterval(run, POLL_INTERVAL_MS);
}
