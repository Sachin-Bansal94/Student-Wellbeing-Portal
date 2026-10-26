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

export type RegisterResult = { needsVerification: true; email: string; emailSent: boolean };

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

export type Profile = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: Role;
  department: string | null;
  admissionNumber: string | null;
  phone: string | null;
  emailVerified: boolean;
  createdAt: string;
};

export type ProfilePatch = {
  fullName?: string;
  department?: string | null;
  admissionNumber?: string | null;
  phone?: string | null;
};

/** Rules and exceptions come straight from Postgres, so these stay snake_case. */
export type AvailabilityRule = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
};

export type AvailabilityException = {
  id: string;
  exception_date: string;
  kind: "blocked" | "extra";
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
};

export type CounsellorSelf = {
  id: string;
  fullName: string;
  title: string | null;
  venue: string | null;
  room: string | null;
  slotMinutes: number;
  isActive: boolean;
};

export type AdminCounsellor = {
  id: string;
  email: string | null;
  fullName: string;
  title: string | null;
  venue: string | null;
  room: string | null;
  slotMinutes: number;
  isActive: boolean;
  displayOrder: number;
  /** False means the record is waiting to be claimed by a verified sign-in. */
  linkedAccount: boolean;
  upcomingCount: number;
};

export type CounsellorInput = {
  email?: string | null;
  fullName: string;
  title?: string | null;
  venue?: string | null;
  room?: string | null;
  slotMinutes?: number;
  displayOrder?: number;
};

export type AppointmentScope = "upcoming" | "past" | "all";

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

export type AdminAppointment = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: Appointment["status"];
  created_at: string;
  counsellor_id: string;
  counsellor_name: string;
  room: string | null;
  student_name: string;
  student_email: string;
};

export type AdminStats = {
  totals: Record<Appointment["status"], number>;
  upcomingActive: number;
  last30Days: { booked: number; completed: number; cancelled: number };
  students: number;
  byCounsellor: Array<{
    counsellorId: string;
    fullName: string;
    isActive: boolean;
    upcoming: number;
    last30Days: number;
  }>;
};
