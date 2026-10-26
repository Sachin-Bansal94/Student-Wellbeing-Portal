import type { ReactNode } from "react";
import type { Appointment } from "../types";

/** Shimmer placeholder shaped like the content it stands in for. */
export function Skeleton({ className = "", width, height }: { className?: string; width?: string; height?: string }) {
  return <span className={`skeleton ${className}`} style={{ width, height }} aria-hidden="true" />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card skeleton-card">
      <Skeleton height="18px" width="45%" />
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} height="12px" width={index === lines - 1 ? "60%" : "85%"} />
      ))}
    </div>
  );
}

export function SkeletonList({ count = 3, lines = 3 }: { count?: number; lines?: number }) {
  return (
    <div className="appointment-list" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} lines={lines} />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card empty-state-panel">
      <h3>{title}</h3>
      {body && <p className="muted">{body}</p>}
      {action}
    </div>
  );
}

const STATUS_LABEL: Record<Appointment["status"], string> = {
  pending: "Awaiting email confirmation",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  expired: "Expired",
};

/** Always carries text — never conveys meaning by colour alone. */
export function StatusBadge({ status }: { status: Appointment["status"] }) {
  return <span className={`chip ${status}`}>{STATUS_LABEL[status]}</span>;
}
