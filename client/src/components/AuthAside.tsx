import { AuthScene } from "../assets/illustrations";

export function AuthAside() {
  return (
    <div className="auth-aside">
      <AuthScene />
      <ul className="trust-points">
        <li>Sessions are free and take 20 minutes</li>
        <li>Only your counsellor reads the note you write</li>
        <li>Other students never see who booked</li>
      </ul>
    </div>
  );
}
