import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Counsellor } from "../types";

export default function Counsellors() {
  const [counsellors, setCounsellors] = useState<Counsellor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .counsellors()
      .then((data) => setCounsellors(data.counsellors))
      .catch(() => setError("Could not load counsellors. Please refresh."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading counsellors...</div>;
  if (error) return <div className="alert error">{error}</div>;

  return (
    <>
      <div className="page-head">
        <h1>On-campus counsellors</h1>
        <p className="muted">
          Pick a counsellor to see their open slots. Sessions are 20 minutes and free.
        </p>
      </div>

      <div className="counsellor-grid">
        {counsellors.map((counsellor) => (
          <article key={counsellor.id} className="card counsellor-card">
            <div className="avatar" aria-hidden="true">
              {counsellor.fullName
                .replace(/^(Ms\.|Mr\.|Dr\.)\s*/, "")
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            </div>
            <h2>{counsellor.fullName}</h2>
            <p className="role">{counsellor.title}</p>
            <dl className="details">
              <div>
                <dt>Where</dt>
                <dd>{counsellor.venue}</dd>
              </div>
              <div>
                <dt>Room</dt>
                <dd>{counsellor.room}</dd>
              </div>
            </dl>
            <Link className="button primary" to={`/book/${counsellor.id}`}>
              See availability
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
