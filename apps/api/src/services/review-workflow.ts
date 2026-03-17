import { randomUUID } from 'node:crypto'

import type { PoolClient } from 'pg'

import type {
  InternalPredictionSubmission,
  InternalPredictionSubmissionReviewResultInput,
  InternalPredictionSubmissionStatusInput,
  PredictionReviewResult,
  SourceType,
} from '../shared'
import {
  internalPredictionSubmissionSchema,
  predictionReviewResultSchema,
} from '../shared'
import { withDatabaseClient, withDatabaseTransaction } from './database'
import { domainFromUrl } from './utils'

type InternalSubmissionRow = {
  id: string
  submitted_by_agent_id: string
  headline: string
  subject: string
  category: InternalPredictionSubmission['category']
  summary: string
  promised_date: Date
  source_url: string
  source_label: string | null
  source_note: string | null
  source_published_at: Date | null
  source_type: SourceType
  tags: string[]
  status: InternalPredictionSubmission['status']
  review_notes: string | null
  linked_market_id: string | null
  reviewed_at: Date | null
  created_at: Date
  updated_at: Date
  author_handle: string
  author_display_name: string
}

type ReviewResultRow = {
  id: string
  submission_id: string
  reviewer: string
  verdict: PredictionReviewResult['verdict']
  confidence: number
  summary: string
  evidence_json: PredictionReviewResult['evidence']
  snapshot_ref: string | null
  needs_human_review: boolean
  run_id: string
  provider_run_id: string | null
  created_at: Date
}

function mapInternalSubmission(
  row: InternalSubmissionRow,
): InternalPredictionSubmission {
  return internalPredictionSubmissionSchema.parse({
    id: row.id,
    headline: row.headline,
    subject: row.subject,
    category: row.category,
    summary: row.summary,
    promisedDate: row.promised_date.toISOString(),
    sourceUrl: row.source_url,
    /* v8 ignore next */
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
    sourceNote: row.source_note,
    sourcePublishedAt: row.source_published_at?.toISOString() ?? null,
  })
}

