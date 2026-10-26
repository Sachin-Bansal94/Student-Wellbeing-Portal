import { RequestParamHandler, Router } from "express";
import { z } from "zod";
import { notFound } from "./errors";

const uuid = z.string().uuid();

const requireUuid: RequestParamHandler = (_req, _res, next, value) => {
  if (!uuid.safeParse(value).success) return next(notFound());
  next();
};

/** A malformed id can never match a row, so it is a 404 rather than a database error. */
export function validateUuidParams(router: Router, ...names: string[]): void {
  for (const name of names) router.param(name, requireUuid);
}
