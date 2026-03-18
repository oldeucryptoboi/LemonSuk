import { randomUUID } from 'node:crypto'

import type { PoolClient } from 'pg'

import type {
  AgentPredictionSubmissionInput,
  AgentProfile,
  PredictionLead,
  PredictionSubmissionQueue,
  QueuedPredictionSubmission,
  SourceType,
} from '../shared'
import {
  agentPredictionSubmissionResponseSchema,
  predictionSubmissionQueueSchema,
  queuedPredictionSubmissionSchema,
  reviewRequestedEventSchema,
} from '../shared'
import { withDatabaseClient, withDatabaseTransaction } from './database'
import { createAgentLeadFromSubmission } from './lead-intake'
import { enqueueReviewRequestedEvent } from './review-events'
import { inferSourceType } from './source-type'
import {
  domainFromUrl,
  normalizeSourceUrl,
  similarityScore,
} from './utils'

const minimumAgentSubmissionIntervalMs = 60_000
const maxHourlySubmissionsPerAgent = 8
const duplicateClaimSimilarityThreshold = 0.8
const duplicateClaimLookbackCount = 10

type QueuedLeadRow = {
  id: string
  submitted_by_agent_id: string
  source_url: string
  source_domain: string
  source_type: SourceType
  source_label: string | null
  claimed_headline: string | null
  claimed_subject: string | null
  claimed_category: QueuedPredictionSubmission['category'] | null
  promised_date: Date | null
  summary: string | null
  tags: string[]
  status: QueuedPredictionSubmission['status']
  review_notes: string | null
  linked_market_id: string | null
  reviewed_at: Date | null
  created_at: Date
  updated_at: Date
  author_handle: string
  author_display_name: string
}

function firstNonEmptyText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) {
      return trimmed
    }
  }

  return null
}

function mapQueuedLead(row: QueuedLeadRow): QueuedPredictionSubmission {
  const fallbackHeadline = firstNonEmptyText(
    row.claimed_headline,
    row.source_label,
    row.source_domain,
  )
  const fallbackSubject = firstNonEmptyText(
    row.claimed_subject,
    row.source_label,
    row.source_domain,
  )
  const fallbackSummary = firstNonEmptyText(
    row.summary,
    row.source_label,
    row.source_domain,
  )
  const fallbackSourceLabel = firstNonEmptyText(row.source_label, row.source_domain)

  return queuedPredictionSubmissionSchema.parse({
    id: row.id,
    headline: fallbackHeadline,
    subject: fallbackSubject,
    category: row.claimed_category ?? 'social',
    summary: fallbackSummary,
    promisedDate:
      row.promised_date?.toISOString() ?? row.created_at.toISOString(),
    sourceUrl: row.source_url,
    sourceLabel: fallbackSourceLabel,
    sourceDomain: row.source_domain,
    sourceType: row.source_type,
    tags: row.tags,
    status: row.status,
    reviewNotes: row.review_notes,
    linkedMarketId: row.linked_market_id,
    submittedAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    submittedBy: {
      id: row.submitted_by_agent_id,
      handle: row.author_handle,
      displayName: row.author_display_name,
    },
  })
}

function mapQueuedLeadFromPredictionLead(
  lead: PredictionLead,
  agent: AgentProfile,
): QueuedPredictionSubmission {
  const fallbackHeadline = firstNonEmptyText(
    lead.claimedHeadline,
    lead.sourceLabel,
    lead.sourceDomain,
  )
  const fallbackSubject = firstNonEmptyText(
    lead.claimedSubject,
    lead.sourceLabel,
    lead.sourceDomain,
  )
  const fallbackSummary = firstNonEmptyText(
    lead.summary,
    lead.sourceNote,
    lead.sourceLabel,
    lead.sourceDomain,
  )
  const fallbackSourceLabel = firstNonEmptyText(lead.sourceLabel, lead.sourceDomain)

  return queuedPredictionSubmissionSchema.parse({
    id: lead.id,
    headline: fallbackHeadline,
    subject: fallbackSubject,
    category: (lead.claimedCategory as QueuedPredictionSubmission['category']) ?? 'social',
    summary: fallbackSummary,
    promisedDate: lead.promisedDate ?? lead.createdAt,
    sourceUrl: lead.sourceUrl,
    sourceLabel: fallbackSourceLabel,
    sourceDomain: lead.sourceDomain,
    sourceType: lead.sourceType,
    tags: lead.tags,
    status: lead.status,
    reviewNotes: lead.reviewNotes ?? null,
    linkedMarketId: lead.linkedMarketId ?? null,
    submittedAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    reviewedAt: lead.reviewedAt ?? null,
    submittedBy: {
      id: agent.id,
      handle: agent.handle,
      displayName: agent.displayName,
    },
  })
}

