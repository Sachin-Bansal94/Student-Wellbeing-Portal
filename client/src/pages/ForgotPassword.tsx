import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { VerifyEmail } from "../assets/illustrations";
import { StatusPanel } from "../components/StatusPanel";
import { api, ApiError } from "../api";

export default function ForgotPassword() {
  const { config } = useAuth();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <StatusPanel illustration={<VerifyEmail />} title="Reset your password">
      <p className="muted">
        Enter your IIT (ISM) email and we&rsquo;ll send you a link to reset your password.
      </p>

      {sent ? (
        <div className="alert notice">
          If an account exists for that email, a password reset link has been sent.
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="field">
            <label htmlFor="forgot-email">IIT ISM email</label>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              placeholder={`you@${config?.allowedDomain ?? "iitism.ac.in"}`}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}

          <button className="button primary block" type="submit" disabled={submitting}>
            {submitting ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}

      <p className="auth-switch">
        <Link to="/login">Back to login</Link>
      </p>
    </StatusPanel>
  );
}
