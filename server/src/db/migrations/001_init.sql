CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('student', 'counsellor', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub    TEXT UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  full_name     TEXT NOT NULL,
  avatar_url    TEXT,
  role          user_role NOT NULL DEFAULT 'student',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS counsellors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  email         TEXT UNIQUE,
  full_name     TEXT NOT NULL,
  title         TEXT,
  venue         TEXT,
  room          TEXT,
  slot_minutes  SMALLINT NOT NULL DEFAULT 20 CHECK (slot_minutes > 0 AND slot_minutes <= 20),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  display_order SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS availability_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counsellor_id UUID NOT NULL REFERENCES counsellors(id) ON DELETE CASCADE,
  weekday       SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT availability_rules_time_order CHECK (end_time > start_time),
  CONSTRAINT availability_rules_unique UNIQUE (counsellor_id, weekday, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS availability_rules_counsellor_idx
  ON availability_rules (counsellor_id, weekday);

CREATE TABLE IF NOT EXISTS availability_exceptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counsellor_id  UUID NOT NULL REFERENCES counsellors(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('blocked', 'extra')),
  start_time     TIME,
  end_time       TIME,
  reason         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT availability_exceptions_extra_needs_times
    CHECK (kind <> 'extra' OR (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time))
);

CREATE INDEX IF NOT EXISTS availability_exceptions_lookup_idx
  ON availability_exceptions (counsellor_id, exception_date);

CREATE TABLE IF NOT EXISTS appointments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counsellor_id            UUID NOT NULL REFERENCES counsellors(id) ON DELETE CASCADE,
  student_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at                TIMESTAMPTZ NOT NULL,
  ends_at                  TIMESTAMPTZ NOT NULL,
  status                   appointment_status NOT NULL DEFAULT 'pending',
  student_note             TEXT,
  confirmation_token_hash  TEXT,
  confirmation_expires_at  TIMESTAMPTZ,
  confirmed_at             TIMESTAMPTZ,
  cancelled_at             TIMESTAMPTZ,
  cancelled_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT appointments_time_order CHECK (ends_at > starts_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS appointments_slot_unique
  ON appointments (counsellor_id, starts_at)
  WHERE status IN ('pending', 'confirmed', 'completed');

CREATE UNIQUE INDEX IF NOT EXISTS appointments_student_slot_unique
  ON appointments (student_id, starts_at)
  WHERE status IN ('pending', 'confirmed');

CREATE INDEX IF NOT EXISTS appointments_counsellor_range_idx
  ON appointments (counsellor_id, starts_at);

CREATE INDEX IF NOT EXISTS appointments_student_idx
  ON appointments (student_id, starts_at DESC);

CREATE INDEX IF NOT EXISTS appointments_token_idx
  ON appointments (confirmation_token_hash)
  WHERE confirmation_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS scheduled_emails (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,
  send_after     TIMESTAMPTZ NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  attempts       INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_emails_unique UNIQUE (appointment_id, kind)
);

CREATE INDEX IF NOT EXISTS scheduled_emails_due_idx
  ON scheduled_emails (send_after)
  WHERE status = 'pending';
