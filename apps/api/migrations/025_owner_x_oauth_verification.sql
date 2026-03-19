ALTER TABLE agent_accounts
  ADD COLUMN IF NOT EXISTS owner_verification_x_user_id TEXT,
  ADD COLUMN IF NOT EXISTS owner_verification_x_connected_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS owner_verification_x_states (
  state TEXT PRIMARY KEY,
  claim_token TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_owner_verification_x_states_claim_token
  ON owner_verification_x_states(claim_token);

CREATE INDEX IF NOT EXISTS idx_owner_verification_x_states_expires_at
  ON owner_verification_x_states(expires_at);
