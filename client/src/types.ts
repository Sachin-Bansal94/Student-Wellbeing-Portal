export type Role = "student" | "counsellor" | "admin";

export type User = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: Role;
};

export type PublicConfig = {
  googleClientId: string;
  allowedDomain: string;
  slotMinutes: number;
  cancellationCutoffHours: number;
  bookingHorizonDays: number;
  pendingExpiryMinutes: number;
  devLoginEnabled: boolean;
};

export type RegisterResult =
  | { needsVerification: true; email: string; emailSent: boolean }
  | { needsVerification: false; user: User };

export type Counsellor = {
  id: string;
  fullName: string;
  title: string | null;
  venue: string | null;
  room: string | null;
  slotMinutes: number;
};

export type Slot = {
  startsAt: string;
  endsAt: string;
  available: boolean;
};

export type DayAvailability = {
  date: string;
  weekday: number;
  slots: Slot[];
};

export type BookResult = {
  appointmentId: string;
  expiresAt: string;
  status: "pending";
  emailSent: boolean;
};

export type ConfirmResult = {
  appointmentId: string;
  status: "confirmed";
  counsellorName: string;
  startsAt: string;
  endsAt: string;
};

export type ResendResult = {
  expiresAt: string;
  emailSent: boolean;
};

export type Appointment = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "expired";
  student_note: string | null;
  confirmation_expires_at?: string | null;
  counsellor_name: string;
  counsellor_title: string | null;
  venue: string | null;
  room: string | null;
  student_name?: string;
  student_email?: string;
};
