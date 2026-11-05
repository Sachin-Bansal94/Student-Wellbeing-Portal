import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { VerifyEmail } from "../assets/illustrations";
import { AuthAside } from "../components/AuthAside";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { StatusPanel } from "../components/StatusPanel";
import { ApiError } from "../api";

export default function Register() {
  const { config, register } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState<{ email: string; emailSent: boolean } | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await register(email.trim(), password, confirmPassword);
      setRegistered({ email: result.email, emailSent: result.emailSent });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create your account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (registered) {
    return (
      <StatusPanel illustration={<VerifyEmail />} title="Check your email">
        <p>
          {registered.emailSent
            ? `We've sent a link to ${registered.email}.`
            : "We could not send the email just now. Use Forgot password on the login page to get a new link."}
        </p>
        <p className="muted">
          Open the link in that email to activate your account. If you already sign in with Google, the
          same link lets you choose a password for it.
        </p>
        <div className="row">
          <Link className="button primary" to="/login">
            Go to login
          </Link>
        </div>
      </StatusPanel>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-copy">
        <h1>Create your account</h1>
        <p>
          Use your IIT (ISM) email address{config?.allowedDomain ? ` (@${config.allowedDomain})` : ""} to
          register. You&rsquo;ll need to verify it before you can log in.
        </p>
      </div>

      <AuthAside />

      <div className="card auth-card">
        <h2>Register with your institute email</h2>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="field">
            <label htmlFor="reg-email">IIT ISM email</label>
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              placeholder={`you@${config?.allowedDomain ?? "iitism.ac.in"}`}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <span className="field-hint">
              Use your IIT ISM email address (@{config?.allowedDomain ?? "iitism.ac.in"})
            </span>
          </div>

          <div className="field">
            <label htmlFor="reg-password">Password</label>
            <div className="password-field">
              <input
                id="reg-password"
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
            <label htmlFor="reg-confirm">Confirm password</label>
            <input
              id="reg-confirm"
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

          <button
            className="button primary block"
            type="submit"
            disabled={submitting || (confirmPassword.length > 0 && confirmPassword !== password)}
          >
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}

        <div className="auth-divider">or</div>

        {config?.googleClientId ? (
          <GoogleSignInButton onError={setError} />
        ) : (
          <p className="alert error">Google sign-in is not configured on this server yet.</p>
        )}

        <p className="auth-switch">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </div>
  );
}
