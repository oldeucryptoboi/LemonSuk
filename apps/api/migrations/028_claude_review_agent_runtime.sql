ALTER TABLE prediction_leads
  ADD COLUMN IF NOT EXISTS claude_review_claimed_by_agent_key TEXT,
  ADD COLUMN IF NOT EXISTS claude_review_claim_run_id TEXT,
  ADD COLUMN IF NOT EXISTS claude_review_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claude_review_claim_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_prediction_leads_claude_review_claim
  ON prediction_leads(status, claude_review_claim_expires_at, created_at);

CREATE TABLE IF NOT EXISTS claude_runner_sessions (
  agent_key TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  workspace_cwd TEXT NOT NULL,
  last_run_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_claude_runner_sessions_session_id
  ON claude_runner_sessions(session_id);

CREATE TABLE IF NOT EXISTS claude_runner_runs (
  id TEXT PRIMARY KEY,
  agent_key TEXT NOT NULL,
  lead_id TEXT NOT NULL REFERENCES prediction_leads(id) ON DELETE CASCADE,
  session_id TEXT,
  provider_run_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  trigger TEXT NOT NULL,
  workspace_cwd TEXT NOT NULL,
  prompt_summary TEXT NOT NULL,
  final_summary TEXT,
  error_message TEXT,
  cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  token_usage_json JSONB,
  tool_usage_json JSONB,
  recommendation_json JSONB,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claude_runner_runs_agent_key_started_at
  ON claude_runner_runs(agent_key, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_claude_runner_runs_lead_id_started_at
  ON claude_runner_runs(lead_id, started_at DESC);

CREATE TABLE IF NOT EXISTS claude_runner_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES claude_runner_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claude_runner_events_run_id_created_at
  ON claude_runner_events(run_id, created_at ASC);
