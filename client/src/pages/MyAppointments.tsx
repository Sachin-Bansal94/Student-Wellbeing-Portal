import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../AuthContext";
import { useToast } from "../components/Toast";
import { ConfirmDialog } from "../components/Modal";
import { EmptyState, SkeletonList, StatusBadge } from "../components/Feedback";
import { formatDate, formatTime } from "../lib/format";
import type { Appointment, AppointmentScope } from "../types";

const SCOPES: { value: AppointmentScope; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "all", label: "All" },
];

export default function MyAppointments() {
  const { user, config } = useAuth();
  const toast = useToast();
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [scope, setScope] = useState<AppointmentScope>("upcoming");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState<Appointment | null>(null);

  const isCounsellor = user?.role === "counsellor";

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.myAppointments(scope);
      setAppointments(data.appointments);
    } catch {
      setError("Could not load your appointments.");
    }
  }, [scope]);

  useEffect(() => {
    setAppointments(null);
    void load();
  }, [load]);

  async function confirmCancel() {
    if (!pendingCancel) return;
    setBusyId(pendingCancel.id);
    try {
      await api.cancel(pendingCancel.id);
      toast.success("Appointment cancelled.");
      setPendingCancel(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "That did not work.");
    } finally {
      setBusyId(null);
    }
  }

  async function resend(id: string) {
    setBusyId(id);
    try {
      const result = await api.resendConfirmation(id);
      if (result.emailSent) toast.success("Confirmation email sent again.");
      else toast.error("Could not send the email just now — try again shortly.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not resend the email.");
    } finally {
      setBusyId(null);
    }
  }

  const { upcoming, past } = useMemo(() => {
    const list = appointments ?? [];
    return {
      upcoming: list.filter((a) => ["pending", "confirmed"].includes(a.status)),
      past: list.filter((a) => !["pending", "confirmed"].includes(a.status)),
    };
  }, [appointments]);

  const showGrouped = scope === "all";
  const primary = showGrouped ? upcoming : (appointments ?? []);

  return (
    <>
      <div className="page-head">
        <h1>{isCounsellor ? "Your schedule" : "My appointments"}</h1>
        {!isCounsellor && (
          <p className="muted">
            You can cancel up to {config?.cancellationCutoffHours ?? 4} hours before a session.
          </p>
        )}
      </div>

      <div className="segmented" role="tablist" aria-label="Filter appointments">
        {SCOPES.map((option) => (
          <button
            key={option.value}
            role="tab"
            aria-selected={scope === option.value}
            className={scope === option.value ? "active" : ""}
            onClick={() => setScope(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && <div className="alert error">{error}</div>}

      {appointments === null ? (
        <SkeletonList count={3} />
      ) : (appointments ?? []).length === 0 ? (
        <EmptyState
          title={scope === "past" ? "No past appointments" : "Nothing booked right now"}
          body={
            scope === "past"
              ? "Sessions you have completed or cancelled will appear here."
              : "Pick a counsellor to see when they are free this week."
          }
          action={
            !isCounsellor && scope !== "past" ? (
              <Link className="button primary" to="/">
                Find a counsellor
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="appointment-list">
            {primary.map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                isCounsellor={isCounsellor}
                busy={busyId === appointment.id}
                onResend={() => void resend(appointment.id)}
                onCancel={() => setPendingCancel(appointment)}
              />
            ))}
          </div>

          {showGrouped && past.length > 0 && (
            <>
              <h2 className="section-title">Earlier</h2>
              <div className="appointment-list">
                {past.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    isCounsellor={isCounsellor}
                    muted
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <ConfirmDialog
        open={pendingCancel !== null}
        title="Cancel this appointment?"
        destructive
        busy={busyId === pendingCancel?.id}
        confirmLabel="Cancel appointment"
        body={
          <p>
            Your session with {pendingCancel?.counsellor_name} on{" "}
            {pendingCancel && formatDate(pendingCancel.starts_at)} will be released so another
            student can book it.
          </p>
        }
        onConfirm={() => void confirmCancel()}
        onCancel={() => setPendingCancel(null)}
      />
    </>
  );
}

function AppointmentCard({
  appointment,
  isCounsellor,
  busy,
  muted,
  onResend,
  onCancel,
}: {
  appointment: Appointment;
  isCounsellor: boolean;
  busy?: boolean;
  muted?: boolean;
  onResend?: () => void;
  onCancel?: () => void;
}) {
  const actionable = !muted && ["pending", "confirmed"].includes(appointment.status);

  return (
    <article className={`card appointment${muted ? " muted-card" : ""}`}>
      <div className="appointment-main">
        <StatusBadge status={appointment.status} />
        <h2>{formatDate(appointment.starts_at)}</h2>
        <p className="time">
          {formatTime(appointment.starts_at)} - {formatTime(appointment.ends_at)}
        </p>
        <p className="muted">
          {isCounsellor ? appointment.student_name : appointment.counsellor_name}
          {appointment.room ? ` · ${appointment.room}` : ""}
        </p>
        {appointment.student_note && <p className="note">&ldquo;{appointment.student_note}&rdquo;</p>}
      </div>

      {actionable && (
        <div className="appointment-actions">
          {appointment.status === "pending" && !isCounsellor && onResend && (
            <button className="button primary small" disabled={busy} onClick={onResend}>
              Resend confirmation email
            </button>
          )}
          {onCancel && (
            <button className="button ghost small" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      )}
    </article>
  );
}
