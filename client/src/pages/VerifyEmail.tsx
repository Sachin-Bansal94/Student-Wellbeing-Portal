import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LinkExpired, VerifyEmail as VerifyEmailArt } from "../assets/illustrations";
import { StatusPanel } from "../components/StatusPanel";
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
      <StatusPanel illustration={<VerifyEmailArt done />} title="Email verified">
        <p>Your IIT (ISM) email has been verified. You can now log in.</p>
        <div className="row">
          <Link className="button primary" to="/login">
            Login
          </Link>
        </div>
      </StatusPanel>
    );
  }

  if (state === "expired") {
    return (
      <StatusPanel illustration={<LinkExpired />} title="Verification link expired">
        <p>Request a new one from the login page and try again.</p>
        <div className="row">
          <Link className="button primary" to="/login">
            Back to login
          </Link>
        </div>
      </StatusPanel>
    );
  }

  if (state === "already") {
    return (
      <StatusPanel illustration={<VerifyEmailArt done />} title="Already verified">
        <p>Your email is already verified. You can log in.</p>
        <div className="row">
          <Link className="button primary" to="/login">
            Login
          </Link>
        </div>
      </StatusPanel>
    );
  }

  return (
    <StatusPanel illustration={<LinkExpired />} title="Invalid link">
      <p>This verification link is invalid.</p>
      <div className="row">
        <Link className="button primary" to="/login">
          Back to login
        </Link>
      </div>
    </StatusPanel>
  );
}
