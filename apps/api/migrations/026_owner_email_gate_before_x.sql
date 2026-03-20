ALTER TABLE agent_accounts
  DROP CONSTRAINT IF EXISTS agent_accounts_owner_verification_status_check;

ALTER TABLE agent_accounts
  ADD CONSTRAINT agent_accounts_owner_verification_status_check
  CHECK (
    owner_verification_status IN (
      'unclaimed',
      'pending_email',
      'pending_tweet',
      'verified'
    )
  );

CREATE TABLE IF NOT EXISTS owner_claim_email_verifications (
  token TEXT PRIMARY KEY,
  claim_token TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_owner_claim_email_verifications_claim_token
  ON owner_claim_email_verifications(claim_token);

CREATE INDEX IF NOT EXISTS idx_owner_claim_email_verifications_expires_at
  ON owner_claim_email_verifications(expires_at);

UPDATE agent_accounts
SET owner_verification_status = 'pending_email',
    owner_verification_x_handle = NULL,
    owner_verification_x_user_id = NULL,
    owner_verification_x_connected_at = NULL,
    owner_verification_tweet_url = NULL,
    owner_verification_started_at = COALESCE(
      owner_verification_started_at,
      updated_at,
      created_at,
      NOW()
    )
WHERE owner_verified_at IS NULL
  AND owner_email IS NOT NULL;
