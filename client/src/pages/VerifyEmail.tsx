import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";

type State = "working" | "done" | "expired" | "already" | "invalid";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>("working");
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (!token) {
      setState("invalid");
      return;
    }

    api
      .verifyEmail(token)
      .then(() => setState("done"))
      .catch((err) => {
        if (err instanceof ApiError && err.code === "expired_token") return setState("expired");
        if (err instanceof ApiError && err.code === "already_verified") return setState("already");
        setState("invalid");
      });
  }, [token]);

  if (state === "working") return <div className="loading">Verifying your email...</div>;

  if (state === "done") {
    return (
      <div className="card confirm-panel">
        <div className="big-check" aria-hidden="true">
          &#10003;
        </div>
        <h1>Email verified</h1>
        <p>Your IIT (ISM) email has been verified. You can now log in.</p>
        <Link className="button primary" to="/login">
          Login
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
        <h1>Verification link expired</h1>
        <p>Request a new one from the login page and try again.</p>
        <Link className="button primary" to="/login">
          Back to login
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
        <h1>Already verified</h1>
        <p>Your email is already verified. You can log in.</p>
        <Link className="button primary" to="/login">
          Login
        </Link>
      </div>
    );
  }

  return (
    <div className="card confirm-panel">
      <div className="big-check failed" aria-hidden="true">
        !
      </div>
      <h1>Invalid link</h1>
      <p>This verification link is invalid.</p>
      <Link className="button primary" to="/login">
        Back to login
      </Link>
    </div>
  );
}
