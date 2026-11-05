import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { CounsellorCard } from "../components/CounsellorCard";
import { SkeletonCard } from "../components/Feedback";
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

  if (error) return <div className="alert error">{error}</div>;

  return (
    <>
      <div className="page-head">
        <h1>Counsellors at the Health Center</h1>
        <p className="muted">
          Pick a counsellor to see their open slots. Sessions are 20 minutes and free.
        </p>
      </div>

      <div className="counsellor-grid">
        {loading
          ? [0, 1, 2].map((key) => <SkeletonCard key={key} lines={3} />)
          : counsellors.map((counsellor) => (
              <CounsellorCard
                key={counsellor.id}
                counsellor={counsellor}
                action={
                  <Link
                    className="button primary"
                    to={`/book/${counsellor.id}`}
                    aria-label={`Book a session with ${counsellor.fullName}`}
                  >
                    Book a session
                  </Link>
                }
              />
            ))}
      </div>
    </>
  );
}
