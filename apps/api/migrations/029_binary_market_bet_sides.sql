ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS bet_mode TEXT NOT NULL DEFAULT 'against_only';

UPDATE markets
SET bet_mode = 'against_only'
WHERE bet_mode IS NULL;

ALTER TABLE markets
  DROP CONSTRAINT IF EXISTS markets_bet_mode_check;

ALTER TABLE markets
  ADD CONSTRAINT markets_bet_mode_check
  CHECK (bet_mode IN ('against_only', 'binary'));

ALTER TABLE bets
  DROP CONSTRAINT IF EXISTS bets_side_check;

ALTER TABLE bets
  ADD CONSTRAINT bets_side_check
  CHECK (side IN ('for', 'against'));
