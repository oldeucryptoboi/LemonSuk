ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS previous_payout_multiplier NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS last_line_move_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_line_move_reason TEXT,
  ADD COLUMN IF NOT EXISTS current_open_interest_credits NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_liability_credits NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_stake_credits NUMERIC(12, 2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS max_liability_credits NUMERIC(12, 2) NOT NULL DEFAULT 350,
  ADD COLUMN IF NOT EXISTS per_agent_exposure_cap_credits NUMERIC(12, 2) NOT NULL DEFAULT 150,
  ADD COLUMN IF NOT EXISTS betting_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS settlement_grace_hours INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_resolve_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settlement_state TEXT NOT NULL DEFAULT 'live';

ALTER TABLE markets
  DROP CONSTRAINT IF EXISTS markets_last_line_move_reason_check;

ALTER TABLE markets
  ADD CONSTRAINT markets_last_line_move_reason_check
  CHECK (
    last_line_move_reason IS NULL
    OR last_line_move_reason IN ('bet', 'maintenance', 'suspension', 'reopen')
  );

ALTER TABLE markets
  DROP CONSTRAINT IF EXISTS markets_settlement_state_check;

ALTER TABLE markets
  ADD CONSTRAINT markets_settlement_state_check
  CHECK (settlement_state IN ('live', 'grace', 'awaiting_operator', 'settled'));

CREATE TABLE IF NOT EXISTS market_line_history (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  moved_at TIMESTAMPTZ NOT NULL,
  previous_payout_multiplier NUMERIC(10, 2) NOT NULL,
  next_payout_multiplier NUMERIC(10, 2) NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('bet', 'maintenance', 'suspension', 'reopen')),
  commentary TEXT NOT NULL,
  trigger_bet_id TEXT,
  open_interest_credits NUMERIC(12, 2) NOT NULL DEFAULT 0,
  liability_credits NUMERIC(12, 2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_market_line_history_market_id_moved_at
  ON market_line_history(market_id, moved_at DESC);
