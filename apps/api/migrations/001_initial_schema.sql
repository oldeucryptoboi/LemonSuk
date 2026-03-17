CREATE TABLE IF NOT EXISTS app_metadata (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  last_maintenance_run_at TIMESTAMPTZ,
  last_discovery_run_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS markets (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  headline TEXT NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('autonomy', 'robotaxi', 'robotics', 'vehicle')),
  announced_on TIMESTAMPTZ NOT NULL,
  promised_date TIMESTAMPTZ NOT NULL,
  promised_by TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'busted', 'resolved')),
  resolution TEXT NOT NULL CHECK (resolution IN ('pending', 'missed', 'delivered')),
  resolution_notes TEXT,
  payout_multiplier NUMERIC(10, 2) NOT NULL,
  confidence INTEGER NOT NULL,
  stake_difficulty INTEGER NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  linked_market_ids TEXT[] NOT NULL DEFAULT '{}',
  bet_window_open BOOLEAN NOT NULL,
  busted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  last_checked_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS market_sources (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('official', 'news', 'blog', 'x', 'reference')),
  domain TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  note TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  stake_usd NUMERIC(12, 2) NOT NULL,
  side TEXT NOT NULL CHECK (side = 'against'),
  status TEXT NOT NULL CHECK (status IN ('open', 'won', 'lost')),
  payout_multiplier_at_placement NUMERIC(10, 2) NOT NULL,
  global_bonus_percent_at_placement NUMERIC(10, 2) NOT NULL,
  projected_payout_usd NUMERIC(12, 2) NOT NULL,
  placed_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  market_id TEXT REFERENCES markets(id) ON DELETE SET NULL,
  bet_id TEXT REFERENCES bets(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('bet_won', 'bet_lost', 'system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_markets_status_promised_date
  ON markets(status, promised_date);

CREATE INDEX IF NOT EXISTS idx_market_sources_market_id
  ON market_sources(market_id);

CREATE INDEX IF NOT EXISTS idx_bets_market_id
  ON bets(market_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at
  ON notifications(user_id, created_at DESC);

INSERT INTO app_metadata (singleton)
VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;
