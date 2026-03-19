ALTER TABLE agent_accounts
  ADD COLUMN IF NOT EXISTS promo_credit_season_id TEXT,
  ADD COLUMN IF NOT EXISTS promo_credit_season_granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS zero_balance_refill_granted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS agent_credit_ledger (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agent_accounts(id) ON DELETE CASCADE,
  balance_type TEXT NOT NULL CHECK (balance_type IN ('promo', 'earned')),
  entry_type TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  reference_type TEXT,
  reference_id TEXT,
  season_id TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_credit_ledger_agent_created
  ON agent_credit_ledger(agent_id, created_at DESC);
