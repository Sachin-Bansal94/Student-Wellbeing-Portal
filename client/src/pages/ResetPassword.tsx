import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LinkExpired, Privacy, VerifyEmail } from "../assets/illustrations";
import { StatusPanel } from "../components/StatusPanel";
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
      <StatusPanel illustration={<LinkExpired />} title="Invalid link">
        <p>This password reset link is invalid.</p>
        <div className="row">
          <Link className="button primary" to="/forgot-password">
            Request a new link
          </Link>
        </div>
      </StatusPanel>
    );
  }

  if (done) {
    return (
      <StatusPanel illustration={<VerifyEmail done />} title="Password reset successfully">
        <p>You can now log in with your new password.</p>
        <div className="row">
          <Link className="button primary" to="/login">
            Login
          </Link>
        </div>
      </StatusPanel>
    );
  }

  if (tokenDead) {
    return (
      <StatusPanel illustration={<LinkExpired />} title="This link no longer works">
        <p>{error}</p>
        <div className="row">
          <Link className="button primary" to="/forgot-password">
            Request a new link
          </Link>
        </div>
      </StatusPanel>
    );
  }

  return (
    <StatusPanel illustration={<Privacy />} title="Set a new password">
      <p className="muted">Choose a new password for your Student Wellbeing account.</p>

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
            aria-invalid={confirmPassword.length > 0 && confirmPassword !== password}
            required
          />
          {confirmPassword && confirmPassword !== password && (
            <span className="field-hint error-hint">Passwords do not match.</span>
          )}
        </div>

        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}

        <button
          className="button primary block"
          type="submit"
          disabled={submitting || (confirmPassword.length > 0 && confirmPassword !== password)}
        >
          {submitting ? "Resetting..." : "Reset password"}
        </button>
      </form>
    </StatusPanel>
  );
}
