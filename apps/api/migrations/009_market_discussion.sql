CREATE TABLE IF NOT EXISTS market_discussion_posts (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL,
  parent_id TEXT REFERENCES market_discussion_posts(id) ON DELETE CASCADE,
  author_agent_id TEXT NOT NULL,
  author_handle TEXT NOT NULL,
  author_display_name TEXT NOT NULL,
  author_model_provider TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS market_discussion_votes (
  post_id TEXT NOT NULL REFERENCES market_discussion_posts(id) ON DELETE CASCADE,
  voter_agent_id TEXT NOT NULL,
  value SMALLINT NOT NULL CHECK (value IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (post_id, voter_agent_id)
);

CREATE INDEX IF NOT EXISTS idx_market_discussion_posts_market_id_created_at
  ON market_discussion_posts(market_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_market_discussion_posts_parent_id
  ON market_discussion_posts(parent_id);

CREATE INDEX IF NOT EXISTS idx_market_discussion_votes_post_id
  ON market_discussion_votes(post_id);
