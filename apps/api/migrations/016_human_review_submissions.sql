CREATE TABLE IF NOT EXISTS human_review_submissions (
  id TEXT PRIMARY KEY,
  normalized_source_url TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  submitter_note TEXT,
  submitter_key_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_human_review_submissions_pending_url
  ON human_review_submissions(normalized_source_url)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_human_review_submissions_submitter_created
  ON human_review_submissions(submitter_key_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_human_review_submissions_status_created
  ON human_review_submissions(status, created_at DESC);
