import type { ReactNode } from "react";

/** The centred card used by every confirm, verify and reset screen. */
export function StatusPanel({
  illustration,
  title,
  children,
}: {
  illustration: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="card confirm-panel">
      {illustration}
      <h1>{title}</h1>
      {children}
    </div>
  );
}
