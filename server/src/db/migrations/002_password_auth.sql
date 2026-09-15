ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Every existing account so far was created via Google or dev-login, both of which already
-- prove control of the email. Backfill so nobody already using the app gets locked out by the
-- new "email must be verified to log in" rule.
UPDATE users
   SET email_verified_at = COALESCE(email_verified_at, last_login_at, created_at)
 WHERE email_verified_at IS NULL;

DO $$ BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_has_auth_method CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS user_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL CHECK (purpose IN ('email_verification', 'password_reset')),
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_tokens_one_live_per_purpose UNIQUE (user_id, purpose)
);

CREATE UNIQUE INDEX IF NOT EXISTS user_tokens_hash_idx ON user_tokens (token_hash);
