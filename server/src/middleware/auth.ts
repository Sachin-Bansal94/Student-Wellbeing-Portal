import { NextFunction, Request, RequestHandler, Response } from "express";
import { SESSION_COOKIE, SessionPayload, verifySession } from "../lib/tokens";
import { forbidden, unauthorized } from "../lib/errors";
import { currentAuthority, Role } from "../services/roleAssignment";

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

/**
 * Authorization for privileged routes. The JWT proves identity; authority is read fresh from the
 * database and the ADMIN_EMAILS allowlist on every call, so promotion and demotion take effect
 * immediately instead of waiting for the 7-day session cookie to expire.
 *
 * Deliberately NOT applied to student booking routes, which keep using the JWT claim so the hot
 * path gains no extra query.
 */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.session) return next(unauthorized());

    currentAuthority(req.session.userId)
      .then((role) => {
        if (!role) return next(unauthorized());
        if (!roles.includes(role)) return next(forbidden("You do not have access to this area"));

        // Downstream handlers read the freshly verified role, never the stale claim.
        req.session = { ...req.session!, role };
        next();
      })
      .catch(next);
  };
}