async function appendAuditLog(
  client: PoolClient,
  input: {
    leadId: string
    submissionId?: string | null
    eventType: string
    actorType: string
    actorId: string
    payload: unknown
    createdAt: string
  },
): Promise<void> {
  await client.query(
    `
      INSERT INTO prediction_review_audit_log (
        id,
        submission_id,
        lead_id,
        event_type,
        actor_type,
        actor_id,
        payload_json,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
    `,
    [
      `audit_${randomUUID().replace(/-/g, '')}`,
      input.submissionId ?? null,
      input.leadId,
      input.eventType,
      input.actorType,
      input.actorId,
      JSON.stringify(input.payload),
      input.createdAt,
    ],
  )
}

async function assertNoPendingAgentSubmissionDuplicate(
  client: PoolClient,
  normalizedSourceUrl: string,
): Promise<void> {
  const result = await client.query<{ id: string }>(
    `
      SELECT id
      FROM prediction_leads
      WHERE lead_type = 'structured_agent_lead'
        AND normalized_source_url = $1
        AND status IN ('pending', 'in_review', 'escalated')
      LIMIT 1
    `,
    [normalizedSourceUrl],
  )

  if (result.rowCount) {
    throw new Error('That source is already queued for offline review.')
  }
}

async function assertAgentSubmissionCooldown(
  client: PoolClient,
  agentId: string,
  now: Date,
): Promise<void> {
  const result = await client.query<{ created_at: Date }>(
    `
      SELECT created_at
      FROM prediction_leads
      WHERE lead_type = 'structured_agent_lead'
        AND submitted_by_agent_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [agentId],
  )

  const lastSubmission = result.rows[0]
  if (!lastSubmission) {
    return
  }

  if (
    now.getTime() - lastSubmission.created_at.getTime() <
    minimumAgentSubmissionIntervalMs
  ) {
    throw new Error('Wait 60 seconds before sending another claim packet.')
  }
}

async function assertAgentSubmissionHourlyLimit(
  client: PoolClient,
  agentId: string,
  now: Date,
): Promise<void> {
  const windowStart = new Date(now.getTime() - 60 * 60 * 1_000).toISOString()
  const result = await client.query<{ count: number }>(
    `
      SELECT COUNT(*)::int AS count
      FROM prediction_leads
      WHERE lead_type = 'structured_agent_lead'
        AND submitted_by_agent_id = $1
        AND created_at >= $2
    `,
    [agentId, windowStart],
  )

  if ((result.rows[0]?.count ?? 0) >= maxHourlySubmissionsPerAgent) {
    throw new Error('Hourly claim packet limit reached. Try again later.')
  }
}

async function assertAgentSubmissionIsNotSimilar(
  client: PoolClient,
  agentId: string,
  input: AgentPredictionSubmissionInput,
): Promise<void> {
  const result = await client.query<{
    claimed_headline: string | null
    claimed_subject: string | null
    summary: string | null
  }>(
    `
      SELECT claimed_headline, claimed_subject, summary
      FROM prediction_leads
      WHERE lead_type = 'structured_agent_lead'
        AND submitted_by_agent_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [agentId, duplicateClaimLookbackCount],
  )

  const nextBody = `${input.headline} ${input.subject} ${input.summary}`

  for (const row of result.rows) {
    const priorBody = `${row.claimed_headline ?? ''} ${row.claimed_subject ?? ''} ${row.summary ?? ''}`

    if (
      similarityScore(nextBody, priorBody) >= duplicateClaimSimilarityThreshold
    ) {
      throw new Error(
        'This claim packet is too similar to one of your recent submissions.',
      )
    }
  }
}

