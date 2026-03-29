import { randomUUID } from 'node:crypto'

import type { PoolClient } from 'pg'

import type {
  ClaudeReviewAgentClaimNextInput,
  ClaudeReviewAgentClaimNextResponse,
  ClaudeReviewAgentCompleteRunInput,
  ClaudeReviewAgentFailRunInput,
  ClaudeReviewAgentRun,
  ClaudeReviewAgentRunEvent,
  ClaudeReviewAgentRunEventInput,
  PredictionLead,
  PredictionReviewResult,
} from '../shared'
import {
  claudeReviewAgentClaimNextResponseSchema,
  claudeReviewAgentRunEventSchema,
  claudeReviewAgentRunSchema,
  predictionReviewResultSchema,
} from '../shared'
import { withDatabaseTransaction } from './database'
import { readPredictionLeadInspectionFromClient } from './lead-intake'

type ClaimedLeadRow = {
  id: string
  status: PredictionLead['status']
  legacy_agent_submission_id: string | null
  claude_review_claim_run_id: string | null
  claude_review_claimed_by_agent_key: string | null
}

type ClaudeRunnerRunRow = {
  id: string
  agent_key: string
  lead_id: string
  session_id: string | null
  provider_run_id: string | null
  status: ClaudeReviewAgentRun['status']
  trigger: string
  workspace_cwd: string
  prompt_summary: string
  final_summary: string | null
  error_message: string | null
  cost_usd: number
  token_usage_json: unknown
  tool_usage_json: unknown
  recommendation_json: unknown
  started_at: Date
  completed_at: Date | null
  created_at: Date
  updated_at: Date
}

type ClaudeRunnerEventRow = {
  id: string
  run_id: string
  event_type: string
  payload_json: unknown
  created_at: Date
}

type ReviewResultRow = {
  run_id: string
  lead_id: string | null
  submission_id: string | null
  reviewer: string
  verdict: PredictionReviewResult['verdict']
  confidence: number
  summary: string
  evidence_json: PredictionReviewResult['evidence']
  snapshot_ref: string | null
  needs_human_review: boolean
  provider_run_id: string | null
  created_at: Date
}

function mapClaudeRunnerRun(row: ClaudeRunnerRunRow): ClaudeReviewAgentRun {
  return claudeReviewAgentRunSchema.parse({
    id: row.id,
    agentKey: row.agent_key,
    leadId: row.lead_id,
    sessionId: row.session_id,
    providerRunId: row.provider_run_id,
    status: row.status,
    trigger: row.trigger,
    workspaceCwd: row.workspace_cwd,
    promptSummary: row.prompt_summary,
    finalSummary: row.final_summary,
    errorMessage: row.error_message,
    costUsd: row.cost_usd,
    tokenUsage: row.token_usage_json,
    toolUsage: row.tool_usage_json,
    recommendation: row.recommendation_json,
    startedAt: row.started_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  })
}

function mapClaudeRunnerEvent(row: ClaudeRunnerEventRow): ClaudeReviewAgentRunEvent {
  return claudeReviewAgentRunEventSchema.parse({
    id: row.id,
    runId: row.run_id,
    eventType: row.event_type,
    payload: row.payload_json,
    createdAt: row.created_at.toISOString(),
  })
}

