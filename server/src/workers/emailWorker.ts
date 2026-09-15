import { withTransaction } from "../db/pool";
import { loadEmailContext } from "../services/booking";
import { sendReminder } from "../services/email";

const POLL_INTERVAL_MS = 60_000;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 5;

async function processDueEmails(): Promise<void> {
  await withTransaction(async (client) => {
    const due = await client.query<{
      id: string;
      appointment_id: string;
      kind: string;
      attempts: number;
    }>(
      `SELECT se.id, se.appointment_id, se.kind, se.attempts
         FROM scheduled_emails se
         JOIN appointments a ON a.id = se.appointment_id
        WHERE se.status = 'pending'
          AND se.send_after <= now()
          AND a.status = 'confirmed'
        ORDER BY se.send_after
        LIMIT ${BATCH_SIZE}
        FOR UPDATE OF se SKIP LOCKED`
    );

    for (const row of due.rows) {
      try {
        const ctx = await loadEmailContext(row.appointment_id);
        await sendReminder(ctx, row.kind as "reminder_24h" | "reminder_1h");
        await client.query(
          `UPDATE scheduled_emails SET status = 'sent', sent_at = now(), attempts = attempts + 1
            WHERE id = $1`,
          [row.id]
        );
      } catch (err) {
        const attempts = row.attempts + 1;
        await client.query(
          `UPDATE scheduled_emails
              SET attempts = $2,
                  last_error = $3,
                  status = CASE WHEN $2 >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'pending' END
            WHERE id = $1`,
          [row.id, attempts, String(err).slice(0, 500)]
        );
        console.error(`reminder ${row.kind} failed for ${row.appointment_id}`, err);
      }
    }
  });
}

export function startEmailWorker(): NodeJS.Timeout {
  const run = () => {
    processDueEmails().catch((err) => console.error("email worker error", err));
  };
  run();
  return setInterval(run, POLL_INTERVAL_MS);
}
