import { useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { ReactNode } from "react";
import type { Role } from "./types";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Counsellors from "./pages/Counsellors";
import Book from "./pages/Book";
import MyAppointments from "./pages/MyAppointments";
import Confirm from "./pages/Confirm";
import Profile from "./pages/Profile";
import CounsellorDashboard from "./pages/CounsellorDashboard";
import AdminLayout from "./pages/AdminLayout";
import AdminCounsellors from "./pages/AdminCounsellors";
import AdminOverview from "./pages/AdminOverview";
import AdminAppointments from "./pages/AdminAppointments";

function Header() {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the mobile menu on navigation and on Escape.
  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <NavLink to="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <strong>Student Wellbeing</strong>
            <small>IIT (ISM) Dhanbad</small>
          </span>
        </NavLink>

        {user && (
          <>
            <button
              type="button"
              className="nav-toggle"
              aria-expanded={menuOpen}
              aria-controls="primary-nav"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span aria-hidden="true">{menuOpen ? "✕" : "☰"}</span>
            </button>

            <nav id="primary-nav" className={`header-nav${menuOpen ? " open" : ""}`}>
              <NavLink to="/" end>
                Counsellors
              </NavLink>
              <NavLink to="/appointments">{user.role === "counsellor" ? "My schedule" : "My appointments"}</NavLink>
              {user.role === "counsellor" && <NavLink to="/counsellor">Dashboard</NavLink>}
              {user.role === "admin" && <NavLink to="/admin">Admin</NavLink>}
              <NavLink to="/profile">Profile</NavLink>
              <button className="link-button" onClick={() => void signOut()}>
                Sign out
              </button>
            </nav>
          </>
        )}
      </div>
    </header>
  );
}

function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="shell loading">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  // UX only — the server independently enforces every one of these rules.
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { loading, user } = useAuth();

  return (
    <div className="app">
      <Header />
      <main className="shell main">
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
            <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/confirm" element={<Confirm />} />

            <Route
              path="/"
              element={
                <RequireAuth>
                  <Counsellors />
                </RequireAuth>
              }
            />
            <Route
              path="/book/:counsellorId"
              element={
                <RequireAuth>
                  <Book />
                </RequireAuth>
              }
            />
            <Route
              path="/appointments"
              element={
                <RequireAuth>
                  <MyAppointments />
                </RequireAuth>
              }
            />
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <Profile />
                </RequireAuth>
              }
            />
            <Route
              path="/counsellor"
              element={
                <RequireAuth roles={["counsellor"]}>
                  <CounsellorDashboard />
                </RequireAuth>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireAuth roles={["admin"]}>
                  <AdminLayout />
                </RequireAuth>
              }
            >
              <Route index element={<Navigate to="/admin/overview" replace />} />
              <Route path="overview" element={<AdminOverview />} />
              <Route path="appointments" element={<AdminAppointments />} />
              <Route path="counsellors" element={<AdminCounsellors />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
      <footer className="site-footer">
        <div className="shell">
          Sessions are confidential. In an emergency, contact the Health Center directly.
        </div>
      </footer>
    </div>
  );
}
