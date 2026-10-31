import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { ReactNode } from "react";
import type { Role } from "./types";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import Home from "./pages/Home";
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

function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  // UX only — the server independently enforces every one of these rules.
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { loading, user } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0);
  }, [pathname]);

  const showsHome = !loading && !user && pathname === "/";

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="main">
        <div key={showsHome ? "home" : "page"} className={showsHome ? undefined : "shell main-inner"}>
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

              <Route path="/" element={user ? <Counsellors /> : <Home />} />
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
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
