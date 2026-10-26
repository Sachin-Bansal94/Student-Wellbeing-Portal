import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { SkeletonCard } from "../components/Feedback";
import type { AdminStats } from "../types";

export default function AdminOverview() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.admin
      .stats()
      .then((data) => setStats(data.stats))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the overview."));
  }, []);

  if (error) return <div className="alert error">{error}</div>;

  if (!stats) {
    return (
      <>
        <div className="page-head">
          <h1>Overview</h1>
        </div>
        <SkeletonCard lines={2} />
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>Overview</h1>
        <p className="muted">A snapshot of bookings across the Health Center. No student details appear here.</p>
      </div>

      <div className="stat-row">
        <div className="card stat">
          <span className="stat-value">{stats.upcomingActive}</span>
          <span className="stat-label">Upcoming sessions</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{stats.last30Days.booked}</span>
          <span className="stat-label">Booked in the last 30 days</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{stats.last30Days.completed}</span>
          <span className="stat-label">Completed in the last 30 days</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{stats.last30Days.cancelled}</span>
          <span className="stat-label">Cancelled in the last 30 days</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{stats.students}</span>
          <span className="stat-label">Registered students</span>
        </div>
      </div>

      <h2 className="section-title">By counsellor</h2>
      <div className="card table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Counsellor</th>
              <th scope="col" className="numeric">
                Upcoming
              </th>
              <th scope="col" className="numeric">
                Last 30 days
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.byCounsellor.map((row) => (
              <tr key={row.counsellorId}>
                <td>
                  {row.fullName}
                  {!row.isActive && <span className="chip cancelled table-chip">Deactivated</span>}
                </td>
                <td className="numeric">{row.upcoming}</td>
                <td className="numeric">{row.last30Days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">All time</h2>
      <div className="stat-row">
        {(["confirmed", "completed", "pending", "cancelled", "expired"] as const).map((status) => (
          <div key={status} className="card stat">
            <span className="stat-value">{stats.totals[status]}</span>
            <span className="stat-label">{status.charAt(0).toUpperCase() + status.slice(1)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
