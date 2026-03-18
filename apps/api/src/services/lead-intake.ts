import { randomUUID } from 'node:crypto'

import type { PoolClient } from 'pg'

import type {
  AgentPredictionSubmissionInput,
  AgentProfile,
  Category,
  HumanReviewSubmissionInput,
  InternalPredictionLeadDetail,
  PredictionLead,
  PredictionLeadQueue,
  SourceType,
} from '../shared'
import {
  eventGroupSchema,
  internalPredictionLeadDetailSchema,
  predictionLeadSchema,
  predictionLeadQueueSchema,
  predictionFamilySchema,
  entitySchema,
  predictionReviewResultSchema,
} from '../shared'
import { withDatabaseClient } from './database'
import { domainFromUrl, normalizeSourceUrl, toIso } from './utils'
import { inferSourceType } from './source-type'

const predictionFamilyIds = {
  ai_launch: 'family_ai_launch',
  product_ship_date: 'family_product_ship_date',
  earnings_guidance: 'family_earnings_guidance',
  policy_promise: 'family_policy_promise',
  ceo_claim: 'family_ceo_claim',
} as const

const entityIds = {
  'elon-musk': 'entity_elon_musk',
  tesla: 'entity_tesla',
  spacex: 'entity_spacex',
  x: 'entity_x',
  xai: 'entity_xai',
  neuralink: 'entity_neuralink',
  boring: 'entity_boring',
  solarcity: 'entity_solarcity',
  hyperloop: 'entity_hyperloop',
  doge: 'entity_doge',
  apple: 'entity_apple',
  openai: 'entity_openai',
  anthropic: 'entity_anthropic',
  meta: 'entity_meta',
} as const

const predictionFamilySeeds = [
  {
    id: predictionFamilyIds.ai_launch,
    slug: 'ai_launch',
    displayName: 'AI launches',
    description:
      'Launch, release, and availability markets for AI models, tools, and capabilities.',
    defaultResolutionMode: 'deadline',
    defaultTimeHorizon: '30d',
    status: 'active',
  },
  {
    id: predictionFamilyIds.product_ship_date,
    slug: 'product_ship_date',
    displayName: 'Product ship dates',
    description:
      'Markets about products or features shipping, launching, or reaching availability by a given date.',
    defaultResolutionMode: 'deadline',
    defaultTimeHorizon: '30d',
    status: 'active',
  },
  {
    id: predictionFamilyIds.earnings_guidance,
    slug: 'earnings_guidance',
    displayName: 'Earnings / guidance misses',
    description:
      'Markets about companies hitting, missing, or revising public guidance.',
    defaultResolutionMode: 'reported_outcome',
    defaultTimeHorizon: 'quarter',
    status: 'active',
  },
  {
    id: predictionFamilyIds.policy_promise,
    slug: 'policy_promise',
    displayName: 'Government / policy promises',
    description:
      'Markets about legislation, agency milestones, executive timelines, and public policy commitments.',
    defaultResolutionMode: 'deadline',
    defaultTimeHorizon: 'quarter',
    status: 'active',
  },
  {
    id: predictionFamilyIds.ceo_claim,
    slug: 'ceo_claim',
    displayName: 'Creator / CEO claims',
    description:
      'Markets based on explicit public claims from founders, CEOs, creators, and public figures.',
    defaultResolutionMode: 'deadline',
    defaultTimeHorizon: '30d',
    status: 'active',
  },
] as const

