ALTER TABLE agent_accounts
  ADD COLUMN IF NOT EXISTS owner_verification_status TEXT NOT NULL DEFAULT 'unclaimed',
  ADD COLUMN IF NOT EXISTS owner_verification_code TEXT,
  ADD COLUMN IF NOT EXISTS owner_verification_x_handle TEXT,
  ADD COLUMN IF NOT EXISTS owner_verification_tweet_url TEXT,
  ADD COLUMN IF NOT EXISTS owner_verification_started_at TIMESTAMPTZ;

ALTER TABLE agent_accounts
  ADD CONSTRAINT agent_accounts_owner_verification_status_check
  CHECK (
    owner_verification_status IN ('unclaimed', 'pending_tweet', 'verified')
  );

UPDATE agent_accounts
SET owner_verification_status = 'verified'
WHERE owner_verified_at IS NOT NULL;

UPDATE agent_accounts
SET owner_verification_status = 'pending_tweet',
    owner_verification_code = COALESCE(
      owner_verification_code,
      CONCAT('reef-', UPPER(SUBSTRING(id FROM 7 FOR 4)))
    ),
    owner_verification_started_at = COALESCE(
      owner_verification_started_at,
      updated_at,
      created_at,
      NOW()
    )
WHERE owner_verified_at IS NULL
  AND owner_email IS NOT NULL;

UPDATE agent_accounts
SET owner_verification_status = 'unclaimed',
    owner_verification_code = NULL,
    owner_verification_x_handle = NULL,
    owner_verification_tweet_url = NULL,
    owner_verification_started_at = NULL
WHERE owner_verified_at IS NULL
  AND owner_email IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_accounts_owner_verification_status
  ON agent_accounts(owner_verification_status);
