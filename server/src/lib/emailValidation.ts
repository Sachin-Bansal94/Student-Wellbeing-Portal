import { env } from "../config/env";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAllowedEmailDomain(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  const domain = email.slice(at + 1);
  return domain === env.ALLOWED_EMAIL_DOMAIN.toLowerCase();
}

export function deriveNameFromEmail(email: string): string {
  return email.split("@")[0].replace(/[._]/g, " ");
}
