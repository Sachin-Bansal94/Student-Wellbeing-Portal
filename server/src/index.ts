import { createApp } from "./app";
import { env } from "./config/env";
import { pool } from "./db/pool";
import { startEmailWorker } from "./workers/emailWorker";
import { startAppointmentSweeper } from "./workers/appointmentSweeper";

async function main() {
  await pool.query("SELECT 1");

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`server listening on http://localhost:${env.PORT}`);
  });

  const emailTimer = startEmailWorker();
  const sweeperTimer = startAppointmentSweeper();

  const shutdown = async () => {
    clearInterval(emailTimer);
    clearInterval(sweeperTimer);
    server.close();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("failed to start", err);
  process.exit(1);
});