function mapPredictionReviewResult(row: ReviewResultRow): PredictionReviewResult {
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

async function readRunById(
  client: PoolClient,
  runId: string,
): Promise<ClaudeRunnerRunRow | null> {
  const result = await client.query<ClaudeRunnerRunRow>(
    `
      SELECT *
      FROM claude_runner_runs
      WHERE id = $1
      LIMIT 1
    `,
    [runId],
  )

  return result.rows[0] ?? null
}

async function readClaimedLeadByRunId(
  client: PoolClient,
  runId: string,
): Promise<ClaimedLeadRow | null> {
  const result = await client.query<ClaimedLeadRow>(
    `
      SELECT
        id,
        status,
        legacy_agent_submission_id,
        claude_review_claim_run_id,
        claude_review_claimed_by_agent_key
      FROM prediction_leads
      WHERE claude_review_claim_run_id = $1
      LIMIT 1
    `,
    [runId],
  )

  return result.rows[0] ?? null
}

async function appendPredictionReviewAuditLog(
  client: PoolClient,
  input: {
    leadId: string
    submissionId: string | null
    eventType: string
    actorId: string
    payload: unknown
    createdAt: Date
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
      VALUES ($1, $2, $3, $4, 'system', $5, $6::jsonb, $7)
    `,
    [
      `audit_${randomUUID().replace(/-/g, '')}`,
      input.submissionId,
      input.leadId,
      input.eventType,
      input.actorId,
      JSON.stringify(input.payload),
      input.createdAt.toISOString(),
    ],
  )
}

async function clearLeadClaim(
  client: PoolClient,
  leadId: string,
): Promise<void> {
  await client.query(
    `
      UPDATE prediction_leads
      SET
        claude_review_claimed_by_agent_key = NULL,
        claude_review_claim_run_id = NULL,
        claude_review_claimed_at = NULL,
        claude_review_claim_expires_at = NULL
      WHERE id = $1
    `,
    [leadId],
  )
}

export async function claimNextPredictionLeadForClaudeReviewAgent(
  input: ClaudeReviewAgentClaimNextInput,
): Promise<ClaudeReviewAgentClaimNextResponse> {
  return withDatabaseTransaction(async (client) => {
    const now = new Date()
    const nowIso = now.toISOString()
    const leaseExpiresAt = new Date(now.getTime() + input.leaseSeconds * 1_000)
    const candidate = await client.query<{ id: string }>(
      `
        SELECT id
        FROM prediction_leads
        WHERE
          status = 'pending'
          AND (
            claude_review_claim_expires_at IS NULL
            OR claude_review_claim_expires_at <= $1
          )
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [nowIso],
    )

    const leadId = candidate.rows[0]?.id
    if (!leadId) {
      return claudeReviewAgentClaimNextResponseSchema.parse({
        claimed: false,
        run: null,
        lead: null,
      })
    }

    const runId = `claude_run_${randomUUID().replace(/-/g, '')}`

    await client.query(
      `
        UPDATE prediction_leads
        SET
          claude_review_claimed_by_agent_key = $2,
          claude_review_claim_run_id = $3,
          claude_review_claimed_at = $4,
          claude_review_claim_expires_at = $5
        WHERE id = $1
      `,
      [
        leadId,
        input.agentKey,
        runId,
        nowIso,
        leaseExpiresAt.toISOString(),
      ],
    )

    const runInsert = await client.query<ClaudeRunnerRunRow>(
      `
        INSERT INTO claude_runner_runs (
          id,
          agent_key,
          lead_id,
          session_id,
          provider_run_id,
          status,
          trigger,
          workspace_cwd,
          prompt_summary,
          final_summary,
          error_message,
          cost_usd,
          token_usage_json,
          tool_usage_json,
          recommendation_json,
          started_at,
          completed_at,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, NULL, 'running', $5, $6, $7, NULL, NULL, 0,
          NULL, NULL, NULL, $8, NULL, $8, $8
        )
        RETURNING *
      `,
      [
        runId,
        input.agentKey,
        leadId,
        null,
        input.trigger,
        input.workspaceCwd,
        input.promptSummary,
        nowIso,
      ],
    )

    const detail = await readPredictionLeadInspectionFromClient(client, leadId)
    if (!detail) {
      throw new Error('Claimed prediction lead could not be inspected.')
    }

    await appendPredictionReviewAuditLog(client, {
      leadId,
      submissionId: detail.lead.legacyAgentSubmissionId,
      eventType: 'claude_review_claimed',
      actorId: input.agentKey,
      payload: {
        runId,
        trigger: input.trigger,
        leaseSeconds: input.leaseSeconds,
      },
      createdAt: now,
    })

    return claudeReviewAgentClaimNextResponseSchema.parse({
      claimed: true,
      run: mapClaudeRunnerRun(runInsert.rows[0]),
      lead: detail,
    })
  })
}

export async function appendClaudeReviewAgentRunEvent(
  runId: string,
  input: ClaudeReviewAgentRunEventInput,
): Promise<ClaudeReviewAgentRunEvent> {
  return withDatabaseTransaction(async (client) => {
    const run = await readRunById(client, runId)
    if (!run) {
      throw new Error('Claude review run not found.')
    }

    const now = new Date()
    const result = await client.query<ClaudeRunnerEventRow>(
      `
        INSERT INTO claude_runner_events (
          id,
          run_id,
          event_type,
          payload_json,
          created_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5)
        RETURNING *
      `,
      [
        `claude_event_${randomUUID().replace(/-/g, '')}`,
        runId,
        input.eventType,
        JSON.stringify(input.payload ?? null),
        now.toISOString(),
      ],
    )

    await client.query(
      `
        UPDATE claude_runner_runs
        SET updated_at = $2
        WHERE id = $1
      `,
      [runId, now.toISOString()],
    )

    return mapClaudeRunnerEvent(result.rows[0])
  })
}

export async function readRecentClaudeReviewAgentRuns(
  limit: number = 8,
): Promise<ClaudeReviewAgentRun[]> {
  return withDatabaseTransaction(async (client) => {
    const result = await client.query<ClaudeRunnerRunRow>(
      `
        SELECT *
        FROM claude_runner_runs
        ORDER BY started_at DESC, created_at DESC
        LIMIT $1
      `,
      [limit],
    )

    return result.rows.map(mapClaudeRunnerRun)
  })
}