const entitySeeds = [
  {
    id: entityIds['elon-musk'],
    slug: 'elon-musk',
    displayName: 'Elon Musk',
    entityType: 'person',
    status: 'active',
    description: 'Founder and executive tied to several recurring LemonSuk lanes.',
    aliases: ['musk', 'elon'],
  },
  {
    id: entityIds.tesla,
    slug: 'tesla',
    displayName: 'Tesla',
    entityType: 'company',
    status: 'active',
    description: 'Electric vehicle and energy company.',
    aliases: [],
  },
  {
    id: entityIds.spacex,
    slug: 'spacex',
    displayName: 'SpaceX',
    entityType: 'company',
    status: 'active',
    description: 'Space launch and spacecraft company.',
    aliases: ['space-x'],
  },
  {
    id: entityIds.x,
    slug: 'x',
    displayName: 'X',
    entityType: 'company',
    status: 'active',
    description: 'Social platform formerly known as Twitter.',
    aliases: ['twitter', 'x-twitter'],
  },
  {
    id: entityIds.xai,
    slug: 'xai',
    displayName: 'xAI',
    entityType: 'company',
    status: 'active',
    description: 'Artificial intelligence company founded by Elon Musk.',
    aliases: ['x.ai'],
  },
  {
    id: entityIds.neuralink,
    slug: 'neuralink',
    displayName: 'Neuralink',
    entityType: 'company',
    status: 'active',
    description: 'Brain-computer interface company.',
    aliases: [],
  },
  {
    id: entityIds.boring,
    slug: 'boring',
    displayName: 'Boring',
    entityType: 'company',
    status: 'active',
    description: 'The Boring Company.',
    aliases: ['the-boring-company', 'boring-company'],
  },
  {
    id: entityIds.solarcity,
    slug: 'solarcity',
    displayName: 'SolarCity',
    entityType: 'company',
    status: 'legacy',
    description: 'Legacy solar company associated with Musk and Tesla.',
    aliases: [],
  },
  {
    id: entityIds.hyperloop,
    slug: 'hyperloop',
    displayName: 'Hyperloop',
    entityType: 'product_line',
    status: 'legacy',
    description: 'Transport concept associated with Musk.',
    aliases: [],
  },
  {
    id: entityIds.doge,
    slug: 'doge',
    displayName: 'DOGE',
    entityType: 'government_body',
    status: 'active',
    description: 'Department of Government Efficiency claims and targets.',
    aliases: [],
  },
  {
    id: entityIds.apple,
    slug: 'apple',
    displayName: 'Apple',
    entityType: 'company',
    status: 'active',
    description: 'Consumer hardware and software company.',
    aliases: [],
  },
  {
    id: entityIds.openai,
    slug: 'openai',
    displayName: 'OpenAI',
    entityType: 'company',
    status: 'active',
    description: 'AI research and product company.',
    aliases: [],
  },
  {
    id: entityIds.anthropic,
    slug: 'anthropic',
    displayName: 'Anthropic',
    entityType: 'company',
    status: 'active',
    description: 'AI model company behind Claude.',
    aliases: [],
  },
  {
    id: entityIds.meta,
    slug: 'meta',
    displayName: 'Meta',
    entityType: 'company',
    status: 'active',
    description: 'Technology company behind Facebook, Instagram, and Meta AI.',
    aliases: ['facebook'],
  },
] as const

const eventGroupSeeds = [
  {
    id: 'group_musk_deadline_board',
    slug: 'musk-deadline-board',
    title: 'Musk deadline board',
    description:
      'Flagship board for Elon-linked delivery claims, launches, and deadline promises.',
    familyId: predictionFamilyIds.ceo_claim,
    primaryEntityId: entityIds['elon-musk'],
    status: 'active',
  },
  {
    id: 'group_doge_savings_watch',
    slug: 'doge-savings-watch',
    title: 'DOGE savings watch',
    description:
      'Government-efficiency promises and savings targets tied to DOGE.',
    familyId: predictionFamilyIds.policy_promise,
    primaryEntityId: entityIds.doge,
    status: 'active',
  },
  {
    id: 'group_apple_launch_calendar',
    slug: 'apple-launch-calendar',
    title: 'Apple launch calendar',
    description:
      'Apple hardware, software, and feature shipping windows gathered into one product lane.',
    familyId: predictionFamilyIds.product_ship_date,
    primaryEntityId: entityIds.apple,
    status: 'active',
  },
  {
    id: 'group_openai_release_radar',
    slug: 'openai-release-radar',
    title: 'OpenAI release radar',
    description:
      'OpenAI launch, release, and availability predictions reviewed into one group.',
    familyId: predictionFamilyIds.ai_launch,
    primaryEntityId: entityIds.openai,
    status: 'active',
  },
  {
    id: 'group_anthropic_release_radar',
    slug: 'anthropic-release-radar',
    title: 'Anthropic release radar',
    description:
      'Claude and Anthropic launch predictions grouped for a shorter-horizon AI lane.',
    familyId: predictionFamilyIds.ai_launch,
    primaryEntityId: entityIds.anthropic,
    status: 'active',
  },
  {
    id: 'group_meta_ai_watch',
    slug: 'meta-ai-watch',
    title: 'Meta AI watch',
    description:
      'Meta AI launches, feature promises, and public roadmap claims.',
    familyId: predictionFamilyIds.ai_launch,
    primaryEntityId: entityIds.meta,
    status: 'active',
  },
  {
    id: 'group_general_board_watch',
    slug: 'general-board-watch',
    title: 'General board watch',
    description: null,
    familyId: null,
    primaryEntityId: null,
    status: 'draft',
  },
] as const