function mapReviewResult(row: ReviewResultRow): PredictionReviewResult {
  return predictionReviewResultSchema.parse({
    runId: row.run_id,
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

async function readSubmissionRowById(
  client: PoolClient,
  submissionId: string,
): Promise<InternalSubmissionRow | null> {
  const result = await client.query<InternalSubmissionRow>(
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

async function readReviewResultByRunId(
  client: PoolClient,
  runId: string,
): Promise<ReviewResultRow | null> {
  const result = await client.query<ReviewResultRow>(
    `
      SELECT *
      FROM prediction_review_results
      WHERE run_id = $1
      LIMIT 1
    `,
    [runId],
  )

  return result.rows[0] ?? null
}

async function appendAuditLog(
  client: PoolClient,
  submissionId: string,
  eventType: string,
  actorType: string,
  actorId: string,
  payload: unknown,
  createdAt: Date,
): Promise<void> {
  await client.query(
    `
      INSERT INTO prediction_review_audit_log (
        id,
        submission_id,
        event_type,
        actor_type,
        actor_id,
        payload_json,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
    `,
    [
      `audit_${randomUUID().replace(/-/g, '')}`,
      submissionId,
      eventType,
      actorType,
      actorId,
      JSON.stringify(payload),
      createdAt.toISOString(),
    ],
  )
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

export async function readPredictionSubmissionForInternal(
  submissionId: string,
): Promise<InternalPredictionSubmission | null> {
  return withDatabaseClient(async (client) => {
    const row = await readSubmissionRowById(client, submissionId)
    return row ? mapInternalSubmission(row) : null
  })
}

export async function updatePredictionSubmissionStatusForInternal(
  submissionId: string,
  input: InternalPredictionSubmissionStatusInput,
  actorId = 'review-orchestrator',
): Promise<InternalPredictionSubmission> {
  return withDatabaseTransaction(async (client) => {
    const current = await readSubmissionRowById(client, submissionId)
    if (!current) {
      throw new Error('Prediction submission not found.')
    }

    if (current.status === 'accepted' || current.status === 'rejected') {
      throw new Error('Prediction submission is no longer pending review.')
    }

    if (current.status === input.status) {
      return mapInternalSubmission(current)
    }

    const now = new Date()
    const terminal =
      input.status === 'failed' || input.status === 'escalated'

    await client.query(
      `
        UPDATE agent_prediction_submissions
        SET
          status = $2,
          review_notes = $3,
          reviewed_at = $4,
          updated_at = $5
        WHERE id = $1
      `,
      [
        submissionId,
        input.status,
        input.note?.trim() || current.review_notes,
        terminal ? now.toISOString() : null,
        now.toISOString(),
      ],
    )

    await appendAuditLog(
      client,
      submissionId,
      'submission.status.updated',
      'internal-service',
      actorId,
      input,
      now,
    )

    const updated = await readSubmissionRowById(client, submissionId)
    if (!updated) {
      throw new Error('Updated submission could not be reloaded.')
    }

    return mapInternalSubmission(updated)
  })
}

export async function applyPredictionReviewResultForInternal(
  submissionId: string,
  input: InternalPredictionSubmissionReviewResultInput,
  actorId = 'review-orchestrator',
): Promise<{
  submission: InternalPredictionSubmission
  reviewResult: PredictionReviewResult
}> {
  return withDatabaseTransaction(async (client) => {
    const current = await readSubmissionRowById(client, submissionId)
    if (!current) {
      throw new Error('Prediction submission not found.')
    }

    const existing = await readReviewResultByRunId(client, input.runId)
    if (existing) {
      return {
        submission: mapInternalSubmission(current),
        reviewResult: mapReviewResult(existing),
      }
    }

    if (current.status === 'accepted' || current.status === 'rejected') {
      throw new Error('Prediction submission is no longer pending review.')
    }

    const now = new Date()

    await appendAuditLog(
      client,
      submissionId,
      'review.result.received',
      'internal-service',
      actorId,
      input,
      now,
    )

    const resultId = `review_${randomUUID().replace(/-/g, '')}`
    await client.query(
      `
        INSERT INTO prediction_review_results (
          id,
          submission_id,
          reviewer,
          verdict,
          confidence,
          summary,
          evidence_json,
          snapshot_ref,
          needs_human_review,
          run_id,
          provider_run_id,
          created_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12
        )
      `,
      [
        resultId,
        submissionId,
        input.reviewer,
        input.verdict,
        input.confidence,
        input.summary.trim(),
        JSON.stringify(input.evidence),
        input.snapshotRef ?? null,
        input.needsHumanReview,
        input.runId,
        input.providerRunId ?? null,
        now.toISOString(),
      ],
    )

    let nextStatus: InternalPredictionSubmission['status'] = 'escalated'
    let linkedMarketId: string | null = current.linked_market_id

    if (!input.needsHumanReview && input.verdict === 'reject') {
      nextStatus = 'rejected'
      linkedMarketId = null
    } else if (
      !input.needsHumanReview &&
      input.verdict === 'accept' &&
      input.linkedMarketId
    ) {
      await assertLinkedMarketExists(client, input.linkedMarketId)
      nextStatus = 'accepted'
      linkedMarketId = input.linkedMarketId
    } else if (input.verdict === 'accept') {
      nextStatus = 'escalated'
    }

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
        submissionId,
        nextStatus,
        input.summary.trim(),
        linkedMarketId,
        now.toISOString(),
      ],
    )

    await appendAuditLog(
      client,
      submissionId,
      'submission.review.completed',
      'internal-service',
      actorId,
      {
        runId: input.runId,
        verdict: input.verdict,
        status: nextStatus,
        linkedMarketId,
      },
      now,
    )

    const [updatedSubmission, reviewResult] = await Promise.all([
      readSubmissionRowById(client, submissionId),
      readReviewResultByRunId(client, input.runId),
    ])

    if (!updatedSubmission) {
      throw new Error('Reviewed submission could not be reloaded.')
    }

    if (!reviewResult) {
      throw new Error('Prediction review result could not be reloaded.')
    }

    return {
      submission: mapInternalSubmission(updatedSubmission),
      reviewResult: mapReviewResult(reviewResult),
    }
  })
}
