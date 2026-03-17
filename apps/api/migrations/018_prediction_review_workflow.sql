ALTER TABLE agent_prediction_submissions
  DROP CONSTRAINT IF EXISTS agent_prediction_submissions_status_check;

ALTER TABLE agent_prediction_submissions
  DROP CONSTRAINT IF EXISTS agent_prediction_submissions_constraint_3;

ALTER TABLE agent_prediction_submissions
  ADD CONSTRAINT agent_prediction_submissions_status_check CHECK (
    status IN (
      'pending',
      'in_review',
      'accepted',
      'rejected',
      'escalated',
      'failed'
    )
  );

CREATE TABLE IF NOT EXISTS prediction_review_results (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL
    REFERENCES agent_prediction_submissions(id) ON DELETE CASCADE,
  reviewer TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (
    verdict IN ('accept', 'reject', 'escalate')
  ),
  confidence DOUBLE PRECISION NOT NULL,
  summary TEXT NOT NULL,
  evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  snapshot_ref TEXT,
  needs_human_review BOOLEAN NOT NULL DEFAULT FALSE,
  run_id TEXT NOT NULL,
  provider_run_id TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prediction_review_results_run_id
  ON prediction_review_results(run_id);

CREATE INDEX IF NOT EXISTS idx_prediction_review_results_submission_id
  ON prediction_review_results(submission_id, created_at DESC);

CREATE TABLE IF NOT EXISTS prediction_review_audit_log (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL
    REFERENCES agent_prediction_submissions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prediction_review_audit_log_submission_id
  ON prediction_review_audit_log(submission_id, created_at DESC);
