import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { formatDate, formatTime } from "../lib/format";
import type { ConfirmResult } from "../types";

type State = "working" | "done" | "expired" | "already" | "invalid";

export default function Confirm() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>("working");
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (!token) {
      setState("invalid");
      return;
    }

    api
      .confirmWithToken(token)
      .then((data) => {
        setResult(data);
        setState("done");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === "expired_token") return setState("expired");
        if (err instanceof ApiError && err.code === "already_confirmed") return setState("already");
        setState("invalid");
      });
  }, [token]);

  if (state === "working") return <div className="loading">Confirming your appointment...</div>;

  if (state === "done" && result) {
    return (
      <div className="card confirm-panel">
        <div className="big-check" aria-hidden="true">
          &#10003;
        </div>
        <h1>Appointment confirmed</h1>
        <p>
          Your counselling appointment has been confirmed. We have emailed you the details and a
          calendar invite, and we will remind you 24 hours and 1 hour before.
        </p>
        <div className="confirm-details">
          <p>
            <strong>{result.counsellorName}</strong>
          </p>
          <p>{formatDate(result.startsAt)}</p>
          <p>
            {formatTime(result.startsAt)} - {formatTime(result.endsAt)}
          </p>
        </div>
        <Link className="button primary" to="/appointments">
          View my appointments
        </Link>
      </div>
    );
  }

  if (state === "expired") {
    return (
      <div className="card confirm-panel">
        <div className="big-check failed" aria-hidden="true">
          !
        </div>
        <h1>Confirmation link expired</h1>
        <p>
          This appointment was not confirmed in time, and the slot has been released back to
          other students.
        </p>
        <Link className="button primary" to="/">
          Book another appointment
        </Link>
      </div>
    );
  }

  if (state === "already") {
    return (
      <div className="card confirm-panel">
        <div className="big-check" aria-hidden="true">
          &#10003;
        </div>
        <h1>Already confirmed</h1>
        <p>This appointment has already been confirmed.</p>
        <Link className="button primary" to="/appointments">
          View my appointments
        </Link>
      </div>
    );
  }

  return (
    <div className="card confirm-panel">
      <div className="big-check failed" aria-hidden="true">
        !
      </div>
      <h1>Could not confirm</h1>
      <p>This confirmation link is invalid or no longer available.</p>
      <Link className="button primary" to="/appointments">
        View my appointments
      </Link>
    </div>
  );
}
