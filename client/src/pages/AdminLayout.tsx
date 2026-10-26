import { NavLink, Outlet } from "react-router-dom";

/**
 * Admin shell. Sections live as nested routes so new areas can be added as additional links
 * without restructuring anything.
 */
export default function AdminLayout() {
  return (
    <div className="admin-shell">
      <aside className="admin-nav">
        <span className="admin-nav-label">Administration</span>
        <nav aria-label="Admin sections">
          <NavLink to="/admin/overview">Overview</NavLink>
          <NavLink to="/admin/appointments">Appointments</NavLink>
          <NavLink to="/admin/counsellors">Counsellors</NavLink>
        </nav>
      </aside>

      <section className="admin-content">
        <Outlet />
      </section>
    </div>
  );
}
