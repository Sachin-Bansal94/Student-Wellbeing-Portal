import type {
  Appointment,
  BookResult,
  ConfirmResult,
  Counsellor,
  DayAvailability,
  PublicConfig,
  RegisterResult,
  ResendResult,
  User,
} from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error?.code ?? "unknown",
      body?.error?.message ?? "Something went wrong"
    );
  }

  return body as T;
}

export const api = {
  config: () => request<PublicConfig>("/auth/config"),

  me: () => request<{ user: User }>("/auth/me"),

  loginWithGoogle: (credential: string) =>
    request<{ user: User }>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    }),

  devLogin: (email: string) =>
    request<{ user: User }>("/auth/dev-login", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  register: (email: string, password: string, confirmPassword: string) =>
    request<RegisterResult>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, confirmPassword }),
    }),

  loginWithPassword: (email: string, password: string) =>
    request<{ user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  verifyEmail: (token: string) =>
    request<{ email: string; verified: true }>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  resendVerification: (email: string) =>
    request<{ ok: boolean }>("/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  forgotPassword: (email: string) =>
    request<{ ok: boolean }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string, confirmPassword: string) =>
    request<{ ok: boolean }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password, confirmPassword }),
    }),

  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  counsellors: () => request<{ counsellors: Counsellor[] }>("/counsellors"),

  availability: (counsellorId: string, from: string, days = 7) =>
    request<{ counsellor: Counsellor; days: DayAvailability[] }>(
      `/counsellors/${counsellorId}/availability?from=${from}&days=${days}`
    ),

  book: (counsellorId: string, startsAt: string, note: string | null) =>
    request<BookResult>("/appointments", {
      method: "POST",
      body: JSON.stringify({ counsellorId, startsAt, note }),
    }),

  confirmWithToken: (token: string) =>
    request<ConfirmResult>("/appointments/confirm", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  resendConfirmation: (appointmentId: string) =>
    request<ResendResult>(`/appointments/${appointmentId}/resend`, {
      method: "POST",
    }),

  cancel: (appointmentId: string) =>
    request<{ appointmentId: string }>(`/appointments/${appointmentId}/cancel`, {
      method: "POST",
    }),

  myAppointments: () => request<{ appointments: Appointment[] }>("/appointments/mine"),
};
