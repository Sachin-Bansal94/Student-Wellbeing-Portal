import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenDead, setTokenDead] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    setTokenDead(false);
    try {
      await api.resetPassword(token, password, confirmPassword);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && (err.code === "expired_token" || err.code === "invalid_token")) {
        setTokenDead(true);
        setError(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not reset your password. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="card confirm-panel">
        <div className="big-check failed" aria-hidden="true">
          !
        </div>
        <h1>Invalid link</h1>
        <p>This password reset link is invalid.</p>
        <Link className="button primary" to="/forgot-password">
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="card confirm-panel">
        <div className="big-check" aria-hidden="true">
          &#10003;
        </div>
        <h1>Password reset successfully</h1>
        <p>You can now log in with your new password.</p>
        <Link className="button primary" to="/login">
          Login
        </Link>
      </div>
    );
  }

  if (tokenDead) {
    return (
      <div className="card confirm-panel">
        <div className="big-check failed" aria-hidden="true">
          !
        </div>
        <h1>This link no longer works</h1>
        <p>{error}</p>
        <Link className="button primary" to="/forgot-password">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="login">
      <div className="login-copy">
        <h1>Set a new password</h1>
        <p>Choose a new password for your Wellbeing Portal account.</p>
      </div>

      <div className="card login-card">
        <h2>Reset password</h2>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="field">
            <label htmlFor="new-password">New password</label>
            <div className="password-field">
              <input
                id="new-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <span className="field-hint">At least 8 characters.</span>
          </div>

          <div className="field">
            <label htmlFor="confirm-password">Confirm password</label>
            <input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
            {confirmPassword && confirmPassword !== password && (
              <span className="field-hint">Passwords do not match.</span>
            )}
          </div>

          {error && <div className="alert error">{error}</div>}

          <button
            className="button primary"
            type="submit"
            disabled={submitting || (confirmPassword.length > 0 && confirmPassword !== password)}
            style={{ width: "100%" }}
          >
            {submitting ? "Resetting..." : "Reset password"}
          </button>
        </form>
      </div>
    </div>
  );
}
