import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { ConfirmDialog } from "../components/Modal";
import { EmptyState, SkeletonList, StatusBadge } from "../components/Feedback";
import { useToast } from "../components/Toast";
import { formatDate, formatTime } from "../lib/format";
import type { AdminAppointment, AppointmentScope, AdminCounsellor, Appointment } from "../types";

type StatusFilter = "" | Appointment["status"];

const SCOPES: { value: AppointmentScope; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "all", label: "All" },
];

export default function AdminAppointments() {
  const toast = useToast();
  const [appointments, setAppointments] = useState<AdminAppointment[] | null>(null);
  const [counsellors, setCounsellors] = useState<AdminCounsellor[]>([]);
  const [scope, setScope] = useState<AppointmentScope>("upcoming");
  const [status, setStatus] = useState<StatusFilter>("");
  const [counsellorId, setCounsellorId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState<AdminAppointment | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.admin
      .counsellors()
      .then((data) => setCounsellors(data.counsellors))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.admin.appointments({
        scope,
        status: status || undefined,
        counsellorId: counsellorId || undefined,
      });
      setAppointments(data.appointments);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load appointments.");
    }
  }, [scope, status, counsellorId]);

  useEffect(() => {
    setAppointments(null);
    void load();
  }, [load]);

  async function confirmCancel() {
    if (!pendingCancel) return;
    setBusy(true);
    try {
      await api.admin.cancelAppointment(pendingCancel.id);
      toast.success("Appointment cancelled. The student and counsellor have been emailed.");
      setPendingCancel(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Appointments</h1>
        <p className="muted">
          Every booking across all counsellors. Notes students write for their counsellor are not shown here.
        </p>
      </div>

      <div className="filter-bar">
        <div className="segmented" role="tablist" aria-label="Time range">
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

        <div className="field inline-field">
          <label htmlFor="filter-counsellor">Counsellor</label>
          <select id="filter-counsellor" value={counsellorId} onChange={(event) => setCounsellorId(event.target.value)}>
            <option value="">All counsellors</option>
            {counsellors.map((counsellor) => (
              <option key={counsellor.id} value={counsellor.id}>
                {counsellor.fullName}
              </option>
            ))}
          </select>
        </div>

        <div className="field inline-field">
          <label htmlFor="filter-status">Status</label>
          <select id="filter-status" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            <option value="">Any status</option>
            <option value="pending">Awaiting confirmation</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {appointments === null ? (
        <SkeletonList count={3} />
      ) : appointments.length === 0 ? (
        <EmptyState title="No appointments match" body="Try a different time range or filter." />
      ) : (
        <div className="appointment-list">
          {appointments.map((appointment) => {
            const active = ["pending", "confirmed"].includes(appointment.status);
            return (
              <article key={appointment.id} className="card appointment">
                <div className="appointment-main">
                  <StatusBadge status={appointment.status} />
                  <h2>{formatDate(appointment.starts_at)}</h2>
                  <p className="time">
                    {formatTime(appointment.starts_at)} - {formatTime(appointment.ends_at)}
                  </p>
                  <p className="muted">
                    {appointment.student_name} ({appointment.student_email})
                  </p>
                  <p className="muted small">
                    with {appointment.counsellor_name}
                    {appointment.room ? ` · ${appointment.room}` : ""}
                  </p>
                </div>

                {active && (
                  <div className="appointment-actions">
                    <button className="button ghost small" onClick={() => setPendingCancel(appointment)}>
                      Cancel
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={pendingCancel !== null}
        title="Cancel this appointment?"
        destructive
        busy={busy}
        confirmLabel="Cancel appointment"
        body={
          <p>
            {pendingCancel?.student_name}&rsquo;s session with {pendingCancel?.counsellor_name} on{" "}
            {pendingCancel && formatDate(pendingCancel.starts_at)} at{" "}
            {pendingCancel && formatTime(pendingCancel.starts_at)} will be cancelled and the slot freed. Both
            of them are told by email.
          </p>
        }
        onConfirm={() => void confirmCancel()}
        onCancel={() => setPendingCancel(null)}
      />
    </>
  );
}
