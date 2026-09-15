import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { api, ApiError } from "../api";

export default function Login() {
  const { config, devSignIn, signInWithPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const [devEmail, setDevEmail] = useState("");
  const [devBusy, setDevBusy] = useState(false);

  async function handleLogin() {
    setSubmitting(true);
    setError(null);
    setUnverifiedEmail(null);
    setResendMessage(null);
    try {
      await signInWithPassword(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_not_verified") {
        setUnverifiedEmail(email.trim());
        setError(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : "Login failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!unverifiedEmail) return;
    setResendBusy(true);
    setResendMessage(null);
    try {
      await api.resendVerification(unverifiedEmail);
      setResendMessage("If that account needs verifying, we've sent a new link.");
    } catch {
      setResendMessage("Could not resend the email. Please try again.");
    } finally {
      setResendBusy(false);
    }
  }

  async function handleDevLogin() {
    setDevBusy(true);
    setError(null);
    try {
      await devSignIn(devEmail.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Dev sign-in failed.");
    } finally {
      setDevBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-copy">
        <h1>Talk to someone. It is free, and it stays private.</h1>
        <p>
          Book a 20-minute session with one of the on-campus counsellors at the Health Center.
          No fees, no forms, no one else finds out.
        </p>
        <ul className="login-points">
          <li>See exactly when each counsellor is free this week</li>
          <li>Pick a slot and confirm it from your email</li>
          <li>Get a reminder a day before and an hour before</li>
        </ul>
      </div>

      <div className="card login-card">
        <h2>Sign in to book</h2>
        <p className="muted">
          Use your IIT (ISM) email{config?.allowedDomain ? ` (@${config.allowedDomain})` : ""}.
          This is only used to verify you are a student and to email your appointment details.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleLogin();
          }}
        >
          <div className="field">
            <label htmlFor="login-email">IIT ISM Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder={`you@${config?.allowedDomain ?? "iitism.ac.in"}`}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="login-password">Password</label>
            <div className="password-field">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
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
          </div>

          <button className="button primary" type="submit" disabled={submitting} style={{ width: "100%" }}>
            {submitting ? "Signing in..." : "Login"}
          </button>
        </form>

        {error && <div className="alert error">{error}</div>}

        {unverifiedEmail && (
          <div className="row" style={{ marginTop: -8, marginBottom: 16 }}>
            <button className="button ghost small" onClick={() => void handleResend()} disabled={resendBusy}>
              {resendBusy ? "Sending..." : "Resend verification email"}
            </button>
          </div>
        )}
        {resendMessage && <div className="alert notice">{resendMessage}</div>}

        <div className="auth-links">
          <Link to="/forgot-password">Forgot password?</Link>
        </div>

        <div className="auth-divider">or</div>

        {config?.googleClientId ? (
          <GoogleSignInButton onError={setError} />
        ) : (
          <p className="alert error">Google sign-in is not configured on this server yet.</p>
        )}

        {config?.devLoginEnabled && (
          <div className="dev-login">
            <div className="dev-badge">Local testing only</div>
            <p className="small muted">
              Dev sign-in is on. Any @{config.allowedDomain} address gets a session without a
              password. Turn off <code>ALLOW_DEV_LOGIN</code> before deploying.
            </p>
            <div className="dev-row">
              <input
                type="email"
                placeholder={`you@${config.allowedDomain}`}
                value={devEmail}
                onChange={(event) => setDevEmail(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void handleDevLogin()}
              />
              <button
                className="button ghost small"
                onClick={() => void handleDevLogin()}
                disabled={devBusy || !devEmail.trim()}
              >
                {devBusy ? "..." : "Sign in"}
              </button>
            </div>
          </div>
        )}

        <p className="small muted" style={{ marginTop: 16 }}>
          Don&rsquo;t have an account? <Link to="/register">Create account</Link>
        </p>
      </div>
    </div>
  );
}