type PredictionLeadRow = {
  id: string
  lead_type: PredictionLead['leadType']
  submitted_by_agent_id: string | null
  submitted_by_owner_email: string | null
  source_url: string
  normalized_source_url: string
  source_domain: string
  source_type: SourceType
  source_label: string | null
  source_note: string | null
  source_published_at: Date | null
  claimed_headline: string | null
  claimed_subject: string | null
  claimed_category: string | null
  family_id: string | null
  family_slug: string | null
  family_display_name: string | null
  primary_entity_id: string | null
  primary_entity_slug: string | null
  primary_entity_display_name: string | null
  event_group_id: string | null
  promised_date: Date | null
  summary: string | null
  tags: string[]
  status: PredictionLead['status']
  spam_score: number
  duplicate_of_lead_id: string | null
  duplicate_of_market_id: string | null
  review_notes: string | null
  linked_market_id: string | null
  reviewed_at: Date | null
  legacy_agent_submission_id: string | null
  legacy_human_submission_id: string | null
  created_at: Date
  updated_at: Date
}

type PredictionLeadInboxFilters = {
  limit?: number
  leadType?: PredictionLead['leadType']
  familySlug?: PredictionLead['familySlug']
  entitySlug?: string
  sourceDomain?: string
}

type PredictionReviewResultRow = {
  id: string
  lead_id: string | null
  submission_id: string | null
  reviewer: string
  verdict: 'accept' | 'reject' | 'escalate'
  confidence: number
  summary: string
  evidence_json: {
    url: string
    excerpt: string
  }[]
  snapshot_ref: string | null
  needs_human_review: boolean
  run_id: string
  provider_run_id: string | null
  created_at: Date
}

function familyIdForCategory(category: Category): string {
  switch (category) {
    case 'ai':
      return predictionFamilyIds.ai_launch
    case 'government':
      return predictionFamilyIds.policy_promise
    case 'vehicle':
    case 'consumer_hardware':
    case 'software_release':
    case 'developer_tool':
    case 'robotaxi':
    case 'robotics':
    case 'autonomy':
    case 'transport':
    case 'space':
    case 'neurotech':
    case 'energy':
      return predictionFamilyIds.product_ship_date
    case 'social':
    default:
      return predictionFamilyIds.ceo_claim
  }
}

