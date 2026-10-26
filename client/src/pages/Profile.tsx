import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api";
import { useToast } from "../components/Toast";
import { SkeletonCard } from "../components/Feedback";
import type { Profile as ProfileType } from "../types";

type Draft = {
  fullName: string;
  department: string;
  admissionNumber: string;
  phone: string;
};

const ROLE_LABEL: Record<ProfileType["role"], string> = {
  student: "Student",
  counsellor: "Counsellor",
  admin: "Administrator",
};

function toDraft(profile: ProfileType): Draft {
  return {
    fullName: profile.fullName,
    department: profile.department ?? "",
    admissionNumber: profile.admissionNumber ?? "",
    phone: profile.phone ?? "",
  };
}

export default function Profile() {
  const toast = useToast();
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .profile()
      .then(({ profile: loaded }) => {
        setProfile(loaded);
        setDraft(toDraft(loaded));
      })
      .catch(() => setError("Could not load your profile."))
      .finally(() => setLoading(false));
  }, []);

  const dirty = useMemo(() => {
    if (!profile || !draft) return false;
    const original = toDraft(profile);
    return (Object.keys(original) as (keyof Draft)[]).some((key) => original[key] !== draft[key]);
  }, [profile, draft]);

  const nameInvalid = draft !== null && draft.fullName.trim().length === 0;

  async function handleSave() {
    if (!draft || nameInvalid) return;
    setSaving(true);
    try {
      const { profile: updated } = await api.updateProfile({
        fullName: draft.fullName.trim(),
        department: draft.department.trim() || null,
        admissionNumber: draft.admissionNumber.trim() || null,
        phone: draft.phone.trim() || null,
      });
      setProfile(updated);
      setDraft(toDraft(updated));
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <div className="page-head">
          <h1>Your profile</h1>
        </div>
        <SkeletonCard lines={5} />
      </>
    );
  }

  if (error || !profile || !draft) return <div className="alert error">{error ?? "Profile unavailable."}</div>;

  return (
    <>
      <div className="page-head">
        <h1>Your profile</h1>
        <p className="muted">
          These details are yours. Counsellors only ever see your name and email alongside an
          appointment you have booked with them.
        </p>
      </div>

      <div className="card profile-section">
        <h2>Account</h2>
        <p className="muted small">Managed by your institute sign-in and cannot be changed here.</p>
        <dl className="review-details">
          <div>
            <dt>Email</dt>
            <dd>
              {profile.email}{" "}
              {profile.emailVerified && <span className="chip confirmed">Verified</span>}
            </dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{ROLE_LABEL[profile.role]}</dd>
          </div>
        </dl>
      </div>

      <form
        className="card profile-section"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <h2>Your details</h2>

        <div className="field">
          <label htmlFor="profile-name">Full name</label>
          <input
            id="profile-name"
            type="text"
            maxLength={120}
            value={draft.fullName}
            onChange={(event) => setDraft({ ...draft, fullName: event.target.value })}
            aria-invalid={nameInvalid}
            required
          />
          {nameInvalid && <span className="field-hint error-hint">Your name cannot be empty.</span>}
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="profile-department">Department</label>
            <input
              id="profile-department"
              type="text"
              maxLength={120}
              value={draft.department}
              onChange={(event) => setDraft({ ...draft, department: event.target.value })}
              placeholder="Computer Science and Engineering"
            />
          </div>
          <div className="field">
            <label htmlFor="profile-admission">Admission number</label>
            <input
              id="profile-admission"
              type="text"
              maxLength={40}
              value={draft.admissionNumber}
              onChange={(event) => setDraft({ ...draft, admissionNumber: event.target.value })}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="profile-phone">Phone (optional)</label>
          <input
            id="profile-phone"
            type="tel"
            maxLength={30}
            value={draft.phone}
            onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
          />
          <span className="field-hint">Never shared with counsellors.</span>
        </div>

        <div className="row">
          <button className="button primary" type="submit" disabled={!dirty || saving || nameInvalid}>
            {saving ? "Saving..." : "Save changes"}
          </button>
          {dirty && (
            <button
              type="button"
              className="button ghost"
              onClick={() => setDraft(toDraft(profile))}
              disabled={saving}
            >
              Discard
            </button>
          )}
        </div>
      </form>
    </>
  );
}
