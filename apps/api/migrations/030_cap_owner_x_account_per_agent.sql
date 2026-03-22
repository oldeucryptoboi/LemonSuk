CREATE UNIQUE INDEX IF NOT EXISTS uniq_agent_accounts_active_x_owner
  ON agent_accounts(owner_verification_x_user_id)
  WHERE owner_verification_x_user_id IS NOT NULL
    AND owner_verification_status IN ('pending_tweet', 'verified');