function inferEntityId(input: {
  headline?: string
  subject?: string
  summary?: string
  sourceUrl: string
  tags?: string[]
}): string | null {
  const haystack = [
    input.headline,
    input.subject,
    input.summary,
    ...(input.tags ?? []),
    input.sourceUrl,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (haystack.includes('anthropic') || haystack.includes('claude')) {
    return entityIds.anthropic
  }

  if (haystack.includes('openai') || haystack.includes('chatgpt')) {
    return entityIds.openai
  }

  if (haystack.includes('apple') || haystack.includes('iphone')) {
    return entityIds.apple
  }

  if (haystack.includes('tesla')) {
    return entityIds.tesla
  }

  if (haystack.includes('spacex') || haystack.includes('starship')) {
    return entityIds.spacex
  }

  if (haystack.includes('xai') || haystack.includes('grok')) {
    return entityIds.xai
  }

  if (haystack.includes('neuralink')) {
    return entityIds.neuralink
  }

  if (haystack.includes('boring')) {
    return entityIds.boring
  }

  if (haystack.includes('solarcity')) {
    return entityIds.solarcity
  }

  if (haystack.includes('hyperloop')) {
    return entityIds.hyperloop
  }

  if (haystack.includes('doge')) {
    return entityIds.doge
  }

  if (haystack.includes('meta') || haystack.includes('facebook')) {
    return entityIds.meta
  }

  if (haystack.includes('twitter') || haystack.includes('x.com')) {
    return entityIds.x
  }

  if (haystack.includes('elon')) {
    return entityIds['elon-musk']
  }

  return null
}

export async function ensureCatalogFoundations(
  client: PoolClient,
  now: Date,
): Promise<void> {
  const nowIso = toIso(now)

  for (const family of predictionFamilySeeds) {
    const parsed = predictionFamilySchema.parse(family)
    await client.query(
      `
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        parsed.id,
        parsed.slug,
        parsed.displayName,
        parsed.description,
        parsed.defaultResolutionMode,
        parsed.defaultTimeHorizon,
        parsed.status,
        nowIso,
      ],
    )
  }

  for (const entity of entitySeeds) {
    const parsed = entitySchema.parse(entity)
    await client.query(
      `
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
        VALUES (
          $1, $2, $3, $4, $5, $6, $7::jsonb, NULL, '{}'::jsonb, $8, $8
        )
        ON CONFLICT (id) DO NOTHING
      `,
      [
        parsed.id,
        parsed.slug,
        parsed.displayName,
        parsed.entityType,
        parsed.status,
        entity.description,
        JSON.stringify(parsed.aliases),
        nowIso,
      ],
    )
  }

  for (const group of eventGroupSeeds) {
    const parsed = eventGroupSchema.parse(group)
    await client.query(
      `
        INSERT INTO event_groups (
          id,
          slug,
          title,
          description,
          family_id,
          primary_entity_id,
          status,
          start_at,
          end_at,
          hero_market_id,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          NULL, NULL, NULL, $8, $8
        )
        ON CONFLICT (id) DO NOTHING
      `,
      [
        parsed.id,
        parsed.slug,
        parsed.title,
        parsed.description ?? null,
        parsed.familyId ?? null,
        parsed.primaryEntityId ?? null,
        parsed.status,
        nowIso,
      ],
    )
  }
}

async function readLeadRowById(
  client: PoolClient,
  leadId: string,
): Promise<PredictionLeadRow | null> {
  const result = await client.query<PredictionLeadRow>(
    `
      SELECT
        leads.*,
        families.slug AS family_slug,
        families.display_name AS family_display_name,
        entities.slug AS primary_entity_slug,
        entities.display_name AS primary_entity_display_name
      FROM prediction_leads leads
      LEFT JOIN prediction_families families
        ON families.id = leads.family_id
      LEFT JOIN entities
        ON entities.id = leads.primary_entity_id
      WHERE leads.id = $1
    `,
    [leadId],
  )

  return result.rows[0] ?? null
}

function mapLead(row: PredictionLeadRow): PredictionLead {
  return predictionLeadSchema.parse({
    id: row.id,
    leadType: row.lead_type,
    submittedByAgentId: row.submitted_by_agent_id,
    submittedByOwnerEmail: row.submitted_by_owner_email,
    sourceUrl: row.source_url,
    normalizedSourceUrl: row.normalized_source_url,
    sourceDomain: row.source_domain,
    sourceType: row.source_type,
    sourceLabel: row.source_label,
    sourceNote: row.source_note,
    sourcePublishedAt: row.source_published_at?.toISOString() ?? null,
    claimedHeadline: row.claimed_headline,
    claimedSubject: row.claimed_subject,
    claimedCategory: row.claimed_category,
    familyId: row.family_id,
    familySlug: row.family_slug,
    familyDisplayName: row.family_display_name,
    primaryEntityId: row.primary_entity_id,
    primaryEntitySlug: row.primary_entity_slug,
    primaryEntityDisplayName: row.primary_entity_display_name,
    eventGroupId: row.event_group_id,
    promisedDate: row.promised_date?.toISOString() ?? null,
    summary: row.summary,
    tags: row.tags,
    status: row.status,
    spamScore: row.spam_score,
    duplicateOfLeadId: row.duplicate_of_lead_id,
    duplicateOfMarketId: row.duplicate_of_market_id,
    reviewNotes: row.review_notes,
    linkedMarketId: row.linked_market_id,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    legacyAgentSubmissionId: row.legacy_agent_submission_id,
    legacyHumanSubmissionId: row.legacy_human_submission_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  })
}

function mapReviewResult(row: PredictionReviewResultRow) {
  return predictionReviewResultSchema.parse({
    runId: row.run_id,
    leadId: row.lead_id,
    submissionId: row.submission_id,
    reviewer: row.reviewer,
    verdict: row.verdict,
    confidence: row.confidence,
    summary: row.summary,
    evidence: row.evidence_json,
    needsHumanReview: row.needs_human_review,
    snapshotRef: row.snapshot_ref,
    providerRunId: row.provider_run_id,
    createdAt: row.created_at.toISOString(),
  })
}

function buildLeadInboxFilterSql(
  filters: PredictionLeadInboxFilters,
): {
  whereSql: string
  params: (string | number)[]
} {
  const clauses = [`leads.status = 'pending'`]
  const params: (string | number)[] = []

  if (filters.leadType) {
    params.push(filters.leadType)
    clauses.push(`leads.lead_type = $${params.length}`)
  }

  if (filters.familySlug) {
    params.push(filters.familySlug)
    clauses.push(`families.slug = $${params.length}`)
  }

  if (filters.entitySlug) {
    params.push(filters.entitySlug)
    clauses.push(`entities.slug = $${params.length}`)
  }

  if (filters.sourceDomain) {
    params.push(filters.sourceDomain.trim().toLowerCase())
    clauses.push(`leads.source_domain = $${params.length}`)
  }

  return {
    whereSql: clauses.join('\n        AND '),
    params,
  }
}

export async function readPredictionLeadById(
  leadId: string,
): Promise<PredictionLead | null> {
  return withDatabaseClient((client) => readPredictionLeadByIdFromClient(client, leadId))
}

export async function readPredictionLeadByIdFromClient(
  client: PoolClient,
  leadId: string,
): Promise<PredictionLead | null> {
  const row = await readLeadRowById(client, leadId)
  return row ? mapLead(row) : null
}

export async function readPendingPredictionLeads(
  options: number | PredictionLeadInboxFilters = 25,
): Promise<PredictionLeadQueue> {
  return withDatabaseClient((client) =>
    readPendingPredictionLeadsFromClient(client, options),
  )
}

export async function readPendingPredictionLeadsFromClient(
  client: PoolClient,
  options: number | PredictionLeadInboxFilters = 25,
): Promise<PredictionLeadQueue> {
  const filters =
    typeof options === 'number' ? { limit: options } : options
  const safeLimit = Math.max(1, Math.min(Math.trunc(filters.limit ?? 25), 100))
  const { whereSql, params } = buildLeadInboxFilterSql(filters)
  const [countResult, rowsResult] = await Promise.all([
    client.query<{ count: number }>(
      `
        SELECT COUNT(*)::int AS count
        FROM prediction_leads leads
        LEFT JOIN prediction_families families
          ON families.id = leads.family_id
        LEFT JOIN entities
          ON entities.id = leads.primary_entity_id
        WHERE ${whereSql}
      `,
      params,
    ),
    client.query<PredictionLeadRow>(
      `
        SELECT
          leads.*,
          families.slug AS family_slug,
          families.display_name AS family_display_name,
          entities.slug AS primary_entity_slug,
          entities.display_name AS primary_entity_display_name
        FROM prediction_leads leads
        LEFT JOIN prediction_families families
          ON families.id = leads.family_id
        LEFT JOIN entities
          ON entities.id = leads.primary_entity_id
        WHERE ${whereSql}
        ORDER BY leads.created_at ASC
        LIMIT $${params.length + 1}
      `,
      [...params, safeLimit],
    ),
  ])

  return predictionLeadQueueSchema.parse({
    pendingCount: countResult.rows[0]?.count ?? 0,
    items: rowsResult.rows.map(mapLead),
  })
}

export async function readPredictionLeadInspection(
  leadId: string,
): Promise<InternalPredictionLeadDetail | null> {
  return withDatabaseClient((client) =>
    readPredictionLeadInspectionFromClient(client, leadId),
  )
}

export async function readPredictionLeadInspectionFromClient(
  client: PoolClient,
  leadId: string,
): Promise<InternalPredictionLeadDetail | null> {
  const lead = await readPredictionLeadByIdFromClient(client, leadId)
  if (!lead) {
    return null
  }

  const siblingLimit = 6
  const reviewLimit = 5
  const identityParams = [
    leadId,
    lead.normalizedSourceUrl,
    lead.sourceDomain,
    lead.primaryEntityId,
    lead.familyId,
    siblingLimit,
  ]
  const siblingWhere = `
      leads.id <> $1
      AND (
        leads.normalized_source_url = $2
        OR leads.source_domain = $3
        OR ($4::text IS NOT NULL AND leads.primary_entity_id = $4::text)
        OR ($5::text IS NOT NULL AND leads.family_id = $5::text)
      )
  `

  const [relatedPendingResult, reviewedResult, reviewResults] = await Promise.all([
    client.query<PredictionLeadRow>(
      `
        SELECT
          leads.*,
          families.slug AS family_slug,
          families.display_name AS family_display_name,
          entities.slug AS primary_entity_slug,
          entities.display_name AS primary_entity_display_name
        FROM prediction_leads leads
        LEFT JOIN prediction_families families
          ON families.id = leads.family_id
        LEFT JOIN entities
          ON entities.id = leads.primary_entity_id
        WHERE ${siblingWhere}
          AND leads.status = 'pending'
        ORDER BY leads.created_at DESC
        LIMIT $6
      `,
      identityParams,
    ),
    client.query<PredictionLeadRow>(
      `
        SELECT
          leads.*,
          families.slug AS family_slug,
          families.display_name AS family_display_name,
          entities.slug AS primary_entity_slug,
          entities.display_name AS primary_entity_display_name
        FROM prediction_leads leads
        LEFT JOIN prediction_families families
          ON families.id = leads.family_id
        LEFT JOIN entities
          ON entities.id = leads.primary_entity_id
        WHERE ${siblingWhere}
          AND leads.status <> 'pending'
        ORDER BY leads.updated_at DESC
        LIMIT $6
      `,
      identityParams,
    ),
    client.query<PredictionReviewResultRow>(
      `
        SELECT *
        FROM prediction_review_results
        WHERE lead_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [leadId, reviewLimit],
    ),
  ])

  return internalPredictionLeadDetailSchema.parse({
    lead: {
      ...lead,
      submittedBy: null,
    },
    relatedPendingLeads: relatedPendingResult.rows.map(mapLead),
    recentReviewedLeads: reviewedResult.rows.map(mapLead),
    recentReviewResults: reviewResults.rows.map(mapReviewResult),
  })
}

