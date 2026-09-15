import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { attachSession } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth.routes";
import counsellorRoutes from "./routes/counsellors.routes";
import appointmentRoutes from "./routes/appointments.routes";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());
  app.use(attachSession);

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRoutes);
  app.use("/api/counsellors", counsellorRoutes);
  app.use("/api/appointments", appointmentRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
