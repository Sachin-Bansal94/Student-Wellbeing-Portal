import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BookingConfirmed, LinkExpired } from "../assets/illustrations";
import { StatusPanel } from "../components/StatusPanel";
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
      <StatusPanel illustration={<BookingConfirmed />} title="Appointment confirmed">
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
            {formatTime(result.startsAt)} to {formatTime(result.endsAt)}
          </p>
        </div>
        <div className="row">
          <Link className="button primary" to="/appointments">
            View my appointments
          </Link>
        </div>
      </StatusPanel>
    );
  }

  if (state === "expired") {
    return (
      <StatusPanel illustration={<LinkExpired />} title="Confirmation link expired">
        <p>
          This appointment was not confirmed in time, and the slot has been released back to
          other students.
        </p>
        <div className="row">
          <Link className="button primary" to="/">
            Book another appointment
          </Link>
        </div>
      </StatusPanel>
    );
  }

  if (state === "already") {
    return (
      <StatusPanel illustration={<BookingConfirmed />} title="Already confirmed">
        <p>This appointment has already been confirmed.</p>
        <div className="row">
          <Link className="button primary" to="/appointments">
            View my appointments
          </Link>
        </div>
      </StatusPanel>
    );
  }

  return (
    <StatusPanel illustration={<LinkExpired />} title="Could not confirm">
      <p>This confirmation link is invalid or no longer available.</p>
      <div className="row">
        <Link className="button primary" to="/appointments">
          View my appointments
        </Link>
      </div>
    </StatusPanel>
  );
}
