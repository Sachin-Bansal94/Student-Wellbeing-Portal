import express, { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { env, isProd } from "./config/env";
import { forbidden } from "./lib/errors";
import { attachSession } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import authRoutes from "./routes/auth.routes";
import counsellorRoutes from "./routes/counsellors.routes";
import appointmentRoutes from "./routes/appointments.routes";
import meRoutes from "./routes/me.routes";
import adminRoutes from "./routes/admin.routes";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function originAllowed(origin: string): boolean {
  if (origin === env.CLIENT_ORIGIN) return true;
  // Development cookies are SameSite=Lax, so opening the app on 127.0.0.1 instead of localhost is
  // harmless there. In production only the configured frontend is accepted.
  return !isProd && LOOPBACK_ORIGIN.test(origin);
}

/**
 * Session cookies are SameSite=None in production, so a browser attaches them to requests made
 * by other sites. CORS stops those sites reading responses but not sending the request, which
 * matters for endpoints that take no body (logout, cancel). Browsers always send Origin on
 * cross-site writes, so anything that is not our own frontend is refused outright.
 */
function rejectForeignOrigin(req: Request, _res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (!SAFE_METHODS.has(req.method) && origin && !originAllowed(origin)) {
    return next(forbidden("This request came from an unrecognised site"));
  }
  next();
}

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
  app.use(rejectForeignOrigin);
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());
  app.use(attachSession);

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRoutes);
  app.use("/api/me", meRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/counsellors", counsellorRoutes);
  app.use("/api/appointments", appointmentRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