export async function completeClaudeReviewAgentRun(
  runId: string,
  input: ClaudeReviewAgentCompleteRunInput,
): Promise<{
  run: ClaudeReviewAgentRun
  reviewResult: PredictionReviewResult
}> {
  return withDatabaseTransaction(async (client) => {
    const run = await readRunById(client, runId)
    if (!run) {
      throw new Error('Claude review run not found.')
    }

    if (run.status !== 'running') {
      throw new Error('Claude review run is no longer active.')
    }

    const lead = await readClaimedLeadByRunId(client, runId)
    if (!lead) {
      throw new Error('Claude review run no longer owns a pending lead claim.')
    }

    const completedAt = input.completedAt ? new Date(input.completedAt) : new Date()
    const reviewResultId = `review_${randomUUID().replace(/-/g, '')}`
    const reviewInsert = await client.query<ReviewResultRow>(
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
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb, NULL, $9, $10, $11, $12
        )
        RETURNING
          run_id,
          lead_id,
          submission_id,
          reviewer,
          verdict,
          confidence,
          summary,
          evidence_json,
          snapshot_ref,
          needs_human_review,
          provider_run_id,
          created_at
      `,
      [
        reviewResultId,
        lead.legacy_agent_submission_id,
        lead.id,
        run.agent_key,
        input.recommendation.verdict,
        input.recommendation.confidence,
        input.recommendation.summary,
        JSON.stringify(input.recommendation.evidence),
        input.recommendation.needsHumanReview,
        runId,
        input.providerRunId ?? null,
        completedAt.toISOString(),
      ],
    )

    await appendPredictionReviewAuditLog(client, {
      leadId: lead.id,
      submissionId: lead.legacy_agent_submission_id,
      eventType: 'claude_review_recommendation_recorded',
      actorId: run.agent_key,
      payload: {
        runId,
        verdict: input.recommendation.verdict,
        confidence: input.recommendation.confidence,
        needsHumanReview: input.recommendation.needsHumanReview,
        duplicateLeadIds: input.recommendation.duplicateLeadIds,
        duplicateMarketIds: input.recommendation.duplicateMarketIds,
        recommendedFamilySlug: input.recommendation.recommendedFamilySlug ?? null,
        recommendedEntitySlug: input.recommendation.recommendedEntitySlug ?? null,
      },
      createdAt: completedAt,
    })

    const updatedRun = await client.query<ClaudeRunnerRunRow>(
      `
        UPDATE claude_runner_runs
        SET
          session_id = COALESCE($2, session_id),
          provider_run_id = COALESCE($3, provider_run_id),
          status = 'completed',
          final_summary = $4,
          error_message = NULL,
          cost_usd = $5,
          token_usage_json = $6::jsonb,
          tool_usage_json = $7::jsonb,
          recommendation_json = $8::jsonb,
          completed_at = $9,
          updated_at = $9
        WHERE id = $1
        RETURNING *
      `,
      [
        runId,
        input.sessionId ?? null,
        input.providerRunId ?? null,
        input.finalSummary,
        input.costUsd,
        JSON.stringify(input.tokenUsage ?? null),
        JSON.stringify(input.toolUsage ?? null),
        JSON.stringify(input.recommendation),
        completedAt.toISOString(),
      ],
    )

    await clearLeadClaim(client, lead.id)

    return {
      run: mapClaudeRunnerRun(updatedRun.rows[0]),
      reviewResult: mapPredictionReviewResult(reviewInsert.rows[0]),
    }
  })
}

export async function failClaudeReviewAgentRun(
  runId: string,
  input: ClaudeReviewAgentFailRunInput,
): Promise<{
  run: ClaudeReviewAgentRun
}> {
  return withDatabaseTransaction(async (client) => {
    const run = await readRunById(client, runId)
    if (!run) {
      throw new Error('Claude review run not found.')
    }

    if (run.status !== 'running') {
      throw new Error('Claude review run is no longer active.')
    }

    const lead = await readClaimedLeadByRunId(client, runId)
    if (!lead) {
      throw new Error('Claude review run no longer owns a pending lead claim.')
    }

    const completedAt = input.completedAt ? new Date(input.completedAt) : new Date()
    const updatedRun = await client.query<ClaudeRunnerRunRow>(
      `
        UPDATE claude_runner_runs
        SET
          session_id = COALESCE($2, session_id),
          provider_run_id = COALESCE($3, provider_run_id),
          status = 'failed',
          final_summary = COALESCE($4, final_summary),
          error_message = $5,
          cost_usd = $6,
          token_usage_json = $7::jsonb,
          tool_usage_json = $8::jsonb,
          completed_at = $9,
          updated_at = $9
        WHERE id = $1
        RETURNING *
      `,
      [
        runId,
        input.sessionId ?? null,
        input.providerRunId ?? null,
        input.finalSummary ?? null,
        input.errorMessage,
        input.costUsd,
        JSON.stringify(input.tokenUsage ?? null),
        JSON.stringify(input.toolUsage ?? null),
        completedAt.toISOString(),
      ],
    )

    await appendPredictionReviewAuditLog(client, {
      leadId: lead.id,
      submissionId: lead.legacy_agent_submission_id,
      eventType: 'claude_review_run_failed',
      actorId: run.agent_key,
      payload: {
        runId,
        errorMessage: input.errorMessage,
      },
      createdAt: completedAt,
    })

    await clearLeadClaim(client, lead.id)

    return {
      run: mapClaudeRunnerRun(updatedRun.rows[0]),
    }
  })
}
