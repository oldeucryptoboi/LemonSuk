CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (
    entity_type IN (
      'company',
      'person',
      'product_line',
      'government_body',
      'creator',
      'publication'
    )
  ),
  status TEXT NOT NULL CHECK (status IN ('active', 'legacy', 'archived')),
  description TEXT,
  aliases_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  parent_entity_id TEXT REFERENCES entities(id) ON DELETE SET NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS prediction_families (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  default_resolution_mode TEXT NOT NULL,
  default_time_horizon TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS event_groups (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  family_id TEXT REFERENCES prediction_families(id) ON DELETE SET NULL,
  primary_entity_id TEXT REFERENCES entities(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  hero_market_id TEXT REFERENCES markets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS prediction_leads (
  id TEXT PRIMARY KEY,
  lead_type TEXT NOT NULL CHECK (
    lead_type IN (
      'structured_agent_lead',
      'human_url_lead',
      'system_discovery_lead'
    )
  ),
  submitted_by_agent_id TEXT REFERENCES agent_accounts(id) ON DELETE SET NULL,
  submitted_by_owner_email TEXT,
  source_url TEXT NOT NULL,
  normalized_source_url TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (
    source_type IN ('official', 'news', 'blog', 'x', 'reference')
  ),
  source_label TEXT,
  source_note TEXT,
  source_published_at TIMESTAMPTZ,
  claimed_headline TEXT,
  claimed_subject TEXT,
  claimed_category TEXT,
  family_id TEXT REFERENCES prediction_families(id) ON DELETE SET NULL,
  primary_entity_id TEXT REFERENCES entities(id) ON DELETE SET NULL,
  event_group_id TEXT REFERENCES event_groups(id) ON DELETE SET NULL,
  promised_date TIMESTAMPTZ,
  summary TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (
    status IN (
      'pending',
      'in_review',
      'accepted',
      'rejected',
      'duplicate',
      'merged',
      'escalated',
      'failed'
    )
  ),
  spam_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  duplicate_of_lead_id TEXT REFERENCES prediction_leads(id) ON DELETE SET NULL,
  duplicate_of_market_id TEXT REFERENCES markets(id) ON DELETE SET NULL,
  legacy_agent_submission_id TEXT UNIQUE
    REFERENCES agent_prediction_submissions(id) ON DELETE SET NULL,
  legacy_human_submission_id TEXT UNIQUE
    REFERENCES human_review_submissions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entities_type_status
  ON entities(entity_type, status, slug);

CREATE INDEX IF NOT EXISTS idx_prediction_families_status
  ON prediction_families(status, slug);

CREATE INDEX IF NOT EXISTS idx_event_groups_status_family
  ON event_groups(status, family_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_prediction_leads_status_created
  ON prediction_leads(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prediction_leads_family_created
  ON prediction_leads(family_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prediction_leads_agent_created
  ON prediction_leads(submitted_by_agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prediction_leads_owner_created
  ON prediction_leads(submitted_by_owner_email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prediction_leads_source_status
  ON prediction_leads(normalized_source_url, status, created_at DESC);

INSERT INTO prediction_families (
  id,
  slug,
  display_name,
  description,
  default_resolution_mode,
  default_time_horizon,
  status,
  created_at,
  updated_at
)
VALUES
  (
    'family_ai_launch',
    'ai_launch',
    'AI launches',
    'Launch, release, and availability markets for AI models, tools, and capabilities.',
    'deadline',
    '30d',
    'active',
    NOW(),
    NOW()
  ),
  (
    'family_product_ship_date',
    'product_ship_date',
    'Product ship dates',
    'Markets about products or features shipping, launching, or reaching availability by a given date.',
    'deadline',
    '30d',
    'active',
    NOW(),
    NOW()
  ),
  (
    'family_earnings_guidance',
    'earnings_guidance',
    'Earnings / guidance misses',
    'Markets about companies hitting, missing, or revising public guidance.',
    'reported_outcome',
    'quarter',
    'active',
    NOW(),
    NOW()
  ),
  (
    'family_policy_promise',
    'policy_promise',
    'Government / policy promises',
    'Markets about legislation, agency milestones, executive timelines, and public policy commitments.',
    'deadline',
    'quarter',
    'active',
    NOW(),
    NOW()
  ),
  (
    'family_ceo_claim',
    'ceo_claim',
    'Creator / CEO claims',
    'Markets based on explicit public claims from founders, CEOs, creators, and public figures.',
    'deadline',
    '30d',
    'active',
    NOW(),
    NOW()
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO entities (
  id,
  slug,
  display_name,
  entity_type,
  status,
  description,
  aliases_json,
  parent_entity_id,
  metadata_json,
  created_at,
  updated_at
)
VALUES
  ('entity_elon_musk', 'elon-musk', 'Elon Musk', 'person', 'active', 'Founder and executive tied to several recurring LemonSuk lanes.', '["musk","elon"]'::jsonb, NULL, '{}'::jsonb, NOW(), NOW()),
  ('entity_tesla', 'tesla', 'Tesla', 'company', 'active', 'Electric vehicle and energy company.', '[]'::jsonb, NULL, '{}'::jsonb, NOW(), NOW()),
  ('entity_spacex', 'spacex', 'SpaceX', 'company', 'active', 'Space launch and spacecraft company.', '["space-x"]'::jsonb, NULL, '{}'::jsonb, NOW(), NOW()),
  ('entity_x', 'x', 'X', 'company', 'active', 'Social platform formerly known as Twitter.', '["twitter","x-twitter"]'::jsonb, NULL, '{}'::jsonb, NOW(), NOW()),
  ('entity_xai', 'xai', 'xAI', 'company', 'active', 'Artificial intelligence company founded by Elon Musk.', '["x.ai"]'::jsonb, NULL, '{}'::jsonb, NOW(), NOW()),
  ('entity_neuralink', 'neuralink', 'Neuralink', 'company', 'active', 'Brain-computer interface company.', '[]'::jsonb, NULL, '{}'::jsonb, NOW(), NOW()),
  ('entity_boring', 'boring', 'Boring', 'company', 'active', 'The Boring Company.', '["the-boring-company","boring-company"]'::jsonb, NULL, '{}'::jsonb, NOW(), NOW()),
  ('entity_solarcity', 'solarcity', 'SolarCity', 'company', 'legacy', 'Legacy solar company associated with Musk and Tesla.', '[]'::jsonb, NULL, '{}'::jsonb, NOW(), NOW()),
  ('entity_hyperloop', 'hyperloop', 'Hyperloop', 'product_line', 'legacy', 'Transport concept associated with Musk.', '[]'::jsonb, NULL, '{}'::jsonb, NOW(), NOW()),
  ('entity_doge', 'doge', 'DOGE', 'government_body', 'active', 'Department of Government Efficiency claims and targets.', '[]'::jsonb, NULL, '{}'::jsonb, NOW(), NOW()),
  ('entity_apple', 'apple', 'Apple', 'company', 'active', 'Consumer hardware and software company.', '[]'::jsonb, NULL, '{}'::jsonb, NOW(), NOW()),
  ('entity_openai', 'openai', 'OpenAI', 'company', 'active', 'AI research and product company.', '[]'::jsonb, NULL, '{}'::jsonb, NOW(), NOW()),
  ('entity_anthropic', 'anthropic', 'Anthropic', 'company', 'active', 'AI model company behind Claude.', '[]'::jsonb, NULL, '{}'::jsonb, NOW(), NOW()),
  ('entity_meta', 'meta', 'Meta', 'company', 'active', 'Technology company behind Facebook, Instagram, and Meta AI.', '["facebook"]'::jsonb, NULL, '{}'::jsonb, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
