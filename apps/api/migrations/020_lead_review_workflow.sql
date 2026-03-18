ALTER TABLE prediction_leads
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

ALTER TABLE prediction_leads
  ADD COLUMN IF NOT EXISTS linked_market_id TEXT
    REFERENCES markets(id) ON DELETE SET NULL;

ALTER TABLE prediction_leads
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_prediction_leads_linked_market
  ON prediction_leads(linked_market_id);

ALTER TABLE human_review_submissions
  DROP CONSTRAINT IF EXISTS human_review_submissions_status_check;

ALTER TABLE human_review_submissions
  DROP CONSTRAINT IF EXISTS human_review_submissions_constraint_1;

ALTER TABLE human_review_submissions
  ADD CONSTRAINT human_review_submissions_status_check CHECK (
    status IN (
      'pending',
      'in_review',
      'accepted',
      'rejected',
      'escalated',
      'failed'
    )
  );

ALTER TABLE prediction_review_results
  ADD COLUMN IF NOT EXISTS lead_id TEXT
    REFERENCES prediction_leads(id) ON DELETE CASCADE;

ALTER TABLE prediction_review_results
  ALTER COLUMN submission_id DROP NOT NULL;

UPDATE prediction_review_results
SET lead_id = prediction_leads.id
FROM prediction_leads
WHERE prediction_leads.legacy_agent_submission_id =
    prediction_review_results.submission_id
  AND prediction_review_results.lead_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_prediction_review_results_lead_id
  ON prediction_review_results(lead_id, created_at DESC);

ALTER TABLE prediction_review_audit_log
  ADD COLUMN IF NOT EXISTS lead_id TEXT
    REFERENCES prediction_leads(id) ON DELETE CASCADE;

ALTER TABLE prediction_review_audit_log
  ALTER COLUMN submission_id DROP NOT NULL;

UPDATE prediction_review_audit_log
SET lead_id = prediction_leads.id
FROM prediction_leads
WHERE prediction_leads.legacy_agent_submission_id =
    prediction_review_audit_log.submission_id
  AND prediction_review_audit_log.lead_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_prediction_review_audit_log_lead_id
  ON prediction_review_audit_log(lead_id, created_at DESC);
