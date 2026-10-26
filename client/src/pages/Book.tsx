import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../AuthContext";
import { addDays, formatDate, formatDayShort, formatTime, isMorning, todayISO } from "../lib/format";
import type { Counsellor, DayAvailability, Slot } from "../types";

export default function Book() {
  const { counsellorId } = useParams<{ counsellorId: string }>();
  const { config, user } = useAuth();

  const [weekStart, setWeekStart] = useState(todayISO());
  const [counsellor, setCounsellor] = useState<Counsellor | null>(null);
  const [days, setDays] = useState<DayAvailability[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const [requested, setRequested] = useState<{ appointmentId: string; emailSent: boolean } | null>(null);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!counsellorId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.availability(counsellorId, weekStart, 7);
      setCounsellor(data.counsellor);
      setDays(data.days);
      setSelectedDate((current) => {
        if (current && data.days.some((d) => d.date === current)) return current;
        return data.days.find((d) => d.slots.some((s) => s.available))?.date ?? data.days[0]?.date ?? null;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load availability.");
    } finally {
      setLoading(false);
    }
  }, [counsellorId, weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeDay = useMemo(
    () => days.find((day) => day.date === selectedDate) ?? null,
    [days, selectedDate]
  );

  const morning = activeDay?.slots.filter((slot) => isMorning(slot.startsAt)) ?? [];
  const evening = activeDay?.slots.filter((slot) => !isMorning(slot.startsAt)) ?? [];

  const canGoBack = weekStart > todayISO();
  const canGoForward = addDays(weekStart, 7) <= addDays(todayISO(), config?.bookingHorizonDays ?? 14);
  const pendingMinutes = config?.pendingExpiryMinutes ?? 10;

  async function handleRequest() {
    if (!selectedSlot || !counsellorId) return;
    setBooking(true);
    setError(null);
    setConflict(false);
    try {
      const result = await api.book(counsellorId, selectedSlot.startsAt, note.trim() || null);
      setRequested({ appointmentId: result.appointmentId, emailSent: result.emailSent });
      setSelectedSlot(null);
      setNote("");
    } catch (err) {
      if (err instanceof ApiError && err.code === "slot_taken") {
        setConflict(true);
        setSelectedSlot(null);
        await load();
      } else {
        setError(err instanceof ApiError ? err.message : "Booking failed. Please try again.");
      }
    } finally {
      setBooking(false);
    }
  }

  async function handleResend() {
    if (!requested) return;
    setResending(true);
    setResendNotice(null);
    try {
      const result = await api.resendConfirmation(requested.appointmentId);
      setRequested({ ...requested, emailSent: result.emailSent });
      setResendNotice(
        result.emailSent
          ? "Confirmation email sent again."
          : "We could not send the email just now — please try again in a moment."
      );
    } catch (err) {
      setResendNotice(err instanceof ApiError ? err.message : "Could not resend the email. Please try again.");
    } finally {
      setResending(false);
    }
  }

  if (requested) {
    return (
      <div className="card confirm-panel">
        <div className="big-check" aria-hidden="true">
          &#10003;
        </div>
        <h1>Appointment request created</h1>
        <p>
          {requested.emailSent
            ? `We've sent a confirmation link to your ${config?.allowedDomain ? `@${config.allowedDomain}` : "IIT (ISM)"} email.`
            : "Your slot is held, but we could not send the confirmation email just now."}
        </p>
        <p className="muted">
          Your slot is reserved for {pendingMinutes} minutes. Please check your email to confirm
          your appointment.
        </p>
        {resendNotice && <div className="alert notice">{resendNotice}</div>}
        <div className="row">
          <button className="button ghost" onClick={() => void handleResend()} disabled={resending}>
            {resending ? "Sending..." : "Resend confirmation email"}
          </button>
          <Link className="button primary" to="/appointments">
            View my appointments
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <Link to="/" className="back-link">
          &larr; All counsellors
        </Link>
        <h1>{counsellor?.fullName ?? "Availability"}</h1>
        <p className="muted">
          {counsellor?.title}
          {counsellor?.room ? ` · ${counsellor.room}` : ""}
        </p>
      </div>

      <div className="week-nav">
        <button
          className="button ghost small"
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          disabled={!canGoBack}
        >
          &larr; Previous
        </button>
        <span className="muted small">
          {days.length > 0 && `${formatDate(`${days[0].date}T06:00:00Z`)} onwards`}
        </span>
        <button
          className="button ghost small"
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          disabled={!canGoForward}
        >
          Next &rarr;
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading slots...</div>
      ) : (
        <>
          <div className="day-strip">
            {days.map((day) => {
              const open = day.slots.filter((slot) => slot.available).length;
              const parts = formatDayShort(day.date);
              return (
                <button
                  key={day.date}
                  className={`day-chip${day.date === selectedDate ? " active" : ""}${
                    open === 0 ? " empty" : ""
                  }`}
                  onClick={() => {
                    setSelectedDate(day.date);
                    setSelectedSlot(null);
                  }}
                  disabled={open === 0}
                >
                  <span className="weekday">{parts.weekday}</span>
                  <span className="daynum">{parts.day}</span>
                  <span className="count">{open === 0 ? "closed" : `${open} free`}</span>
                </button>
              );
            })}
          </div>

          {conflict && (
            <div className="alert notice">
              This slot is no longer available. Another student has already taken this
              appointment slot. Pick another time below.
            </div>
          )}
          {error && <div className="alert error">{error}</div>}

          {activeDay && (
            <div className={`slots-area${selectedSlot ? " with-selection" : ""}`}>
              {activeDay.slots.length === 0 ? (
                <p className="muted">No slots on this day.</p>
              ) : (
                <>
                  <SlotGroup
                    label="Morning"
                    slots={morning}
                    selected={selectedSlot}
                    onSelect={setSelectedSlot}
                  />
                  <SlotGroup
                    label="Afternoon and evening"
                    slots={evening}
                    selected={selectedSlot}
                    onSelect={setSelectedSlot}
                  />
                </>
              )}
            </div>
          )}

          {selectedSlot && (
            <div className="card booking-bar">
              <div>
                <div className="small muted">Review your appointment</div>
                <dl className="review-details">
                  <div>
                    <dt>Counsellor</dt>
                    <dd>{counsellor?.fullName}</dd>
                  </div>
                  <div>
                    <dt>Date</dt>
                    <dd>{formatDate(selectedSlot.startsAt)}</dd>
                  </div>
                  <div>
                    <dt>Time</dt>
                    <dd>
                      {formatTime(selectedSlot.startsAt)} - {formatTime(selectedSlot.endsAt)}
                    </dd>
                  </div>
                  <div>
                    <dt>Duration</dt>
                    <dd>{counsellor?.slotMinutes ?? 20} minutes</dd>
                  </div>
                  {user?.email && (
                    <div>
                      <dt>Booking as</dt>
                      <dd>{user.email}</dd>
                    </div>
                  )}
                </dl>
              </div>
              <textarea
                placeholder="Anything you want the counsellor to know beforehand? (optional)"
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
              />
              <div className="row">
                <button className="button primary" onClick={() => void handleRequest()} disabled={booking}>
                  {booking ? "Requesting..." : "Request appointment"}
                </button>
                <button className="button ghost" onClick={() => setSelectedSlot(null)}>
                  Clear
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function SlotGroup({
  label,
  slots,
  selected,
  onSelect,
}: {
  label: string;
  slots: Slot[];
  selected: Slot | null;
  onSelect: (slot: Slot) => void;
}) {
  if (slots.length === 0) return null;

  return (
    <section className="slot-group">
      <h3>{label}</h3>
      <div className="slot-grid">
        {slots.map((slot) => (
          <button
            key={slot.startsAt}
            className={`slot${selected?.startsAt === slot.startsAt ? " selected" : ""}`}
            disabled={!slot.available}
            onClick={() => onSelect(slot)}
          >
            {formatTime(slot.startsAt)}
          </button>
        ))}
      </div>
    </section>
  );
}
