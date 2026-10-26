import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../api";
import { useToast } from "./Toast";
import { ConfirmDialog, Modal } from "./Modal";
import { EmptyState, Skeleton } from "./Feedback";
import type { AvailabilityException, AvailabilityRule } from "../types";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The scheduling grid spans this window; blocks outside it still render, just clamped. */
const GRID_START_HOUR = 8;
const GRID_END_HOUR = 21;

function toMinutes(time: string): number {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function formatTime(time: string): string {
  const minutes = toMinutes(time);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? "am" : "pm";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${suffix}`;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Operations are injected so the same editor serves counsellor self-service and admin. */
export type AvailabilityApi = {
  listRules: () => Promise<AvailabilityRule[]>;
  addRule: (weekday: number, startTime: string, endTime: string) => Promise<unknown>;
  removeRule: (ruleId: string) => Promise<unknown>;
  listExceptions: () => Promise<AvailabilityException[]>;
  addException: (input: {
    date: string;
    kind: "blocked" | "extra";
    startTime?: string | null;
    endTime?: string | null;
    reason?: string | null;
  }) => Promise<unknown>;
  removeException: (exceptionId: string) => Promise<unknown>;
};

export function AvailabilityEditor({ api, readOnlyNotice }: { api: AvailabilityApi; readOnlyNotice?: string }) {
  const toast = useToast();
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState<number>(new Date().getDay());

  const [ruleDraft, setRuleDraft] = useState<{ weekday: number; start: string; end: string } | null>(null);
  const [exceptionOpen, setExceptionOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<
    { type: "rule" | "exception"; id: string; label: string } | null
  >(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedRules, loadedExceptions] = await Promise.all([api.listRules(), api.listExceptions()]);
      setRules(loadedRules);
      setExceptions(loadedExceptions);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not load availability.");
    } finally {
      setLoading(false);
    }
  }, [api, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const rulesByDay = useMemo(() => {
    const map = new Map<number, AvailabilityRule[]>();
    for (const rule of rules) {
      const list = map.get(rule.weekday) ?? [];
      list.push(rule);
      map.set(rule.weekday, list);
    }
    for (const list of map.values()) list.sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
    return map;
  }, [rules]);

  const totalHours = useMemo(
    () =>
      rules.reduce((sum, rule) => sum + (toMinutes(rule.end_time) - toMinutes(rule.start_time)) / 60, 0),
    [rules]
  );

  async function submitRule() {
    if (!ruleDraft) return;
    setBusy(true);
    try {
      await api.addRule(ruleDraft.weekday, ruleDraft.start, ruleDraft.end);
      toast.success(`Added ${WEEKDAYS[ruleDraft.weekday]} ${formatTime(ruleDraft.start)}–${formatTime(ruleDraft.end)}`);
      setRuleDraft(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add that block.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemoval() {
    if (!pendingRemoval) return;
    setBusy(true);
    try {
      if (pendingRemoval.type === "rule") await api.removeRule(pendingRemoval.id);
      else await api.removeException(pendingRemoval.id);
      toast.success("Removed.");
      setPendingRemoval(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove that.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="availability-grid" aria-busy="true">
        {SHORT_DAYS.map((day) => (
          <div key={day} className="availability-column">
            <Skeleton height="14px" width="60%" />
            <Skeleton height="56px" />
            <Skeleton height="40px" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="availability-editor">
      {readOnlyNotice && <div className="alert notice">{readOnlyNotice}</div>}

      <div className="section-head">
        <div>
          <h2>Weekly hours</h2>
          <p className="muted small">
            {rules.length === 0
              ? "No recurring hours set yet."
              : `${rules.length} block${rules.length === 1 ? "" : "s"} · ${totalHours.toFixed(1)} hours a week`}
          </p>
        </div>
      </div>

      {/* Desktop: all seven days side by side. Mobile: one day at a time via the selector below. */}
      <div className="day-selector" role="tablist" aria-label="Day of week">
        {SHORT_DAYS.map((day, index) => (
          <button
            key={day}
            role="tab"
            aria-selected={activeDay === index}
            className={`day-chip${activeDay === index ? " active" : ""}`}
            onClick={() => setActiveDay(index)}
          >
            <span className="weekday">{day}</span>
            <span className="count">{rulesByDay.get(index)?.length ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="availability-grid">
        {SHORT_DAYS.map((day, weekday) => {
          const dayRules = rulesByDay.get(weekday) ?? [];
          return (
            <div
              key={day}
              className={`availability-column${activeDay === weekday ? " is-active-day" : ""}`}
            >
              <div className="availability-column-head">
                <span className="weekday">{day}</span>
              </div>

              <div className="availability-track">
                {dayRules.length === 0 ? (
                  <p className="availability-free">No hours</p>
                ) : (
                  dayRules.map((rule) => {
                    const start = toMinutes(rule.start_time);
                    const end = toMinutes(rule.end_time);
                    const span = (GRID_END_HOUR - GRID_START_HOUR) * 60;
                    const top = Math.max(0, ((start - GRID_START_HOUR * 60) / span) * 100);
                    const height = Math.min(100 - top, ((end - start) / span) * 100);
                    return (
                      <div
                        key={rule.id}
                        className="availability-block"
                        style={{ top: `${top}%`, height: `${Math.max(height, 8)}%` }}
                      >
                        <span className="availability-block-time">
                          {formatTime(rule.start_time)} – {formatTime(rule.end_time)}
                        </span>
                        <button
                          type="button"
                          className="availability-block-remove"
                          aria-label={`Remove ${WEEKDAYS[weekday]} ${formatTime(rule.start_time)} to ${formatTime(rule.end_time)}`}
                          onClick={() =>
                            setPendingRemoval({
                              type: "rule",
                              id: rule.id,
                              label: `${WEEKDAYS[weekday]}, ${formatTime(rule.start_time)} – ${formatTime(rule.end_time)}`,
                            })
                          }
                        >
                          &times;
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <button
                type="button"
                className="button ghost small availability-add"
                onClick={() => setRuleDraft({ weekday, start: "09:30", end: "13:30" })}
              >
                + Add
              </button>
            </div>
          );
        })}
      </div>

      <div className="section-head">
        <div>
          <h2>Leave &amp; one-off changes</h2>
          <p className="muted small">Block a date you are away, or open extra hours for a single day.</p>
        </div>
        <button type="button" className="button primary small" onClick={() => setExceptionOpen(true)}>
          Add entry
        </button>
      </div>

      {exceptions.length === 0 ? (
        <EmptyState
          title="Nothing scheduled"
          body="Upcoming leave and one-off extra hours will appear here."
        />
      ) : (
        <ul className="exception-list">
          {exceptions.map((exception) => (
            <li key={exception.id} className="card exception-row">
              <div>
                <span className={`chip ${exception.kind === "blocked" ? "cancelled" : "confirmed"}`}>
                  {exception.kind === "blocked" ? "Leave" : "Extra hours"}
                </span>
                <strong className="exception-date">{formatDate(exception.exception_date)}</strong>
                <p className="muted small">
                  {exception.start_time && exception.end_time
                    ? `${formatTime(exception.start_time)} – ${formatTime(exception.end_time)}`
                    : "Whole day"}
                  {exception.reason ? ` · ${exception.reason}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="button ghost small"
                onClick={() =>
                  setPendingRemoval({
                    type: "exception",
                    id: exception.id,
                    label: `${exception.kind === "blocked" ? "Leave" : "Extra hours"} on ${formatDate(exception.exception_date)}`,
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <RuleDialog
        draft={ruleDraft}
        busy={busy}
        onChange={setRuleDraft}
        onClose={() => setRuleDraft(null)}
        onSubmit={() => void submitRule()}
      />

      <ExceptionDialog
        open={exceptionOpen}
        busy={busy}
        onClose={() => setExceptionOpen(false)}
        onSubmit={async (input) => {
          setBusy(true);
          try {
            await api.addException(input);
            toast.success("Entry added.");
            setExceptionOpen(false);
            await load();
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : "Could not add that entry.");
          } finally {
            setBusy(false);
          }
        }}
      />

      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Remove this?"
        destructive
        busy={busy}
        confirmLabel="Remove"
        body={
          <p>
            {pendingRemoval?.label} will be removed. Students will no longer see these slots, but any
            appointments already booked stay exactly as they are.
          </p>
        }
        onConfirm={() => void confirmRemoval()}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  );
}

function RuleDialog({
  draft,
  busy,
  onChange,
  onClose,
  onSubmit,
}: {
  draft: { weekday: number; start: string; end: string } | null;
  busy: boolean;
  onChange: (draft: { weekday: number; start: string; end: string }) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const invalid = draft !== null && draft.start >= draft.end;

  return (
    <Modal
      open={draft !== null}
      title={draft ? `Add hours on ${WEEKDAYS[draft.weekday]}` : ""}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="button primary" onClick={onSubmit} disabled={busy || invalid}>
            {busy ? "Adding..." : "Add block"}
          </button>
        </>
      }
    >
      {draft && (
        <div className="form-grid">
          <div className="field">
            <label htmlFor="rule-day">Day</label>
            <select
              id="rule-day"
              value={draft.weekday}
              onChange={(event) => onChange({ ...draft, weekday: Number(event.target.value) })}
            >
              {WEEKDAYS.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="rule-start">Start</label>
              <input
                id="rule-start"
                type="time"
                value={draft.start}
                onChange={(event) => onChange({ ...draft, start: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="rule-end">End</label>
              <input
                id="rule-end"
                type="time"
                value={draft.end}
                onChange={(event) => onChange({ ...draft, end: event.target.value })}
              />
            </div>
          </div>
          {invalid && <p className="field-hint error-hint">The end time must be after the start time.</p>}
        </div>
      )}
    </Modal>
  );
}

function ExceptionDialog({
  open,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    date: string;
    kind: "blocked" | "extra";
    startTime?: string | null;
    endTime?: string | null;
    reason?: string | null;
  }) => void;
}) {
  const [kind, setKind] = useState<"blocked" | "extra">("blocked");
  const [date, setDate] = useState("");
  const [wholeDay, setWholeDay] = useState(true);
  const [start, setStart] = useState("09:30");
  const [end, setEnd] = useState("13:30");
  const [reason, setReason] = useState("");

  const needsTimes = kind === "extra" || !wholeDay;
  const invalid = !date || (needsTimes && start >= end);

  return (
    <Modal
      open={open}
      title="Add leave or extra hours"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="button primary"
            disabled={busy || invalid}
            onClick={() =>
              onSubmit({
                date,
                kind,
                startTime: needsTimes ? start : null,
                endTime: needsTimes ? end : null,
                reason: reason.trim() || null,
              })
            }
          >
            {busy ? "Adding..." : "Add entry"}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <span className="field-label">Type</span>
          <div className="segmented" role="radiogroup" aria-label="Entry type">
            <button
              type="button"
              role="radio"
              aria-checked={kind === "blocked"}
              className={kind === "blocked" ? "active" : ""}
              onClick={() => setKind("blocked")}
            >
              Leave
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={kind === "extra"}
              className={kind === "extra" ? "active" : ""}
              onClick={() => setKind("extra")}
            >
              Extra hours
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="exception-date">Date</label>
          <input
            id="exception-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </div>

        {kind === "blocked" && (
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={wholeDay}
              onChange={(event) => setWholeDay(event.target.checked)}
            />
            <span>Away the whole day</span>
          </label>
        )}

        {needsTimes && (
          <div className="field-row">
            <div className="field">
              <label htmlFor="exception-start">Start</label>
              <input
                id="exception-start"
                type="time"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="exception-end">End</label>
              <input
                id="exception-end"
                type="time"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="exception-reason">Reason (optional)</label>
          <input
            id="exception-reason"
            type="text"
            maxLength={200}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Conference, medical leave…"
          />
        </div>
      </div>
    </Modal>
  );
}
