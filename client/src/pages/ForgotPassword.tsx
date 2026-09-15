import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
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
    <div className="login">
      <div className="login-copy">
        <h1>Reset your password</h1>
        <p>Enter your IIT (ISM) email and we&rsquo;ll send you a link to reset your password.</p>
      </div>

      <div className="card login-card">
        <h2>Reset your password</h2>

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
              <label htmlFor="forgot-email">IIT ISM Email</label>
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

            {error && <div className="alert error">{error}</div>}

            <button className="button primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
              {submitting ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <p className="small muted" style={{ marginTop: 16 }}>
          <Link to="/login">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
