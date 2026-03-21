import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setupApiContext } from '../../../../test/helpers/api-context'
import { solveCaptchaPrompt as solveCaptcha } from '../../../../test/helpers/captcha'

async function registerAgent(
  context: Awaited<ReturnType<typeof setupApiContext>>,
  handle: string,
) {
  const challenge = await context.identity.createCaptchaChallenge()

  return context.identity.registerAgent({
    handle,
    displayName: handle,
    ownerName: 'Owner',
    modelProvider: 'Anthropic',
    biography: 'Review agent test profile with enough words for validation.',
    captchaChallengeId: challenge.id,
    captchaAnswer: solveCaptcha(challenge.prompt),
  })
}

async function enqueueLead(
  context: Awaited<ReturnType<typeof setupApiContext>>,
  handle: string,
  sourceUrl: string,
) {
  const queue = await import('./submission-queue')
  const registration = await registerAgent(context, handle)
  return queue.enqueuePredictionSubmission(registration.agent, {
    headline: `${handle} lead headline for ${sourceUrl}`,
    subject: `${handle} lead subject`,
    category: 'software_release',
    promisedDate: '2027-12-31T23:59:59.000Z',
    summary:
      'A structured lead summary with enough detail to satisfy schema validation during the Claude review agent tests.',
    sourceUrl,
    sourceLabel: 'Example',
    tags: [handle, 'release'],
  })
}

