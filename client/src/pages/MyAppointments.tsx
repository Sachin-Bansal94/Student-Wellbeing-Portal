import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../AuthContext";
import { formatDate, formatTime } from "../lib/format";
import type { Appointment } from "../types";

const STATUS_LABEL: Record<Appointment["status"], string> = {
  pending: "Awaiting email confirmation",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  expired: "Expired",
};

export default function MyAppointments() {
  const { user, config } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.myAppointments();
      setAppointments(data.appointments);
    } catch {
      setError("Could not load your appointments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(id: string) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      await api.cancel(id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not work.");
    } finally {
      setBusyId(null);
    }
  }

  async function resend(id: string) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const result = await api.resendConfirmation(id);
      setNotice(
        result.emailSent
          ? "Confirmation email sent again."
          : "Could not send the email just now — try again shortly."
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not resend the email.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="loading">Loading...</div>;

  const isCounsellor = user?.role === "counsellor";
  const upcoming = appointments.filter((a) => ["pending", "confirmed"].includes(a.status));
  const past = appointments.filter((a) => !["pending", "confirmed"].includes(a.status));

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

      {notice && <div className="alert notice">{notice}</div>}
      {error && <div className="alert error">{error}</div>}

      {upcoming.length === 0 && (
        <div className="card empty-state">
          <p>Nothing booked right now.</p>
          {!isCounsellor && (
            <Link className="button primary" to="/">
              Find a counsellor
            </Link>
          )}
        </div>
      )}

      <div className="appointment-list">
        {upcoming.map((appointment) => (
          <article key={appointment.id} className={`card appointment ${appointment.status}`}>
            <div className="appointment-main">
              <span className={`chip ${appointment.status}`}>{STATUS_LABEL[appointment.status]}</span>
              <h2>{formatDate(appointment.starts_at)}</h2>
              <p className="time">
                {formatTime(appointment.starts_at)} - {formatTime(appointment.ends_at)}
              </p>
              <p className="muted">
                {isCounsellor ? appointment.student_name : appointment.counsellor_name}
                {appointment.room ? ` · ${appointment.room}` : ""}
              </p>
              {appointment.student_note && (
                <p className="note">&ldquo;{appointment.student_note}&rdquo;</p>
              )}
            </div>

            <div className="appointment-actions">
              {appointment.status === "pending" && !isCounsellor && (
                <button
                  className="button primary small"
                  disabled={busyId === appointment.id}
                  onClick={() => void resend(appointment.id)}
                >
                  Resend confirmation email
                </button>
              )}
              <button
                className="button ghost small"
                disabled={busyId === appointment.id}
                onClick={() => void cancel(appointment.id)}
              >
                Cancel
              </button>
            </div>
          </article>
        ))}
      </div>

      {past.length > 0 && (
        <>
          <h2 className="section-title">Earlier</h2>
          <div className="appointment-list">
            {past.map((appointment) => (
              <article key={appointment.id} className="card appointment muted-card">
                <div className="appointment-main">
                  <span className={`chip ${appointment.status}`}>
                    {STATUS_LABEL[appointment.status]}
                  </span>
                  <h2>{formatDate(appointment.starts_at)}</h2>
                  <p className="time">
                    {formatTime(appointment.starts_at)} - {formatTime(appointment.ends_at)}
                  </p>
                  <p className="muted">
                    {isCounsellor ? appointment.student_name : appointment.counsellor_name}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}