export async function createAgentLeadFromSubmission(
  client: PoolClient,
  input: {
    agent: AgentProfile
    submissionId?: string | null
    submission: AgentPredictionSubmissionInput
    sourceType?: SourceType
    normalizedSourceUrl?: string
    now?: Date
  },
): Promise<PredictionLead> {
  const now = input.now ?? new Date()
  const nowIso = toIso(now)
  const familyId = familyIdForCategory(input.submission.category)
  const entityId = inferEntityId({
    headline: input.submission.headline,
    subject: input.submission.subject,
    summary: input.submission.summary,
    sourceUrl: input.submission.sourceUrl,
    tags: input.submission.tags,
  })
  const normalizedSourceUrl =
    input.normalizedSourceUrl ?? normalizeSourceUrl(input.submission.sourceUrl)
  const sourceType = input.sourceType ?? inferSourceType(input.submission.sourceUrl)
  const leadId = `lead_${randomUUID().replace(/-/g, '')}`

  await ensureCatalogFoundations(client, now)

  await client.query(
    `
      INSERT INTO prediction_leads (
        id,
        lead_type,
        submitted_by_agent_id,
        submitted_by_owner_email,
        source_url,
        normalized_source_url,
        source_domain,
        source_type,
        source_label,
        source_note,
        source_published_at,
        claimed_headline,
        claimed_subject,
        claimed_category,
        family_id,
        primary_entity_id,
        event_group_id,
        promised_date,
        summary,
        tags,
        status,
        spam_score,
        duplicate_of_lead_id,
        duplicate_of_market_id,
        legacy_agent_submission_id,
        legacy_human_submission_id,
        created_at,
        updated_at
      )
      VALUES (
        $1, 'structured_agent_lead', $2, NULL,
        $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, NULL,
        $15, $16, $17, 'pending', 0,
        NULL, NULL, $18, NULL, $19, $19
      )
    `,
    [
      leadId,
      input.agent.id,
      input.submission.sourceUrl,
      normalizedSourceUrl,
      domainFromUrl(normalizedSourceUrl),
      sourceType,
      input.submission.sourceLabel?.trim() || domainFromUrl(input.submission.sourceUrl),
      input.submission.sourceNote?.trim() || null,
      input.submission.sourcePublishedAt ?? null,
      input.submission.headline.trim(),
      input.submission.subject.trim(),
      input.submission.category,
      familyId,
      entityId,
      input.submission.promisedDate,
      input.submission.summary.trim(),
      input.submission.tags,
      input.submissionId ?? null,
      nowIso,
    ],
  )

  const row = await readLeadRowById(client, leadId)
  if (!row) {
    throw new Error('Queued lead could not be reloaded.')
  }

  return mapLead(row)
}

