import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api";
import { useToast } from "../components/Toast";
import { ConfirmDialog, Modal } from "../components/Modal";
import { AvailabilityEditor } from "../components/AvailabilityEditor";
import type { AvailabilityApi } from "../components/AvailabilityEditor";
import { EmptyState, SkeletonList } from "../components/Feedback";
import type { AdminCounsellor, CounsellorInput } from "../types";

type Filter = "all" | "active" | "inactive";

const BLANK: CounsellorInput = {
  email: "",
  fullName: "",
  title: "",
  venue: "Health Center, IIT (ISM) Dhanbad",
  room: "",
  slotMinutes: 20,
  displayOrder: 0,
};

export default function AdminCounsellors() {
  const toast = useToast();
  const [counsellors, setCounsellors] = useState<AdminCounsellor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const [editing, setEditing] = useState<{ draft: CounsellorInput; id: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<AdminCounsellor | null>(null);
  const [managing, setManaging] = useState<AdminCounsellor | null>(null);

  const load = useCallback(async () => {
    try {
      const { counsellors: list } = await api.admin.counsellors();
      setCounsellors(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load counsellors.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      (counsellors ?? []).filter((c) =>
        filter === "all" ? true : filter === "active" ? c.isActive : !c.isActive
      ),
    [counsellors, filter]
  );

  const managingApi = useMemo<AvailabilityApi | null>(() => {
    if (!managing) return null;
    const id = managing.id;
    return {
      listRules: () => api.admin.rules(id).then((r) => r.rules),
      addRule: (weekday, start, end) => api.admin.addRule(id, weekday, start, end),
      removeRule: (ruleId) => api.admin.removeRule(id, ruleId),
      listExceptions: () => api.admin.exceptions(id).then((r) => r.exceptions),
      addException: (input) => api.admin.addException(id, input),
      removeException: (exceptionId) => api.admin.removeException(id, exceptionId),
    };
  }, [managing]);

  async function saveCounsellor() {
    if (!editing) return;
    const { draft, id } = editing;
    if (!draft.fullName.trim()) return;

    setBusy(true);
    try {
      const payload = {
        email: draft.email?.trim() ? draft.email.trim() : null,
        fullName: draft.fullName.trim(),
        title: draft.title?.trim() || null,
        venue: draft.venue?.trim() || null,
        room: draft.room?.trim() || null,
        slotMinutes: draft.slotMinutes ?? 20,
        displayOrder: draft.displayOrder ?? 0,
      };

      if (id) {
        await api.admin.updateCounsellor(id, payload);
        toast.success("Counsellor updated.");
      } else {
        const { linkedExistingUser } = await api.admin.createCounsellor(payload);
        toast.success(
          linkedExistingUser
            ? "Counsellor added and linked to their existing account."
            : "Counsellor added. They gain access the first time they sign in with that email."
        );
      }
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save the counsellor.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmToggle() {
    if (!pendingToggle) return;
    setBusy(true);
    try {
      await api.admin.updateCounsellor(pendingToggle.id, { isActive: !pendingToggle.isActive });
      toast.success(pendingToggle.isActive ? "Counsellor deactivated." : "Counsellor reactivated.");
      setPendingToggle(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update the counsellor.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="alert error">{error}</div>;

  if (managing && managingApi) {
    return (
      <>
        <div className="page-head">
          <button type="button" className="back-link" onClick={() => setManaging(null)}>
            &larr; All counsellors
          </button>
          <h1>{managing.fullName}</h1>
          <p className="muted">Managing availability on their behalf.</p>
        </div>
        <AvailabilityEditor
          api={managingApi}
          readOnlyNotice={
            managing.isActive
              ? undefined
              : "This counsellor is deactivated. Changes are saved, but their slots stay hidden from students until they are reactivated."
          }
        />
      </>
    );
  }

  return (
    <>
      <div className="page-head admin-page-head">
        <div>
          <h1>Counsellors</h1>
          <p className="muted">Add counsellors, edit their details, and manage their availability.</p>
        </div>
        <button
          type="button"
          className="button primary"
          onClick={() => setEditing({ draft: { ...BLANK }, id: null })}
        >
          Add counsellor
        </button>
      </div>

      <div className="segmented" role="tablist" aria-label="Filter counsellors">
        {(["all", "active", "inactive"] as Filter[]).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={filter === value}
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
          >
            {value === "all" ? "All" : value === "active" ? "Active" : "Deactivated"}
          </button>
        ))}
      </div>

      {counsellors === null ? (
        <SkeletonList count={3} lines={2} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={filter === "inactive" ? "No deactivated counsellors" : "No counsellors yet"}
          body={
            filter === "inactive"
              ? "Counsellors you deactivate will be listed here."
              : "Add the Health Center counsellors so students can book with them."
          }
          action={
            filter !== "inactive" ? (
              <button
                type="button"
                className="button primary"
                onClick={() => setEditing({ draft: { ...BLANK }, id: null })}
              >
                Add counsellor
              </button>
            ) : undefined
          }
        />
      ) : (
        <ul className="counsellor-admin-list">
          {visible.map((counsellor) => (
            <li
              key={counsellor.id}
              className={`card counsellor-admin-row${counsellor.isActive ? "" : " is-inactive"}`}
            >
              <div className="counsellor-admin-main">
                <div className="counsellor-admin-title">
                  <strong>{counsellor.fullName}</strong>
                  <span className={`chip ${counsellor.isActive ? "confirmed" : "cancelled"}`}>
                    {counsellor.isActive ? "Active" : "Deactivated"}
                  </span>
                  {!counsellor.linkedAccount && <span className="chip pending">Awaiting first sign-in</span>}
                </div>
                <p className="muted small">
                  {counsellor.title ?? "Counsellor"}
                  {counsellor.room ? ` · ${counsellor.room}` : ""}
                  {counsellor.email ? ` · ${counsellor.email}` : " · no email yet"}
                </p>
              </div>

              <div className="counsellor-admin-actions">
                <button type="button" className="button ghost small" onClick={() => setManaging(counsellor)}>
                  Availability
                </button>
                <button
                  type="button"
                  className="button ghost small"
                  onClick={() =>
                    setEditing({
                      id: counsellor.id,
                      draft: {
                        email: counsellor.email ?? "",
                        fullName: counsellor.fullName,
                        title: counsellor.title ?? "",
                        venue: counsellor.venue ?? "",
                        room: counsellor.room ?? "",
                        slotMinutes: counsellor.slotMinutes,
                        displayOrder: counsellor.displayOrder,
                      },
                    })
                  }
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={`button small ${counsellor.isActive ? "danger" : "primary"}`}
                  onClick={() => setPendingToggle(counsellor)}
                >
                  {counsellor.isActive ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        title={editing?.id ? "Edit counsellor" : "Add counsellor"}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button type="button" className="button ghost" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => void saveCounsellor()}
              disabled={busy || !editing?.draft.fullName.trim()}
            >
              {busy ? "Saving..." : editing?.id ? "Save changes" : "Add counsellor"}
            </button>
          </>
        }
      >
        {editing && (
          <div className="form-grid">
            <div className="field">
              <label htmlFor="counsellor-name">Full name</label>
              <input
                id="counsellor-name"
                type="text"
                value={editing.draft.fullName}
                onChange={(event) =>
                  setEditing({ ...editing, draft: { ...editing.draft, fullName: event.target.value } })
                }
                required
              />
            </div>

            <div className="field">
              <label htmlFor="counsellor-email">Institute email</label>
              <input
                id="counsellor-email"
                type="email"
                value={editing.draft.email ?? ""}
                onChange={(event) =>
                  setEditing({ ...editing, draft: { ...editing.draft, email: event.target.value } })
                }
                placeholder="counsellor@iitism.ac.in"
              />
              <span className="field-hint">
                Used to link their account. If they already have a verified account they get access
                immediately; otherwise the record waits for their first sign-in. Changing the email
                removes access from the previous account.
              </span>
            </div>

            <div className="field">
              <label htmlFor="counsellor-title">Title</label>
              <input
                id="counsellor-title"
                type="text"
                value={editing.draft.title ?? ""}
                onChange={(event) =>
                  setEditing({ ...editing, draft: { ...editing.draft, title: event.target.value } })
                }
                placeholder="Psychologist (M.A.)"
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="counsellor-venue">Venue</label>
                <input
                  id="counsellor-venue"
                  type="text"
                  value={editing.draft.venue ?? ""}
                  onChange={(event) =>
                    setEditing({ ...editing, draft: { ...editing.draft, venue: event.target.value } })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="counsellor-room">Room</label>
                <input
                  id="counsellor-room"
                  type="text"
                  value={editing.draft.room ?? ""}
                  onChange={(event) =>
                    setEditing({ ...editing, draft: { ...editing.draft, room: event.target.value } })
                  }
                />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="counsellor-slot">Session length (minutes)</label>
                <input
                  id="counsellor-slot"
                  type="number"
                  min={5}
                  max={20}
                  value={editing.draft.slotMinutes ?? 20}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      draft: { ...editing.draft, slotMinutes: Number(event.target.value) },
                    })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="counsellor-order">Display order</label>
                <input
                  id="counsellor-order"
                  type="number"
                  min={0}
                  max={999}
                  value={editing.draft.displayOrder ?? 0}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      draft: { ...editing.draft, displayOrder: Number(event.target.value) },
                    })
                  }
                />
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingToggle !== null}
        title={pendingToggle?.isActive ? "Deactivate this counsellor?" : "Reactivate this counsellor?"}
        destructive={pendingToggle?.isActive}
        busy={busy}
        confirmLabel={pendingToggle?.isActive ? "Deactivate" : "Reactivate"}
        body={
          pendingToggle?.isActive ? (
            <>
              <p>
                <strong>{pendingToggle.fullName}</strong> will be removed from the counsellor list
                students see and will not be able to receive new bookings or change their availability.
              </p>
              {pendingToggle.upcomingCount > 0 && (
                <p className="alert notice">
                  They have {pendingToggle.upcomingCount} upcoming appointment
                  {pendingToggle.upcomingCount === 1 ? "" : "s"}. These stay booked. Cancel them from the
                  Appointments page if students should be told to rebook.
                </p>
              )}
              <p className="muted small">
                Nothing is deleted. Existing appointments and all history stay exactly as they are, and
                you can reactivate at any time.
              </p>
            </>
          ) : (
            <p>
              <strong>{pendingToggle?.fullName}</strong> will appear to students again and can take new
              bookings using their existing availability.
            </p>
          )
        }
        onConfirm={() => void confirmToggle()}
        onCancel={() => setPendingToggle(null)}
      />
    </>
  );
}
