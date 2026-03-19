import { randomUUID } from 'node:crypto'

import type { PoolClient } from 'pg'

import type {
  InternalPredictionLeadDetail,
  InternalPredictionLead,
  InternalPredictionSubmissionReviewResultInput,
  InternalPredictionSubmissionStatusInput,
  PredictionLead,
  PredictionReviewResult,
  SourceType,
} from '../shared'
import {
  internalPredictionLeadDetailSchema,
  internalPredictionLeadSchema,
  predictionReviewResultSchema,
} from '../shared'
import { withDatabaseClient, withDatabaseTransaction } from './database'
import { readPredictionLeadInspectionFromClient } from './lead-intake'
import { grantAcceptedLeadReward } from './wallet'

type InternalLeadRow = {
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
  author_handle: string | null
  author_display_name: string | null
}

type LeadReviewResultRow = {
  id: string
  lead_id: string | null
  submission_id: string | null
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

function mapInternalLead(row: InternalLeadRow): InternalPredictionLead {
  return internalPredictionLeadSchema.parse({
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
    submittedBy:
      row.submitted_by_agent_id && row.author_handle && row.author_display_name
        ? {
            id: row.submitted_by_agent_id,
            handle: row.author_handle,
            displayName: row.author_display_name,
          }
        : null,
  })
}

function mapReviewResult(row: LeadReviewResultRow): PredictionReviewResult {
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

async function readLeadRowById(
  client: PoolClient,
  leadId: string,
): Promise<InternalLeadRow | null> {
  const result = await client.query<InternalLeadRow>(
    `
      SELECT
        leads.*,
        families.slug AS family_slug,
        families.display_name AS family_display_name,
        entities.slug AS primary_entity_slug,
        entities.display_name AS primary_entity_display_name,
        agents.handle AS author_handle,
        agents.display_name AS author_display_name
      FROM prediction_leads leads
      LEFT JOIN prediction_families families
        ON families.id = leads.family_id
      LEFT JOIN entities
        ON entities.id = leads.primary_entity_id
      LEFT JOIN agent_accounts agents
        ON agents.id = leads.submitted_by_agent_id
      WHERE leads.id = $1
    `,
    [leadId],
  )

  return result.rows[0] ?? null
}

async function readReviewResultByRunId(
  client: PoolClient,
  runId: string,
): Promise<LeadReviewResultRow | null> {
  const result = await client.query<LeadReviewResultRow>(
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
  lead: InternalLeadRow,
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
      lead.legacy_agent_submission_id,
      lead.id,
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

async function syncLegacyRows(
  client: PoolClient,
  lead: InternalLeadRow,
  status: PredictionLead['status'],
  reviewNotes: string | null,
  linkedMarketId: string | null,
  updatedAt: Date,
): Promise<void> {
  if (lead.legacy_agent_submission_id) {
    await client.query(
      `
        UPDATE agent_prediction_submissions
        SET
          status = $2,
          review_notes = $3,
          linked_market_id = $4,
          reviewed_at = CASE
            WHEN $2 IN ('accepted', 'rejected', 'escalated', 'failed')
              THEN COALESCE(reviewed_at, $5)
            ELSE reviewed_at
          END,
          updated_at = $5
        WHERE id = $1
      `,
      [
        lead.legacy_agent_submission_id,
        status,
        reviewNotes,
        linkedMarketId,
        updatedAt.toISOString(),
      ],
    )
  }

  if (lead.legacy_human_submission_id) {
    await client.query(
      `
        UPDATE human_review_submissions
        SET
          status = $2,
          review_notes = $3,
          reviewed_at = CASE
            WHEN $2 IN ('accepted', 'rejected', 'escalated', 'failed')
              THEN COALESCE(reviewed_at, $4)
            ELSE reviewed_at
          END,
          updated_at = $4
        WHERE id = $1
      `,
      [
        lead.legacy_human_submission_id,
        status,
        reviewNotes,
        updatedAt.toISOString(),
      ],
    )
  }
}

async function maybeGrantAcceptedLeadReward(
  client: PoolClient,
  lead: InternalLeadRow,
  nextStatus: PredictionLead['status'],
  now: Date,
): Promise<void> {
  if (nextStatus !== 'accepted' || !lead.submitted_by_agent_id) {
    return
  }

  await grantAcceptedLeadReward(client, lead.submitted_by_agent_id, lead.id, now)
}

export async function readPredictionLeadForInternal(
  leadId: string,
): Promise<InternalPredictionLead | null> {
  return withDatabaseClient(async (client) => {
    const row = await readLeadRowById(client, leadId)
    return row ? mapInternalLead(row) : null
  })
}

export async function readPredictionLeadInspectionForInternal(
  leadId: string,
): Promise<InternalPredictionLeadDetail | null> {
  return withDatabaseClient(async (client) => {
    const detail = await readPredictionLeadInspectionFromClient(client, leadId)
    if (!detail) {
      return null
    }

    const row = await readLeadRowById(client, leadId)
    if (!row) {
      return null
    }

    return internalPredictionLeadDetailSchema.parse({
      ...detail,
      lead: mapInternalLead(row),
    })
  })
}

export async function updatePredictionLeadStatusForInternal(
  leadId: string,
  input: InternalPredictionSubmissionStatusInput,
  actorId = 'review-orchestrator',
): Promise<InternalPredictionLead> {
  return withDatabaseTransaction(async (client) => {
    const current = await readLeadRowById(client, leadId)
    if (!current) {
      throw new Error('Prediction lead not found.')
    }

    if (
      current.status === 'accepted' ||
      current.status === 'rejected' ||
      current.status === 'duplicate' ||
      current.status === 'merged'
    ) {
      throw new Error('Prediction lead is no longer pending review.')
    }

    if (current.status === input.status) {
      return mapInternalLead(current)
    }

    const now = new Date()
    const nextReviewNotes = input.note?.trim() || current.review_notes

    await client.query(
      `
        UPDATE prediction_leads
        SET
          status = $2,
          review_notes = $3,
          reviewed_at = CASE
            WHEN $2 IN ('accepted', 'rejected', 'duplicate', 'merged', 'escalated', 'failed')
              THEN COALESCE(reviewed_at, $4)
            ELSE reviewed_at
          END,
          updated_at = $4
        WHERE id = $1
      `,
      [
        leadId,
        input.status,
        nextReviewNotes,
        now.toISOString(),
      ],
    )

    await syncLegacyRows(
      client,
      current,
      input.status,
      nextReviewNotes,
      current.linked_market_id,
      now,
    )
    await maybeGrantAcceptedLeadReward(client, current, input.status, now)

    await appendAuditLog(
      client,
      current,
      'lead.status.updated',
      'internal-service',
      actorId,
      input,
      now,
    )

    const updated = await readLeadRowById(client, leadId)
    if (!updated) {
      throw new Error('Updated lead could not be reloaded.')
    }

    return mapInternalLead(updated)
  })
}

export async function applyPredictionLeadReviewResultForInternal(
  leadId: string,
  input: InternalPredictionSubmissionReviewResultInput,
  actorId = 'review-orchestrator',
): Promise<{
  lead: InternalPredictionLead
  reviewResult: PredictionReviewResult
}> {
  return withDatabaseTransaction(async (client) => {
    const current = await readLeadRowById(client, leadId)
    if (!current) {
      throw new Error('Prediction lead not found.')
    }

    const existing = await readReviewResultByRunId(client, input.runId)
    if (existing) {
      return {
        lead: mapInternalLead(current),
        reviewResult: mapReviewResult(existing),
      }
    }

    if (
      current.status === 'accepted' ||
      current.status === 'rejected' ||
      current.status === 'duplicate' ||
      current.status === 'merged'
    ) {
      throw new Error('Prediction lead is no longer pending review.')
    }

    const now = new Date()

    await appendAuditLog(
      client,
      current,
      'lead.review.result.received',
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
          lead_id,
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
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13
        )
      `,
      [
        resultId,
        current.legacy_agent_submission_id,
        leadId,
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

    let nextStatus: PredictionLead['status'] = 'escalated'
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
        UPDATE prediction_leads
        SET
          status = $2,
          review_notes = $3,
          linked_market_id = $4,
          reviewed_at = $5,
          updated_at = $5
        WHERE id = $1
      `,
      [
        leadId,
        nextStatus,
        input.summary.trim(),
        linkedMarketId,
        now.toISOString(),
      ],
    )

    await syncLegacyRows(
      client,
      current,
      nextStatus,
      input.summary.trim(),
      linkedMarketId,
      now,
    )
    await maybeGrantAcceptedLeadReward(client, current, nextStatus, now)

    await appendAuditLog(
      client,
      current,
      'lead.review.completed',
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

    const [updatedLead, reviewResult] = await Promise.all([
      readLeadRowById(client, leadId),
      readReviewResultByRunId(client, input.runId),
    ])

    if (!updatedLead) {
      throw new Error('Reviewed lead could not be reloaded.')
    }

    if (!reviewResult) {
      throw new Error('Prediction lead review result could not be reloaded.')
    }

    return {
      lead: mapInternalLead(updatedLead),
      reviewResult: mapReviewResult(reviewResult),
    }
  })
}

export async function reviewPredictionLead(input: {
  leadId: string
  decision: 'accepted' | 'rejected'
  linkedMarketId?: string
  reviewNotes?: string
}): Promise<InternalPredictionLead> {
  return withDatabaseTransaction(async (client) => {
    const current = await readLeadRowById(client, input.leadId)
    if (!current) {
      throw new Error('Prediction lead not found.')
    }

    if (
      current.status === 'accepted' ||
      current.status === 'rejected' ||
      current.status === 'duplicate' ||
      current.status === 'merged'
    ) {
      throw new Error('Prediction lead has already been reviewed.')
    }

    if (input.decision === 'accepted' && !input.linkedMarketId) {
      throw new Error('Accepted leads must be linked to a market.')
    }

    if (input.linkedMarketId) {
      await assertLinkedMarketExists(client, input.linkedMarketId)
    }

    const now = new Date()
    const nextReviewNotes = input.reviewNotes?.trim() || null
    const nextLinkedMarketId =
      input.decision === 'accepted' ? input.linkedMarketId! : null

    await client.query(
      `
        UPDATE prediction_leads
        SET
          status = $2,
          review_notes = $3,
          linked_market_id = $4,
          duplicate_of_market_id = $4,
          reviewed_at = $5,
          updated_at = $5
        WHERE id = $1
      `,
      [
        input.leadId,
        input.decision,
        nextReviewNotes,
        nextLinkedMarketId,
        now.toISOString(),
      ],
    )

    await syncLegacyRows(
      client,
      current,
      input.decision,
      nextReviewNotes,
      nextLinkedMarketId,
      now,
    )
    await maybeGrantAcceptedLeadReward(client, current, input.decision, now)

    await appendAuditLog(
      client,
      current,
      'lead.review.manually_completed',
      'operator',
      'manual-review',
      {
        decision: input.decision,
        linkedMarketId: nextLinkedMarketId,
        reviewNotes: nextReviewNotes,
      },
      now,
    )

    const reviewed = await readLeadRowById(client, input.leadId)
    if (!reviewed) {
      throw new Error('Reviewed lead could not be reloaded.')
    }

    return mapInternalLead(reviewed)
  })
}