export async function enqueuePredictionSubmission(
  agent: AgentProfile,
  input: AgentPredictionSubmissionInput,
) {
  const now = new Date()
  const sourceType = inferSourceType(input.sourceUrl)
  const normalizedSourceUrl = normalizeSourceUrl(input.sourceUrl)
  const createdAtIso = now.toISOString()

  const queuedLead = await withDatabaseTransaction(async (client) => {
    await assertNoPendingAgentSubmissionDuplicate(client, normalizedSourceUrl)
    await assertAgentSubmissionCooldown(client, agent.id, now)
    await assertAgentSubmissionHourlyLimit(client, agent.id, now)
    await assertAgentSubmissionIsNotSimilar(client, agent.id, input)

    const lead = await createAgentLeadFromSubmission(client, {
      agent,
      submission: {
        ...input,
        headline: input.headline.trim(),
        subject: input.subject.trim(),
        summary: input.summary.trim(),
        sourceLabel:
          input.sourceLabel?.trim() || domainFromUrl(input.sourceUrl),
        sourceNote: input.sourceNote?.trim() || undefined,
        tags: input.tags.map((tag) => tag.trim()).filter(Boolean),
      },
      sourceType,
      normalizedSourceUrl,
      now,
    })

    await appendAuditLog(client, {
      leadId: lead.id,
      eventType: 'submission.queued',
      actorType: 'agent',
      actorId: agent.id,
      payload: {
        sourceUrl: input.sourceUrl,
        normalizedSourceUrl,
      },
      createdAt: createdAtIso,
    })

    return lead
  })

  const reviewEvent = reviewRequestedEventSchema.parse({
    eventType: 'review.requested',
    leadId: queuedLead.id,
    submittedUrl: input.sourceUrl,
    agentId: agent.id,
    createdAt: createdAtIso,
    priority: 'normal',
  })

  try {
    await enqueueReviewRequestedEvent(reviewEvent)
    await withDatabaseTransaction((client) =>
      appendAuditLog(client, {
        leadId: queuedLead.id,
        eventType: 'review.requested',
        actorType: 'system',
        actorId: 'api',
        payload: reviewEvent,
        createdAt: new Date().toISOString(),
      }),
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Could not queue submission for review.'

    await withDatabaseTransaction(async (client) => {
      const nowIso = new Date().toISOString()
      await client.query(
        `
          UPDATE prediction_leads
          SET
            status = 'failed',
            review_notes = $2,
            reviewed_at = $3,
            updated_at = $3
          WHERE id = $1
        `,
        [queuedLead.id, message, nowIso],
      )

      await appendAuditLog(client, {
        leadId: queuedLead.id,
        eventType: 'review.request.failed',
        actorType: 'system',
        actorId: 'api',
        payload: { message },
        createdAt: nowIso,
      })
    })

    throw new Error('Could not queue submission for review.')
  }

  let mappedSubmission: QueuedPredictionSubmission
  try {
    mappedSubmission = mapQueuedLeadFromPredictionLead(queuedLead, agent)
  } catch {
    throw new Error('Queued submission could not be reloaded.')
  }

  return agentPredictionSubmissionResponseSchema.parse({
    queued: true,
    leadId: queuedLead.id,
    submission: mappedSubmission,
    reviewHint:
      'Submission queued for offline review. It will not appear on the market board until accepted.',
  })
}

async function readSubmissionQueueFromClient(
  client: PoolClient,
  limit = 8,
): Promise<PredictionSubmissionQueue> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100))
  const [countResult, itemsResult] = await Promise.all([
    client.query<{ count: number }>(
      `
        SELECT COUNT(*)::int AS count
        FROM prediction_leads
        WHERE lead_type = 'structured_agent_lead'
          AND status = 'pending'
      `,
    ),
    client.query<QueuedLeadRow>(
      `
        SELECT
          leads.id,
          leads.submitted_by_agent_id,
          leads.source_url,
          leads.source_domain,
          leads.source_type,
          leads.source_label,
          leads.claimed_headline,
          leads.claimed_subject,
          leads.claimed_category,
          leads.promised_date,
          leads.summary,
          leads.tags,
          leads.status,
          leads.review_notes,
          leads.linked_market_id,
          leads.reviewed_at,
          leads.created_at,
          leads.updated_at,
          agents.handle AS author_handle,
          agents.display_name AS author_display_name
        FROM prediction_leads leads
        INNER JOIN agent_accounts agents
          ON agents.id = leads.submitted_by_agent_id
        WHERE leads.lead_type = 'structured_agent_lead'
          AND leads.status = 'pending'
        ORDER BY leads.created_at ASC
        LIMIT $1
      `,
      [safeLimit],
    ),
  ])

  return predictionSubmissionQueueSchema.parse({
    pendingCount: countResult.rows[0]?.count ?? 0,
    items: itemsResult.rows.map(mapQueuedLead),
  })
}

export async function readPredictionSubmissionQueue(
  limit = 8,
): Promise<PredictionSubmissionQueue> {
  return withDatabaseClient((client) =>
    readSubmissionQueueFromClient(client, limit),
  )
}

export async function readPredictionSubmissionQueueFromClient(
  client: PoolClient,
  limit = 8,
): Promise<PredictionSubmissionQueue> {
  return readSubmissionQueueFromClient(client, limit)
}
