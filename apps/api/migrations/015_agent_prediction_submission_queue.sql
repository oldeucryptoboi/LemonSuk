CREATE TABLE IF NOT EXISTS agent_prediction_submissions (
  id TEXT PRIMARY KEY,
  submitted_by_agent_id TEXT NOT NULL
    REFERENCES agent_accounts(id) ON DELETE CASCADE,
  headline TEXT NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN (
      'autonomy',
      'robotaxi',
      'robotics',
      'vehicle',
      'transport',
      'space',
      'social',
      'ai',
      'neurotech',
      'energy',
      'government'
    )
  ),
  summary TEXT NOT NULL,
  promised_date TIMESTAMPTZ NOT NULL,
  source_url TEXT NOT NULL,
  source_label TEXT,
  source_note TEXT,
  source_published_at TIMESTAMPTZ,
  source_type TEXT NOT NULL CHECK (
    source_type IN ('official', 'news', 'blog', 'x', 'reference')
  ),
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'accepted', 'rejected')
  ),
  review_notes TEXT,
  linked_market_id TEXT REFERENCES markets(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_prediction_submissions_status_created_at
  ON agent_prediction_submissions(status, created_at);

CREATE INDEX IF NOT EXISTS idx_agent_prediction_submissions_submitted_by
  ON agent_prediction_submissions(submitted_by_agent_id, created_at DESC);
