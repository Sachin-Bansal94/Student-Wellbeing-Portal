import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api";
import { AvailabilityEditor } from "../components/AvailabilityEditor";
import type { AvailabilityApi } from "../components/AvailabilityEditor";
import { EmptyState, SkeletonCard, SkeletonList, StatusBadge } from "../components/Feedback";
import { formatDate, formatTime } from "../lib/format";
import type { Appointment, CounsellorSelf } from "../types";

type Tab = "schedule" | "availability";

export default function CounsellorDashboard() {
  const [counsellor, setCounsellor] = useState<CounsellorSelf | null>(null);
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("schedule");

  useEffect(() => {
    Promise.all([api.counsellorSelf.me(), api.myAppointments("all")])
      .then(([{ counsellor: me }, { appointments: list }]) => {
        setCounsellor(me);
        setAppointments(list);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Could not load your dashboard.")
      )
      .finally(() => setLoading(false));
  }, []);

  const availabilityApi = useMemo<AvailabilityApi>(
    () => ({
      listRules: () => api.counsellorSelf.rules().then((r) => r.rules),
      addRule: (weekday, start, end) => api.counsellorSelf.addRule(weekday, start, end),
      removeRule: (ruleId) => api.counsellorSelf.removeRule(ruleId),
      listExceptions: () => api.counsellorSelf.exceptions().then((r) => r.exceptions),
      addException: (input) => api.counsellorSelf.addException(input),
      removeException: (id) => api.counsellorSelf.removeException(id),
    }),
    []
  );

  const grouped = useMemo(() => {
    const upcoming = (appointments ?? [])
      .filter((a) => new Date(a.starts_at) >= new Date() && ["pending", "confirmed"].includes(a.status))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

    const byDay = new Map<string, Appointment[]>();
    for (const appointment of upcoming) {
      const key = formatDate(appointment.starts_at);
      byDay.set(key, [...(byDay.get(key) ?? []), appointment]);
    }
    return byDay;
  }, [appointments]);

  if (loading) {
    return (
      <>
        <div className="page-head">
          <h1>Counsellor dashboard</h1>
        </div>
        <SkeletonCard lines={2} />
        <SkeletonList count={2} />
      </>
    );
  }

  if (error || !counsellor) return <div className="alert error">{error ?? "Dashboard unavailable."}</div>;

  const confirmedCount = (appointments ?? []).filter((a) => a.status === "confirmed").length;

  return (
    <>
      <div className="page-head">
        <h1>{counsellor.fullName}</h1>
        <p className="muted">
          {counsellor.title}
          {counsellor.room ? ` · ${counsellor.room}` : ""} · {counsellor.slotMinutes}-minute sessions
        </p>
      </div>

      <div className="stat-row">
        <div className="card stat">
          <span className="stat-value">{grouped.size}</span>
          <span className="stat-label">Days with sessions</span>
        </div>
        <div className="card stat">
          <span className="stat-value">
            {Array.from(grouped.values()).reduce((sum, list) => sum + list.length, 0)}
          </span>
          <span className="stat-label">Upcoming sessions</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{confirmedCount}</span>
          <span className="stat-label">Confirmed sessions</span>
        </div>
      </div>

      <div className="segmented tabs" role="tablist" aria-label="Dashboard section">
        <button
          role="tab"
          aria-selected={tab === "schedule"}
          className={tab === "schedule" ? "active" : ""}
          onClick={() => setTab("schedule")}
        >
          Schedule
        </button>
        <button
          role="tab"
          aria-selected={tab === "availability"}
          className={tab === "availability" ? "active" : ""}
          onClick={() => setTab("availability")}
        >
          Availability
        </button>
      </div>

      {tab === "schedule" ? (
        grouped.size === 0 ? (
          <EmptyState
            title="No upcoming sessions"
            body="When students book with you, their sessions appear here grouped by day."
          />
        ) : (
          Array.from(grouped.entries()).map(([day, list]) => (
            <section key={day} className="schedule-day">
              <h2 className="section-title">{day}</h2>
              <div className="appointment-list">
                {list.map((appointment) => (
                  <article key={appointment.id} className="card appointment">
                    <div className="appointment-main">
                      <StatusBadge status={appointment.status} />
                      <h3 className="appointment-time">
                        {formatTime(appointment.starts_at)} – {formatTime(appointment.ends_at)}
                      </h3>
                      <p className="muted">{appointment.student_name ?? "Student"}</p>
                      {appointment.student_email && (
                        <p className="muted small">{appointment.student_email}</p>
                      )}
                      {appointment.student_note && (
                        <p className="note">&ldquo;{appointment.student_note}&rdquo;</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))
        )
      ) : (
        <AvailabilityEditor api={availabilityApi} />
      )}
    </>
  );
}
