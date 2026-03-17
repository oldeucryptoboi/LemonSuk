ALTER TABLE human_review_submissions
  ADD COLUMN IF NOT EXISTS owner_email TEXT;

CREATE INDEX IF NOT EXISTS idx_human_review_submissions_owner_created
  ON human_review_submissions(owner_email, created_at DESC);

ALTER TABLE agent_prediction_submissions
  ADD COLUMN IF NOT EXISTS normalized_source_url TEXT;

UPDATE agent_prediction_submissions
SET normalized_source_url = source_url
WHERE normalized_source_url IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_prediction_submissions_pending_source
  ON agent_prediction_submissions(status, normalized_source_url);