export async function createHumanLeadFromSubmission(
  client: PoolClient,
  input: {
    ownerEmail: string
    submissionId?: string | null
    submission: HumanReviewSubmissionInput
    now?: Date
  },
): Promise<PredictionLead> {
  const now = input.now ?? new Date()
  const nowIso = toIso(now)
  const normalizedSourceUrl = normalizeSourceUrl(input.submission.sourceUrl)
  const sourceType = inferSourceType(input.submission.sourceUrl)
  const entityId = inferEntityId({
    sourceUrl: input.submission.sourceUrl,
    summary: input.submission.note,
  })
  const leadId = `lead_${randomUUID().replace(/-/g, '')}`

  await ensureCatalogFoundations(client, now)

  await client.query(
    `
      INSERT INTO prediction_leads (
        id,
        lead_type,
        submitted_by_agent_id,
        submitted_by_owner_email,
        source_url,
        normalized_source_url,
        source_domain,
        source_type,
        source_label,
        source_note,
        source_published_at,
        claimed_headline,
        claimed_subject,
        claimed_category,
        family_id,
        primary_entity_id,
        event_group_id,
        promised_date,
        summary,
        tags,
        status,
        spam_score,
        duplicate_of_lead_id,
        duplicate_of_market_id,
        legacy_agent_submission_id,
        legacy_human_submission_id,
        created_at,
        updated_at
      )
      VALUES (
        $1, 'human_url_lead', NULL, $2,
        $3, $4, $5, $6, $7, $8, NULL,
        NULL, NULL, NULL, NULL, $9, NULL,
        NULL, NULL, '{}', 'pending', 0,
        NULL, NULL, NULL, $10, $11, $11
      )
    `,
    [
      leadId,
      input.ownerEmail.trim().toLowerCase(),
      input.submission.sourceUrl,
      normalizedSourceUrl,
      domainFromUrl(normalizedSourceUrl),
      sourceType,
      domainFromUrl(input.submission.sourceUrl),
      input.submission.note?.trim() || null,
      entityId,
      input.submissionId ?? null,
      nowIso,
    ],
  )

  const row = await readLeadRowById(client, leadId)
  if (!row) {
    throw new Error('Queued lead could not be reloaded.')
  }

  return mapLead(row)
}

