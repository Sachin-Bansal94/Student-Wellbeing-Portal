import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { ApiError } from "../api";

export function GoogleSignInButton({ onError }: { onError: (message: string) => void }) {
  const { config, signIn } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!config?.googleClientId || !containerRef.current) return;

    let cancelled = false;

    const init = () => {
      if (cancelled || !window.google || !containerRef.current) return;

      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        hosted_domain: config.allowedDomain,
        callback: async (response) => {
          try {
            await signIn(response.credential);
          } catch (err) {
            onError(
              err instanceof ApiError ? err.message : "Sign-in failed. Please try again."
            );
          }
        },
      });

      window.google.accounts.id.renderButton(containerRef.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        width: 280,
      });

      setReady(true);
    };

    if (window.google) {
      init();
    } else {
      const timer = window.setInterval(() => {
        if (window.google) {
          window.clearInterval(timer);
          init();
        }
      }, 200);
      return () => {
        cancelled = true;
        window.clearInterval(timer);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [config, signIn, onError]);

  return (
    <div className="google-button">
      <div ref={containerRef} />
      {!ready && <div className="muted small">Loading Google sign-in...</div>}
    </div>
  );
}
