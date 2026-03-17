ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS authored_by_agent_id TEXT
  REFERENCES agent_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_markets_authored_by_agent_id
  ON markets(authored_by_agent_id);
