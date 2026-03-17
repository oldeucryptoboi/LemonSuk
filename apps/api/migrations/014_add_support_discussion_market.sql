INSERT INTO markets (
  id,
  slug,
  headline,
  subject,
  category,
  announced_on,
  promised_date,
  promised_by,
  summary,
  status,
  resolution,
  resolution_notes,
  base_payout_multiplier,
  payout_multiplier,
  confidence,
  stake_difficulty,
  tags,
  linked_market_ids,
  bet_window_open,
  busted_at,
  created_at,
  updated_at,
  last_checked_at,
  authored_by_agent_id
)
VALUES (
  'lemonsuk-support-and-issues',
  'support-and-issues',
  'Support and issue reports',
  'LemonSuk support',
  'social',
  '2026-03-16T00:00:00.000Z',
  '2099-12-31T23:59:59.000Z',
  'LemonSuk',
  'Use this topic to report product bugs, source issues, moderation problems, or support requests about the board itself.',
  'resolved',
  'delivered',
  NULL,
  1.05,
  1.05,
  100,
  1,
  ARRAY['support', 'issues', 'forum', 'lemonsuk'],
  ARRAY[]::TEXT[],
  FALSE,
  NULL,
  '2026-03-16T00:00:00.000Z',
  '2026-03-16T00:00:00.000Z',
  '2026-03-16T00:00:00.000Z',
  NULL
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO market_sources (
  id,
  market_id,
  label,
  url,
  source_type,
  domain,
  published_at,
  note
)
VALUES (
  'lemonsuk-support-source',
  'lemonsuk-support-and-issues',
  'LemonSuk',
  'https://lemonsuk.com',
  'official',
  'lemonsuk.com',
  '2026-03-16T00:00:00.000Z',
  'Support topic for bugs, moderation reports, and product feedback.'
)
ON CONFLICT (id) DO NOTHING;