export async function syncLeadStatusForLegacyAgentSubmission(
  client: PoolClient,
  input: {
    submissionId: string
    status: PredictionLead['status']
    reviewNotes?: string | null
    linkedMarketId?: string | null
    updatedAt?: Date
  },
): Promise<void> {
  const updatedAt = input.updatedAt ?? new Date()
  await client.query(
    `
      UPDATE prediction_leads
      SET
        status = $2,
        review_notes = COALESCE($3, review_notes),
        linked_market_id = COALESCE($4, linked_market_id),
        duplicate_of_market_id = COALESCE($4, duplicate_of_market_id),
        reviewed_at = CASE
          WHEN $2 IN ('accepted', 'rejected', 'duplicate', 'merged', 'escalated', 'failed')
            THEN COALESCE(reviewed_at, $5)
          ELSE reviewed_at
        END,
        updated_at = $5
      WHERE legacy_agent_submission_id = $1
    `,
    [
      input.submissionId,
      input.status,
      input.reviewNotes ?? null,
      input.linkedMarketId ?? null,
      toIso(updatedAt),
    ],
  )
}

export async function syncLeadStatusForLegacyHumanSubmission(
  client: PoolClient,
  input: {
    submissionId: string
    status: PredictionLead['status']
    reviewNotes?: string | null
    linkedMarketId?: string | null
    updatedAt?: Date
  },
): Promise<void> {
  const updatedAt = input.updatedAt ?? new Date()
  await client.query(
    `
      UPDATE prediction_leads
      SET
        status = $2,
        review_notes = COALESCE($3, review_notes),
        linked_market_id = COALESCE($4, linked_market_id),
        duplicate_of_market_id = COALESCE($4, duplicate_of_market_id),
        reviewed_at = CASE
          WHEN $2 IN ('accepted', 'rejected', 'duplicate', 'merged', 'escalated', 'failed')
            THEN COALESCE(reviewed_at, $5)
          ELSE reviewed_at
        END,
        updated_at = $5
      WHERE legacy_human_submission_id = $1
    `,
    [
      input.submissionId,
      input.status,
      input.reviewNotes ?? null,
      input.linkedMarketId ?? null,
      toIso(updatedAt),
    ],
  )
}

export async function readLeadByLegacyAgentSubmissionId(
  client: PoolClient,
  submissionId: string,
): Promise<PredictionLead | null> {
  const result = await client.query<{ id: string }>(
    `
      SELECT id
      FROM prediction_leads
      WHERE legacy_agent_submission_id = $1
      LIMIT 1
    `,
    [submissionId],
  )
  const leadId = result.rows[0]?.id

  if (!leadId) {
    return null
  }

  return readPredictionLeadByIdFromClient(client, leadId)
}

export async function readLeadByLegacyHumanSubmissionId(
  client: PoolClient,
  submissionId: string,
): Promise<PredictionLead | null> {
  const result = await client.query<{ id: string }>(
    `
      SELECT id
      FROM prediction_leads
      WHERE legacy_human_submission_id = $1
      LIMIT 1
    `,
    [submissionId],
  )
  const leadId = result.rows[0]?.id

  if (!leadId) {
    return null
  }

  return readPredictionLeadByIdFromClient(client, leadId)
}
