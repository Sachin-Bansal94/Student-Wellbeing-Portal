import type {
  AdminAppointment,
  AdminCounsellor,
  AdminStats,
  Appointment,
  AppointmentScope,
  AvailabilityException,
  AvailabilityRule,
  BookResult,
  ConfirmResult,
  Counsellor,
  CounsellorInput,
  CounsellorSelf,
  DayAvailability,
  Profile,
  ProfilePatch,
  PublicConfig,
  RegisterResult,
  ResendResult,
  User,
} from "./types";

export type ExceptionInput = {
  date: string;
  kind: "blocked" | "extra";
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
};

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

  myAppointments: (scope: AppointmentScope = "all") =>
    request<{ appointments: Appointment[] }>(`/appointments/mine?scope=${scope}`),

  profile: () => request<{ profile: Profile }>("/me/profile"),

  updateProfile: (patch: ProfilePatch) =>
    request<{ profile: Profile }>("/me/profile", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  counsellorSelf: {
    me: () => request<{ counsellor: CounsellorSelf }>("/me/counsellor"),

    rules: () => request<{ rules: AvailabilityRule[] }>("/me/counsellor/availability-rules"),

    addRule: (weekday: number, startTime: string, endTime: string) =>
      request<{ rule: AvailabilityRule }>("/me/counsellor/availability-rules", {
        method: "POST",
        body: JSON.stringify({ weekday, startTime, endTime }),
      }),

    removeRule: (ruleId: string) =>
      request<{ ok: boolean }>(`/me/counsellor/availability-rules/${ruleId}`, { method: "DELETE" }),

    exceptions: () => request<{ exceptions: AvailabilityException[] }>("/me/counsellor/exceptions"),

    addException: (input: ExceptionInput) =>
      request<{ exception: AvailabilityException }>("/me/counsellor/exceptions", {
        method: "POST",
        body: JSON.stringify(input),
      }),

    removeException: (exceptionId: string) =>
      request<{ ok: boolean }>(`/me/counsellor/exceptions/${exceptionId}`, { method: "DELETE" }),
  },

  admin: {
    stats: () => request<{ stats: AdminStats }>("/admin/stats"),

    appointments: (filter: { scope: AppointmentScope; status?: Appointment["status"]; counsellorId?: string }) => {
      const params = new URLSearchParams({ scope: filter.scope });
      if (filter.status) params.set("status", filter.status);
      if (filter.counsellorId) params.set("counsellorId", filter.counsellorId);
      return request<{ appointments: AdminAppointment[] }>(`/admin/appointments?${params}`);
    },

    cancelAppointment: (id: string) =>
      request<{ appointmentId: string }>(`/admin/appointments/${id}/cancel`, { method: "POST" }),

    counsellors: () => request<{ counsellors: AdminCounsellor[] }>("/admin/counsellors"),

    createCounsellor: (input: CounsellorInput) =>
      request<{ counsellor: AdminCounsellor; linkedExistingUser: boolean }>("/admin/counsellors", {
        method: "POST",
        body: JSON.stringify(input),
      }),

    updateCounsellor: (id: string, patch: Partial<CounsellorInput> & { isActive?: boolean }) =>
      request<{ counsellor: AdminCounsellor }>(`/admin/counsellors/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),

    rules: (id: string) =>
      request<{ rules: AvailabilityRule[] }>(`/admin/counsellors/${id}/availability-rules`),

    addRule: (id: string, weekday: number, startTime: string, endTime: string) =>
      request<{ rule: AvailabilityRule }>(`/admin/counsellors/${id}/availability-rules`, {
        method: "POST",
        body: JSON.stringify({ weekday, startTime, endTime }),
      }),

    removeRule: (id: string, ruleId: string) =>
      request<{ ok: boolean }>(`/admin/counsellors/${id}/availability-rules/${ruleId}`, {
        method: "DELETE",
      }),

    exceptions: (id: string) =>
      request<{ exceptions: AvailabilityException[] }>(`/admin/counsellors/${id}/exceptions`),

    addException: (id: string, input: ExceptionInput) =>
      request<{ exception: AvailabilityException }>(`/admin/counsellors/${id}/exceptions`, {
        method: "POST",
        body: JSON.stringify(input),
      }),

    removeException: (id: string, exceptionId: string) =>
      request<{ ok: boolean }>(`/admin/counsellors/${id}/exceptions/${exceptionId}`, {
        method: "DELETE",
      }),
  },
};
