import { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE, SessionPayload, verifySession } from "../lib/tokens";
import { unauthorized } from "../lib/errors";

declare global {
  namespace Express {
    interface Request {
      session?: SessionPayload;
    }
  }
}

export function attachSession(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    const payload = verifySession(token);
    if (payload) req.session = payload;
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.session) return next(unauthorized());
  next();
}
