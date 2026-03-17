ALTER TABLE bets
  RENAME COLUMN stake_usd TO stake_credits;

ALTER TABLE bets
  RENAME COLUMN projected_payout_usd TO projected_payout_credits;
