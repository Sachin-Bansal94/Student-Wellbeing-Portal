import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { ReactNode } from "react";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Counsellors from "./pages/Counsellors";
import Book from "./pages/Book";
import MyAppointments from "./pages/MyAppointments";
import Confirm from "./pages/Confirm";

function Header() {
  const { user, signOut } = useAuth();

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
          <nav className="header-nav">
            <NavLink to="/" end>
              Counsellors
            </NavLink>
            <NavLink to="/appointments">My appointments</NavLink>
            <button className="link-button" onClick={() => void signOut()}>
              Sign out
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="shell loading">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
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
