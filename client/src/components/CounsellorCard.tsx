import type { ReactNode } from "react";
import type { Counsellor } from "../types";

function initials(fullName: string): string {
  return fullName
    .replace(/^(Ms\.|Mr\.|Mrs\.|Dr\.)\s*/, "")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

export function Avatar({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  return (
    <div className="avatar" aria-hidden="true">
      {photoUrl ? <img src={photoUrl} alt="" width="56" height="56" /> : initials(name)}
    </div>
  );
}

export function CounsellorCard({
  counsellor,
  heading: Heading = "h2",
  action,
}: {
  counsellor: Counsellor;
  heading?: "h2" | "h3";
  action?: ReactNode;
}) {
  return (
    <article className="card counsellor-card">
      <div className="counsellor-card-head">
        <Avatar name={counsellor.fullName} />
        <div>
          <Heading>{counsellor.fullName}</Heading>
          {counsellor.title && <p className="role">{counsellor.title}</p>}
        </div>
      </div>
      <dl className="details">
        {counsellor.venue && (
          <div>
            <dt>Where</dt>
            <dd>{counsellor.venue}</dd>
          </div>
        )}
        {counsellor.room && (
          <div>
            <dt>Room</dt>
            <dd>{counsellor.room}</dd>
          </div>
        )}
      </dl>
      {action}
    </article>
  );
}
