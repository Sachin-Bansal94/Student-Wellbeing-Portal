import { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors";
import { isProd } from "../config/env";

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: "not_found", message: "Route not found" } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: {
      code: "server_error",
      message: isProd ? "Something went wrong" : String(err),
    },
  });
}
