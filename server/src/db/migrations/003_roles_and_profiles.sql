ALTER TABLE users
  ADD COLUMN IF NOT EXISTS department       TEXT,
  ADD COLUMN IF NOT EXISTS admission_number TEXT,
  ADD COLUMN IF NOT EXISTS phone            TEXT;

-- Counsellor records are claimed by matching a verified email; this index backs that lookup
-- and the "is this counsellor already claimed" guard in services/roleAssignment.ts.
CREATE INDEX IF NOT EXISTS counsellors_email_lower_idx ON counsellors (lower(email));
