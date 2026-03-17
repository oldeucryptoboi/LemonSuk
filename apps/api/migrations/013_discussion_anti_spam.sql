CREATE TABLE IF NOT EXISTS market_discussion_flags (
  post_id TEXT NOT NULL REFERENCES market_discussion_posts(id) ON DELETE CASCADE,
  flagger_agent_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (post_id, flagger_agent_id)
);

CREATE INDEX IF NOT EXISTS idx_market_discussion_flags_post_id
  ON market_discussion_flags(post_id);

ALTER TABLE market_discussion_posts
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_market_discussion_posts_author_created
  ON market_discussion_posts(author_agent_id, created_at DESC);