describe('claude review agent service', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('./lead-intake')
  })

  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('./lead-intake')
  })

  it('fails loudly if a claimed lead cannot be reloaded after claiming', async () => {
    const context = await setupApiContext()

    await enqueueLead(
      context,
      'claude_review_broken_reload',
      'https://example.com/broken-reload-source',
    )

    vi.resetModules()
    vi.doMock('./lead-intake', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./lead-intake')>()
      return {
        ...actual,
        readPredictionLeadInspectionFromClient: vi.fn().mockResolvedValue(null),
      }
    })

    const claudeReview = await import('./claude-review-agent')

    await expect(
      claudeReview.claimNextPredictionLeadForClaudeReviewAgent({
        agentKey: 'review-default',
        trigger: 'manual',
        promptSummary: 'Inspect next pending lead.',
        workspaceCwd: '/tmp/review-default',
        leaseSeconds: 900,
      }),
    ).rejects.toThrow('Claimed prediction lead could not be inspected.')

    await context.pool.end()
  })

  it('records run events and rejects event writes for unknown runs', async () => {
    const context = await setupApiContext()
    const claudeReview = await import('./claude-review-agent')

    await enqueueLead(
      context,
      'claude_review_eventful',
      'https://example.com/event-source',
    )

    const claimed = await claudeReview.claimNextPredictionLeadForClaudeReviewAgent({
      agentKey: 'review-default',
      trigger: 'manual',
      promptSummary: 'Inspect next pending lead.',
      workspaceCwd: '/tmp/review-default',
      leaseSeconds: 900,
    })

    if (!claimed.run) {
      throw new Error('Expected a claimed run.')
    }

    const event = await claudeReview.appendClaudeReviewAgentRunEvent(claimed.run.id, {
      eventType: 'claude_review_context_refreshed',
      payload: null,
    })

    expect(event).toEqual(
      expect.objectContaining({
        runId: claimed.run.id,
        eventType: 'claude_review_context_refreshed',
        payload: null,
      }),
    )

    const persistedEvents = await context.pool.query<{ count: number }>(
      `
        SELECT COUNT(*)::int AS count
        FROM claude_runner_events
        WHERE run_id = $1
      `,
      [claimed.run.id],
    )
    expect(persistedEvents.rows[0]?.count).toBe(1)

    await expect(
      claudeReview.appendClaudeReviewAgentRunEvent('claude_run_missing', {
        eventType: 'claude_review_context_refreshed',
        payload: { retry: true },
      }),
    ).rejects.toThrow('Claude review run not found.')

    await context.pool.end()
  })

  it('reuses the latest runner session when claiming the next pending lead', async () => {
    const context = await setupApiContext()
    const claudeReview = await import('./claude-review-agent')

    await enqueueLead(
      context,
      'claude_review_resume',
      'https://example.com/resume-source',
    )

    await context.pool.query(
      `
        INSERT INTO claude_runner_sessions (
          agent_key,
          session_id,
          workspace_cwd,
          last_run_id,
          created_at,
          updated_at
        )
        VALUES ('review-default', 'session_previous', '/tmp/review-default', 'claude_run_previous', NOW(), NOW())
      `,
    )

    const claimed = await claudeReview.claimNextPredictionLeadForClaudeReviewAgent({
      agentKey: 'review-default',
      trigger: 'scheduled',
      promptSummary: 'Inspect next pending lead.',
      workspaceCwd: '/tmp/review-default',
      leaseSeconds: 900,
    })

    expect(claimed.resumeSessionId).toBe('session_previous')
    expect(claimed.run?.sessionId).toBe('session_previous')

    await context.pool.end()
  })

  it('returns the latest runner session when no pending lead is claimable', async () => {
    const context = await setupApiContext()
    const claudeReview = await import('./claude-review-agent')

    await context.pool.query(
      `
        INSERT INTO claude_runner_sessions (
          agent_key,
          session_id,
          workspace_cwd,
          last_run_id,
          created_at,
          updated_at
        )
        VALUES ('review-default', 'session_previous', '/tmp/review-default', 'claude_run_previous', NOW(), NOW())
      `,
    )

    const noWork = await claudeReview.claimNextPredictionLeadForClaudeReviewAgent({
      agentKey: 'review-default',
      trigger: 'scheduled',
      promptSummary: 'Resume the latest review session if no lead is pending.',
      workspaceCwd: '/tmp/review-default',
      leaseSeconds: 900,
    })

    expect(noWork).toEqual({
      claimed: false,
      run: null,
      lead: null,
      resumeSessionId: 'session_previous',
    })

    await context.pool.end()
  })

  it('claims the oldest eligible pending lead and creates a running run', async () => {
    const context = await setupApiContext()
    const claudeReview = await import('./claude-review-agent')

    const first = await enqueueLead(
      context,
      'claude_review_alpha',
      'https://example.com/alpha-source',
    )
    const second = await enqueueLead(
      context,
      'claude_review_beta',
      'https://example.com/beta-source',
    )

    const claimed = await claudeReview.claimNextPredictionLeadForClaudeReviewAgent({
      agentKey: 'review-default',
      trigger: 'manual',
      promptSummary: 'Inspect next pending lead.',
      workspaceCwd: '/tmp/review-default',
      leaseSeconds: 900,
    })

    expect(claimed.claimed).toBe(true)
    expect(claimed.run).toEqual(
      expect.objectContaining({
        agentKey: 'review-default',
        leadId: first.leadId,
        status: 'running',
      }),
    )
    expect(claimed.lead?.lead.id).toBe(first.leadId)
    expect(claimed.lead?.lead.status).toBe('pending')
    expect(claimed.resumeSessionId).toBeNull()

    const leadClaimState = await context.pool.query<{
      claude_review_claim_run_id: string | null
      claude_review_claimed_by_agent_key: string | null
    }>(
      `
        SELECT
          claude_review_claim_run_id,
          claude_review_claimed_by_agent_key
        FROM prediction_leads
        WHERE id = $1
      `,
      [first.leadId],
    )

    expect(leadClaimState.rows[0]).toEqual({
      claude_review_claim_run_id: claimed.run?.id ?? null,
      claude_review_claimed_by_agent_key: 'review-default',
    })

    const queueState = await context.pool.query<{ lead_id: string }>(
      `
        SELECT lead_id
        FROM claude_runner_runs
        ORDER BY created_at ASC
      `,
    )
    expect(queueState.rows.map((row) => row.lead_id)).toEqual([first.leadId])

    const secondClaim = await claudeReview.claimNextPredictionLeadForClaudeReviewAgent({
      agentKey: 'review-default',
      trigger: 'manual',
      promptSummary: 'Inspect next pending lead.',
      workspaceCwd: '/tmp/review-default',
      leaseSeconds: 900,
    })

    expect(secondClaim.claimed).toBe(true)
    expect(secondClaim.run?.leadId).toBe(second.leadId)

    await context.pool.end()
  })

  it('skips active leases, reclaims expired ones, and returns no-op when nothing is claimable', async () => {
    const context = await setupApiContext()
    const claudeReview = await import('./claude-review-agent')

    const lead = await enqueueLead(
      context,
      'claude_review_gamma',
      'https://example.com/gamma-source',
    )

    const firstClaim = await claudeReview.claimNextPredictionLeadForClaudeReviewAgent({
      agentKey: 'review-default',
      trigger: 'manual',
      promptSummary: 'Inspect next pending lead.',
      workspaceCwd: '/tmp/review-default',
      leaseSeconds: 900,
    })

    expect(firstClaim.claimed).toBe(true)

    const noWork = await claudeReview.claimNextPredictionLeadForClaudeReviewAgent({
      agentKey: 'review-default',
      trigger: 'manual',
      promptSummary: 'Inspect next pending lead.',
      workspaceCwd: '/tmp/review-default',
      leaseSeconds: 900,
    })

    expect(noWork).toEqual({
      claimed: false,
      run: null,
      lead: null,
      resumeSessionId: null,
    })

    await context.pool.query(
      `
        UPDATE prediction_leads
        SET claude_review_claim_expires_at = NOW() - INTERVAL '1 minute'
        WHERE id = $1
      `,
      [lead.leadId],
    )

    const reclaimed = await claudeReview.claimNextPredictionLeadForClaudeReviewAgent({
      agentKey: 'review-default',
      trigger: 'scheduled',
      promptSummary: 'Reclaim expired pending lead.',
      workspaceCwd: '/tmp/review-default',
      leaseSeconds: 900,
    })

    expect(reclaimed.claimed).toBe(true)
    expect(reclaimed.run?.leadId).toBe(lead.leadId)
    expect(reclaimed.run?.id).not.toBe(firstClaim.run?.id)

    await context.pool.end()
  })

  it('completes runs by storing a review result, session, and clearing the lease without mutating lead status', async () => {
    const context = await setupApiContext()
    const claudeReview = await import('./claude-review-agent')

    const lead = await enqueueLead(
      context,
      'claude_review_delta',
      'https://example.com/delta-source',
    )

    const claimed = await claudeReview.claimNextPredictionLeadForClaudeReviewAgent({
      agentKey: 'review-default',
      trigger: 'manual',
      promptSummary: 'Inspect next pending lead.',
      workspaceCwd: '/tmp/review-default',
      leaseSeconds: 900,
    })

    if (!claimed.run) {
      throw new Error('Expected a claimed run.')
    }

    const completed = await claudeReview.completeClaudeReviewAgentRun(
      claimed.run.id,
      {
        sessionId: 'session_review_1',
        providerRunId: 'provider_run_1',
        finalSummary: 'Accepted with medium confidence after source inspection.',
        costUsd: 0.013,
        tokenUsage: { input: 1200, output: 250 },
        toolUsage: { webFetchCalls: 1 },
        recommendation: {
          verdict: 'accept',
          confidence: 0.82,
          summary:
            'The source is specific, timely, and describes a settleable launch claim.',
          evidence: [
            {
              url: 'https://example.com/delta-source',
              excerpt: 'The launch claim is specific and date-bounded.',
            },
          ],
          needsHumanReview: false,
          recommendedFamilySlug: 'product_ship_date',
          recommendedEntitySlug: 'apple',
          duplicateLeadIds: [],
          duplicateMarketIds: [],
          normalizedHeadline: 'Apple will ship the referenced feature by the stated date.',
          normalizedSummary:
            'This lead maps cleanly to a product ship date market and is ready for operator review.',
          escalationReason: null,
        },
      },
    )

    expect(completed.run.status).toBe('completed')
    expect(completed.reviewResult.leadId).toBe(lead.leadId)
    expect(completed.reviewResult.verdict).toBe('accept')

    const leadState = await context.pool.query<{
      status: string
      claude_review_claim_run_id: string | null
      claude_review_claimed_by_agent_key: string | null
    }>(
      `
        SELECT
          status,
          claude_review_claim_run_id,
          claude_review_claimed_by_agent_key
        FROM prediction_leads
        WHERE id = $1
      `,
      [lead.leadId],
    )

    expect(leadState.rows[0]).toEqual({
      status: 'pending',
      claude_review_claim_run_id: null,
      claude_review_claimed_by_agent_key: null,
    })

    const sessionState = await context.pool.query<{
      session_id: string
      last_run_id: string | null
    }>(
      `
        SELECT session_id, last_run_id
        FROM claude_runner_sessions
        WHERE agent_key = 'review-default'
      `,
    )

    expect(sessionState.rows[0]).toEqual({
      session_id: 'session_review_1',
      last_run_id: claimed.run.id,
    })

    const reviewResults = await context.pool.query<{ count: number }>(
      `
        SELECT COUNT(*)::int AS count
        FROM prediction_review_results
        WHERE lead_id = $1
      `,
      [lead.leadId],
    )

    expect(reviewResults.rows[0]?.count).toBe(1)

    await context.pool.end()
  })

  it('supports completion without a session and rejects unknown or inactive runs', async () => {
    const context = await setupApiContext()
    const claudeReview = await import('./claude-review-agent')

    await expect(
      claudeReview.completeClaudeReviewAgentRun('claude_run_missing', {
        finalSummary: 'Missing run should fail.',
        costUsd: 0,
        recommendation: {
          verdict: 'reject',
          confidence: 0.1,
          summary:
            'This branch only exists to confirm missing runs fail loudly during completion.',
          evidence: [],
          needsHumanReview: false,
          duplicateLeadIds: [],
          duplicateMarketIds: [],
        },
      }),
    ).rejects.toThrow('Claude review run not found.')

    await enqueueLead(
      context,
      'claude_review_zeta',
      'https://example.com/zeta-source',
    )

    const claimed = await claudeReview.claimNextPredictionLeadForClaudeReviewAgent({
      agentKey: 'review-default',
      trigger: 'manual',
      promptSummary: 'Inspect next pending lead.',
      workspaceCwd: '/tmp/review-default',
      leaseSeconds: 900,
    })

    if (!claimed.run) {
      throw new Error('Expected a claimed run.')
    }

    const completed = await claudeReview.completeClaudeReviewAgentRun(
      claimed.run.id,
      {
        finalSummary: 'Rejected after source inspection without session persistence.',
        costUsd: 0.004,
        recommendation: {
          verdict: 'reject',
          confidence: 0.33,
          summary:
            'The source does not support a strong enough market claim and should be rejected.',
          evidence: [],
          needsHumanReview: false,
          duplicateLeadIds: [],
          duplicateMarketIds: [],
        },
        completedAt: '2026-03-21T00:05:00.000Z',
      },
    )

    expect(completed.run.status).toBe('completed')
    expect(completed.run.sessionId).toBeNull()
    expect(completed.run.completedAt).toBe('2026-03-21T00:05:00.000Z')
    expect(completed.run.tokenUsage).toBeNull()
    expect(completed.run.toolUsage).toBeNull()

    const sessions = await context.pool.query<{ count: number }>(
      `
        SELECT COUNT(*)::int AS count
        FROM claude_runner_sessions
        WHERE agent_key = 'review-default'
      `,
    )
    expect(sessions.rows[0]?.count).toBe(0)

    await expect(
      claudeReview.completeClaudeReviewAgentRun(claimed.run.id, {
        finalSummary: 'This completion should fail because the run is already closed.',
        costUsd: 0,
        recommendation: {
          verdict: 'reject',
          confidence: 0.1,
          summary:
            'Closed runs should not accept a second completion attempt under any circumstance.',
          evidence: [],
          needsHumanReview: false,
          duplicateLeadIds: [],
          duplicateMarketIds: [],
        },
      }),
    ).rejects.toThrow('Claude review run is no longer active.')

    await expect(
      claudeReview.failClaudeReviewAgentRun(claimed.run.id, {
        errorMessage: 'Closed runs should not accept failures either.',
        costUsd: 0,
      }),
    ).rejects.toThrow('Claude review run is no longer active.')

    await expect(
      claudeReview.failClaudeReviewAgentRun('claude_run_missing', {
        errorMessage: 'Missing run should fail loudly.',
        costUsd: 0,
      }),
    ).rejects.toThrow('Claude review run not found.')

    await context.pool.end()
  })

  it('fails runs explicitly, clears the lease, and blocks completion when the run no longer owns the lead', async () => {
    const context = await setupApiContext()
    const claudeReview = await import('./claude-review-agent')

    const lead = await enqueueLead(
      context,
      'claude_review_epsilon',
      'https://example.com/epsilon-source',
    )

    const claimed = await claudeReview.claimNextPredictionLeadForClaudeReviewAgent({
      agentKey: 'review-default',
      trigger: 'manual',
      promptSummary: 'Inspect next pending lead.',
      workspaceCwd: '/tmp/review-default',
      leaseSeconds: 900,
    })

    if (!claimed.run) {
      throw new Error('Expected a claimed run.')
    }

    await context.pool.query(
      `
        UPDATE prediction_leads
        SET
          claude_review_claim_run_id = NULL,
          claude_review_claimed_by_agent_key = NULL,
          claude_review_claimed_at = NULL,
          claude_review_claim_expires_at = NULL
        WHERE id = $1
      `,
      [lead.leadId],
    )

    await expect(
      claudeReview.completeClaudeReviewAgentRun(claimed.run.id, {
        finalSummary: 'Should fail because ownership was lost.',
        costUsd: 0,
        tokenUsage: null,
        toolUsage: null,
        recommendation: {
          verdict: 'reject',
          confidence: 0.2,
          summary:
            'The source is too weak to survive review, but this path should not reach persistence.',
          evidence: [],
          needsHumanReview: false,
          duplicateLeadIds: [],
          duplicateMarketIds: [],
        },
      }),
    ).rejects.toThrow('Claude review run no longer owns a pending lead claim.')

    await expect(
      claudeReview.failClaudeReviewAgentRun(claimed.run.id, {
        errorMessage: 'This run no longer owns the lead and must fail loudly.',
        costUsd: 0,
      }),
    ).rejects.toThrow('Claude review run no longer owns a pending lead claim.')

    await context.pool.query(
      `
        UPDATE prediction_leads
        SET
          claude_review_claim_run_id = $2,
          claude_review_claimed_by_agent_key = 'review-default',
          claude_review_claimed_at = NOW(),
          claude_review_claim_expires_at = NOW() + INTERVAL '10 minutes'
        WHERE id = $1
      `,
      [lead.leadId, claimed.run.id],
    )

    const failed = await claudeReview.failClaudeReviewAgentRun(claimed.run.id, {
      sessionId: 'session_review_2',
      providerRunId: 'provider_run_fail_1',
      errorMessage: 'Claude returned malformed structured output.',
      finalSummary: 'Run failed after model validation.',
      costUsd: 0.009,
      tokenUsage: { input: 800, output: 50 },
      toolUsage: { webFetchCalls: 1 },
      completedAt: '2026-03-21T00:10:00.000Z',
    })

    expect(failed.run.status).toBe('failed')
    expect(failed.run.errorMessage).toContain('malformed structured output')

    const leadState = await context.pool.query<{
      status: string
      claude_review_claim_run_id: string | null
    }>(
      `
        SELECT status, claude_review_claim_run_id
        FROM prediction_leads
        WHERE id = $1
      `,
      [lead.leadId],
    )

    expect(leadState.rows[0]).toEqual({
      status: 'pending',
      claude_review_claim_run_id: null,
    })

    await context.pool.end()
  })

  it('fails runs successfully even when optional metadata is omitted', async () => {
    const context = await setupApiContext()
    const claudeReview = await import('./claude-review-agent')

    await enqueueLead(
      context,
      'claude_review_eta',
      'https://example.com/eta-source',
    )

    const claimed = await claudeReview.claimNextPredictionLeadForClaudeReviewAgent({
      agentKey: 'review-default',
      trigger: 'manual',
      promptSummary: 'Inspect next pending lead.',
      workspaceCwd: '/tmp/review-default',
      leaseSeconds: 900,
    })

    if (!claimed.run) {
      throw new Error('Expected a claimed run.')
    }

    const failed = await claudeReview.failClaudeReviewAgentRun(claimed.run.id, {
      errorMessage: 'Model run aborted before emitting structured metadata.',
      costUsd: 0,
    })

    expect(failed.run.status).toBe('failed')
    expect(failed.run.providerRunId).toBeNull()
    expect(failed.run.finalSummary).toBeNull()
    expect(failed.run.tokenUsage).toBeNull()
    expect(failed.run.toolUsage).toBeNull()

    await context.pool.end()
  })
})
