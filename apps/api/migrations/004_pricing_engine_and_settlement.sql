ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS base_payout_multiplier NUMERIC(10, 2);

UPDATE markets
SET base_payout_multiplier = payout_multiplier
WHERE base_payout_multiplier IS NULL;

ALTER TABLE markets
  ALTER COLUMN base_payout_multiplier SET NOT NULL;

ALTER TABLE bets
  ADD COLUMN IF NOT EXISTS settled_payout_credits NUMERIC(12, 2);

UPDATE bets
SET settled_payout_credits = CASE
  WHEN status = 'won' THEN projected_payout_credits
  WHEN status = 'lost' THEN 0
  ELSE NULL
END
WHERE settled_payout_credits IS NULL;
