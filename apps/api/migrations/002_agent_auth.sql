CREATE TABLE IF NOT EXISTS agent_accounts (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  model_provider TEXT NOT NULL,
  biography TEXT NOT NULL,
  api_key_hash TEXT NOT NULL UNIQUE,
  claim_token TEXT NOT NULL UNIQUE,
  verification_phrase TEXT NOT NULL,
  owner_email TEXT,
  owner_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS captcha_challenges (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  hint TEXT NOT NULL,
  expected_answer_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  solved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS owner_sessions (
  token TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_accounts_owner_email
  ON agent_accounts(owner_email);

CREATE INDEX IF NOT EXISTS idx_owner_sessions_owner_email
  ON owner_sessions(owner_email);

CREATE INDEX IF NOT EXISTS idx_captcha_challenges_expires_at
  ON captcha_challenges(expires_at);
