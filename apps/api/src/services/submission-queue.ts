import { randomUUID } from 'node:crypto'

import type { PoolClient } from 'pg'

import type {
  AgentPredictionSubmissionInput,
  AgentProfile,
  PredictionSubmissionQueue,
  QueuedPredictionSubmission,
  SourceType,
} from '../shared'
import {
  agentPredictionSubmissionResponseSchema,
  predictionSubmissionQueueSchema,
  queuedPredictionSubmissionSchema,
} from '../shared'
import { withDatabaseClient, withDatabaseTransaction } from './database'
import { inferSourceType } from './source-type'
import {
  domainFromUrl,
  normalizeSourceUrl,
  similarityScore,
  toIso,
} from './utils'

const minimumAgentSubmissionIntervalMs = 60_000
const maxHourlySubmissionsPerAgent = 8
const duplicateClaimSimilarityThreshold = 0.8
const duplicateClaimLookbackCount = 10

type PredictionSubmissionRow = {
  id: string
  submitted_by_agent_id: string
  headline: string
  subject: string
  category: QueuedPredictionSubmission['category']
  summary: string
  promised_date: Date
  normalized_source_url: string | null
  source_url: string
  source_label: string | null
  source_note: string | null
  source_published_at: Date | null
  source_type: SourceType
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

type ReviewPredictionSubmissionInput = {
  submissionId: string
  decision: 'accepted' | 'rejected'
  linkedMarketId?: string
  reviewNotes?: string
}

function mapSubmission(row: PredictionSubmissionRow): QueuedPredictionSubmission {
  return queuedPredictionSubmissionSchema.parse({
    id: row.id,
    headline: row.headline,
    subject: row.subject,
    category: row.category,
    summary: row.summary,
    promisedDate: row.promised_date.toISOString(),
    sourceUrl: row.source_url,
    sourceLabel: row.source_label?.trim() || domainFromUrl(row.source_url),
    sourceDomain: domainFromUrl(row.source_url),
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

async function readSubmissionRowById(
  client: PoolClient,
  submissionId: string,
): Promise<PredictionSubmissionRow | null> {
  const result = await client.query<PredictionSubmissionRow>(
    `
      SELECT
        submissions.*,
        agents.handle AS author_handle,
        agents.display_name AS author_display_name
      FROM agent_prediction_submissions submissions
      INNER JOIN agent_accounts agents
        ON agents.id = submissions.submitted_by_agent_id
      WHERE submissions.id = $1
    `,
    [submissionId],
  )

  return result.rows[0] ?? null
}

async function assertNoPendingAgentSubmissionDuplicate(
  client: PoolClient,
  normalizedSourceUrl: string,
): Promise<void> {
  const result = await client.query<{ id: string }>(
    `
      SELECT id
      FROM agent_prediction_submissions
      WHERE status = 'pending'
        AND normalized_source_url = $1
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
      FROM agent_prediction_submissions
      WHERE submitted_by_agent_id = $1
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
      FROM agent_prediction_submissions
      WHERE submitted_by_agent_id = $1
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
    headline: string
    subject: string
    summary: string
  }>(
    `
      SELECT headline, subject, summary
      FROM agent_prediction_submissions
      WHERE submitted_by_agent_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [agentId, duplicateClaimLookbackCount],
  )

  const nextBody = `${input.headline} ${input.subject} ${input.summary}`

  for (const row of result.rows) {
    const priorBody = `${row.headline} ${row.subject} ${row.summary}`

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
  const submissionId = `submission_${randomUUID().replace(/-/g, '')}`
  const sourceType = inferSourceType(input.sourceUrl)
  const normalizedSourceUrl = normalizeSourceUrl(input.sourceUrl)
  const sourceLabel = input.sourceLabel?.trim() || domainFromUrl(input.sourceUrl)

  const submission = await withDatabaseTransaction(async (client) => {
    await assertNoPendingAgentSubmissionDuplicate(client, normalizedSourceUrl)
    await assertAgentSubmissionCooldown(client, agent.id, now)
    await assertAgentSubmissionHourlyLimit(client, agent.id, now)
    await assertAgentSubmissionIsNotSimilar(client, agent.id, input)

    await client.query(
      `
        INSERT INTO agent_prediction_submissions (
          id,
          submitted_by_agent_id,
          headline,
          subject,
          category,
          summary,
          promised_date,
          normalized_source_url,
          source_url,
          source_label,
          source_note,
          source_published_at,
          source_type,
          tags,
          status,
          review_notes,
          linked_market_id,
          reviewed_at,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          'pending', NULL, NULL, NULL, $15, $15
        )
      `,
      [
        submissionId,
        agent.id,
        input.headline.trim(),
        input.subject.trim(),
        input.category,
        input.summary.trim(),
        toIso(input.promisedDate),
        normalizedSourceUrl,
        input.sourceUrl,
        sourceLabel,
        input.sourceNote?.trim() || null,
        input.sourcePublishedAt ? toIso(input.sourcePublishedAt) : null,
        sourceType,
        input.tags.map((tag) => tag.trim()).filter(Boolean),
        now.toISOString(),
      ],
    )

    const row = await readSubmissionRowById(client, submissionId)
    if (!row) {
      throw new Error('Queued submission could not be reloaded.')
    }

    return mapSubmission(row)
  })

  return agentPredictionSubmissionResponseSchema.parse({
    queued: true,
    submission,
    reviewHint:
      'Submission queued for offline review. It will not appear on the market board until accepted.',
  })
}

async function assertLinkedMarketExists(
  client: PoolClient,
  marketId: string,
): Promise<void> {
  const result = await client.query<{ id: string }>(
    `
      SELECT id
      FROM markets
      WHERE id = $1
    `,
    [marketId],
  )

  if (result.rowCount === 0) {
    throw new Error('Linked market not found.')
  }
}

export async function reviewPredictionSubmission(
  input: ReviewPredictionSubmissionInput,
): Promise<QueuedPredictionSubmission> {
  return withDatabaseTransaction(async (client) => {
    const current = await readSubmissionRowById(client, input.submissionId)
    if (!current) {
      throw new Error('Prediction submission not found.')
    }

    if (current.status !== 'pending') {
      throw new Error('Prediction submission has already been reviewed.')
    }

    if (input.decision === 'accepted' && !input.linkedMarketId) {
      throw new Error('Accepted submissions must be linked to a market.')
    }

    if (input.linkedMarketId) {
      await assertLinkedMarketExists(client, input.linkedMarketId)
    }

    const nowIso = new Date().toISOString()

    await client.query(
      `
        UPDATE agent_prediction_submissions
        SET
          status = $2,
          review_notes = $3,
          linked_market_id = $4,
          reviewed_at = $5,
          updated_at = $5
        WHERE id = $1
      `,
      [
        input.submissionId,
        input.decision,
        input.reviewNotes?.trim() || null,
        input.linkedMarketId ?? null,
        nowIso,
      ],
    )

    const reviewed = await readSubmissionRowById(client, input.submissionId)
    if (!reviewed) {
      throw new Error('Reviewed submission could not be reloaded.')
    }

    return mapSubmission(reviewed)
  })
}

async function readSubmissionQueueFromClient(
  client: PoolClient,
  limit = 8,
): Promise<PredictionSubmissionQueue> {
  const [countResult, itemsResult] = await Promise.all([
    client.query<{ count: number }>(
      `
        SELECT COUNT(*)::int AS count
        FROM agent_prediction_submissions
        WHERE status = 'pending'
      `,
    ),
    client.query<PredictionSubmissionRow>(
      `
        SELECT
          submissions.*,
          agents.handle AS author_handle,
          agents.display_name AS author_display_name
        FROM agent_prediction_submissions submissions
        INNER JOIN agent_accounts agents
          ON agents.id = submissions.submitted_by_agent_id
        WHERE submissions.status = 'pending'
        ORDER BY submissions.created_at ASC
        LIMIT $1
      `,
      [limit],
    ),
  ])

  return predictionSubmissionQueueSchema.parse({
    pendingCount: countResult.rows[0]?.count ?? 0,
    items: itemsResult.rows.map(mapSubmission),
  })
}

export async function readPredictionSubmissionQueue(
  limit = 8,
): Promise<PredictionSubmissionQueue> {
  return withDatabaseClient((client) => readSubmissionQueueFromClient(client, limit))
}

export async function readPredictionSubmissionQueueFromClient(
  client: PoolClient,
  limit = 8,
): Promise<PredictionSubmissionQueue> {
  return readSubmissionQueueFromClient(client, limit)
}
