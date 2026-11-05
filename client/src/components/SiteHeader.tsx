import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { site } from "../siteConfig";
import { BrandMark } from "./BrandMark";

export function SiteHeader() {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname, location.hash]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <>
      <div className="top-strip on-maroon">
        <div className="shell top-strip-inner">
          <a href={site.institute.url}>
            <span className="strip-long">{site.institute.name}</span>
            <span className="strip-short">{site.institute.shortName}</span>
          </a>
          <a className="strip-help" href="#helplines">
            Help right now
          </a>
        </div>
      </div>

      <header className="site-header">
        <div className="shell header-inner">
          <NavLink to="/" className="brand">
            <BrandMark />
            <span>
              <strong>{site.productName}</strong>
              <small>{site.institute.shortName}</small>
            </span>
          </NavLink>

          <button
            type="button"
            className="nav-toggle"
            ref={toggleRef}
            aria-expanded={menuOpen}
            aria-controls="primary-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path
                d={menuOpen ? "M4 4 L16 16 M16 4 L4 16" : "M2 5 H18 M2 10 H18 M2 15 H18"}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <nav id="primary-nav" aria-label="Main" className={`header-nav${menuOpen ? " open" : ""}`}>
            {user ? (
              <>
                <NavLink to="/" end>
                  Counsellors
                </NavLink>
                <NavLink to="/appointments">{user.role === "counsellor" ? "My schedule" : "My appointments"}</NavLink>
                {user.role === "counsellor" && <NavLink to="/counsellor">Dashboard</NavLink>}
                {user.role === "admin" && <NavLink to="/admin">Admin</NavLink>}
                <NavLink to="/profile">Profile</NavLink>
                <button type="button" className="link-button" onClick={() => void signOut()}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/#how-it-works">How it works</Link>
                <Link to="/#help">Help</Link>
                <NavLink to="/login">Sign in</NavLink>
                <Link className="button primary small" to="/register">
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
    </>
  );
}
