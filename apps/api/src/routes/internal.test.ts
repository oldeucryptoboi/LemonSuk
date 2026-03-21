import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

describe('createInternalRouter', () => {
  function buildLead(id: string) {
    return {
      id,
      leadType: 'structured_agent_lead',
      submittedByAgentId: 'agent_1',
      submittedByOwnerEmail: null,
      sourceUrl: 'https://example.com/source',
      normalizedSourceUrl: 'https://example.com/source',
      sourceLabel: 'example.com',
      sourceDomain: 'example.com',
      sourceType: 'blog',
      sourceNote: null,
      sourcePublishedAt: null,
      claimedHeadline: 'Queued headline',
      claimedSubject: 'Queued subject',
      claimedCategory: 'social',
      familyId: null,
      familySlug: null,
      familyDisplayName: null,
      primaryEntityId: null,
      primaryEntitySlug: null,
      primaryEntityDisplayName: null,
      eventGroupId: null,
      promisedDate: '2027-12-31T23:59:59.000Z',
      summary: 'Queued summary that is long enough for schema validation.',
      tags: [],
      status: 'pending',
      spamScore: 0,
      duplicateOfLeadId: null,
      duplicateOfMarketId: null,
      reviewNotes: null,
      linkedMarketId: null,
      reviewedAt: null,
      legacyAgentSubmissionId: 'submission_1',
      legacyHumanSubmissionId: null,
      createdAt: '2026-03-17T00:00:00.000Z',
      updatedAt: '2026-03-17T00:00:00.000Z',
      submittedBy: {
        id: 'agent_1',
        handle: 'alpha',
        displayName: 'Alpha',
      },
    }
  }

  function buildLeadQueue() {
    return {
      pendingCount: 1,
      items: [buildLead('lead_1')],
    }
  }

  function buildClaudeRun(id: string) {
    return {
      id,
      agentKey: 'review-default',
      leadId: 'lead_1',
      sessionId: 'session_1',
      providerRunId: 'provider_1',
      status: 'running',
      trigger: 'manual',
      workspaceCwd: '/tmp/review-default',
      promptSummary: 'Inspect next pending lead.',
      finalSummary: null,
      errorMessage: null,
      costUsd: 0,
      tokenUsage: null,
      toolUsage: null,
      recommendation: null,
      startedAt: '2026-03-21T00:00:00.000Z',
      completedAt: null,
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:00:00.000Z',
    }
  }

  function buildClaudeRecommendation() {
    return {
      verdict: 'accept',
      confidence: 0.82,
      summary:
        'The source is specific and deserves operator review as a viable market candidate.',
      evidence: [
        {
          url: 'https://example.com/source',
          excerpt: 'This source is specific and dated.',
        },
      ],
      needsHumanReview: false,
      recommendedFamilySlug: 'product_ship_date',
      recommendedEntitySlug: 'apple',
      duplicateLeadIds: [],
      duplicateMarketIds: [],
      normalizedHeadline: 'Apple ships the referenced feature by the stated deadline.',
      normalizedSummary:
        'The source maps cleanly onto a product ship-date market and is ready for operator review.',
      escalationReason: null,
    }
  }

  async function buildRouteApp() {
    const { createInternalRouter } = await import('./internal')
    const app = express()
    app.use(express.json())
    app.use('/api/v1', createInternalRouter())
    app.use(
      (
        error: unknown,
        _request: express.Request,
        response: express.Response,
        _next: express.NextFunction,
      ) => {
        response.status(500).json({
          message:
            error instanceof Error ? error.message : 'Internal server error.',
        })
      },
    )
    return app
  }

  it('requires auth and supports lead inbox/detail/status/result routes', async () => {
    vi.resetModules()

    const readPendingPredictionLeads = vi.fn(async () => buildLeadQueue())
    const readPredictionLeadForInternal = vi.fn(async (leadId: string) =>
      leadId === 'missing' ? null : buildLead(leadId),
    )
    const readPredictionLeadInspectionForInternal = vi.fn(async (leadId: string) =>
      leadId === 'missing'
        ? null
        : {
            lead: buildLead(leadId),
            relatedPendingLeads: [],
            recentReviewedLeads: [],
            recentReviewResults: [],
          },
    )
    const updatePredictionLeadStatusForInternal = vi.fn(async () => ({
      ...buildLead('lead_1'),
      status: 'in_review',
      reviewNotes: 'Picked up.',
    }))
    const applyPredictionLeadReviewResultForInternal = vi.fn(async () => ({
      lead: {
        ...buildLead('lead_1'),
        status: 'accepted',
        linkedMarketId: 'optimus-customizable-2026',
        reviewedAt: '2026-03-17T00:00:30.000Z',
      },
      reviewResult: {
        runId: 'run_2',
      },
    }))
    const claimNextPredictionLeadForClaudeReviewAgent = vi.fn(async () => ({
      claimed: true,
      run: buildClaudeRun('claude_run_1'),
      lead: {
        lead: buildLead('lead_1'),
        relatedPendingLeads: [],
        recentReviewedLeads: [],
        recentReviewResults: [],
      },
    }))
    const appendClaudeReviewAgentRunEvent = vi.fn(async () => ({
      id: 'claude_event_1',
      runId: 'claude_run_1',
      eventType: 'claude_review_started',
      payload: { leadId: 'lead_1' },
      createdAt: '2026-03-21T00:00:10.000Z',
    }))
    const completeClaudeReviewAgentRun = vi.fn(async () => ({
      run: {
        ...buildClaudeRun('claude_run_1'),
        status: 'completed',
        finalSummary: 'Completed review.',
        completedAt: '2026-03-21T00:01:00.000Z',
        updatedAt: '2026-03-21T00:01:00.000Z',
        costUsd: 0.01,
        recommendation: buildClaudeRecommendation(),
      },
      reviewResult: {
        runId: 'claude_run_1',
        leadId: 'lead_1',
        submissionId: 'submission_1',
        reviewer: 'review-default',
        verdict: 'accept',
        confidence: 0.82,
        summary:
          'The source is specific and deserves operator review as a viable market candidate.',
        evidence: [
          {
            url: 'https://example.com/source',
            excerpt: 'This source is specific and dated.',
          },
        ],
        needsHumanReview: false,
        snapshotRef: null,
        providerRunId: 'provider_1',
        createdAt: '2026-03-21T00:01:00.000Z',
      },
    }))
    const failClaudeReviewAgentRun = vi.fn(async () => ({
      run: {
        ...buildClaudeRun('claude_run_1'),
        status: 'failed',
        errorMessage: 'Claude review failed.',
        completedAt: '2026-03-21T00:01:00.000Z',
        updatedAt: '2026-03-21T00:01:00.000Z',
      },
    }))
    const publishCurrentOperationalSnapshot = vi.fn(async () => ({}))

    vi.doMock('../services/lead-intake', () => ({
      readPendingPredictionLeads,
    }))
    vi.doMock('../services/claude-review-agent', () => ({
      claimNextPredictionLeadForClaudeReviewAgent,
      appendClaudeReviewAgentRunEvent,
      completeClaudeReviewAgentRun,
      failClaudeReviewAgentRun,
    }))
    vi.doMock('../services/lead-review-workflow', () => ({
      readPredictionLeadForInternal,
      readPredictionLeadInspectionForInternal,
      updatePredictionLeadStatusForInternal,
      applyPredictionLeadReviewResultForInternal,
    }))
    vi.doMock('./helpers', () => ({
      publishCurrentOperationalSnapshot,
    }))

    const app = await buildRouteApp()

    expect((await request(app).get('/api/v1/internal/leads')).statusCode).toBe(401)

    const authorization = {
      authorization: 'Bearer lemonsuk-dev-internal-service-token',
    }

    expect(
      (
        await request(app)
          .get('/api/v1/internal/leads?limit=40')
          .set(authorization)
      ).body.pendingCount,
    ).toBe(1)
    expect(readPendingPredictionLeads).toHaveBeenCalledWith({ limit: 40 })

    expect(
      (
        await request(app)
          .get('/api/v1/internal/leads/missing')
          .set(authorization)
      ).statusCode,
    ).toBe(404)

    expect(
      (
        await request(app)
          .get('/api/v1/internal/leads/lead_1')
          .set(authorization)
      ).body.id,
    ).toBe('lead_1')
    expect(
      (
        await request(app)
          .get('/api/v1/internal/leads/lead_1/inspect')
          .set(authorization)
      ).body.lead.id,
    ).toBe('lead_1')
    expect(
      (
        await request(app)
          .get('/api/v1/internal/leads/missing/inspect')
          .set(authorization)
      ).statusCode,
    ).toBe(404)

    expect(
      (
        await request(app)
          .post('/api/v1/internal/leads/lead_1/status')
          .set(authorization)
          .send({
            status: 'in_review',
            runId: 'run_1',
            note: 'Picked up.',
          })
      ).statusCode,
    ).toBe(200)
    expect(updatePredictionLeadStatusForInternal).toHaveBeenCalledWith(
      'lead_1',
      expect.objectContaining({
        status: 'in_review',
      }),
    )

    expect(
      (
        await request(app)
          .post('/api/v1/internal/leads/lead_1/review-result')
          .set(authorization)
          .send({
            runId: 'run_2',
            reviewer: 'eddie',
            verdict: 'accept',
            confidence: 0.8,
            summary:
              'This review result is long enough to validate and should be accepted by the route.',
            evidence: [
              {
                url: 'https://example.com/source',
                excerpt: 'This source should be accepted.',
              },
            ],
            needsHumanReview: false,
            linkedMarketId: 'optimus-customizable-2026',
          })
      ).statusCode,
    ).toBe(200)
    expect(applyPredictionLeadReviewResultForInternal).toHaveBeenCalledTimes(1)
    expect(publishCurrentOperationalSnapshot).toHaveBeenCalledTimes(2)

    expect(
      (
        await request(app)
          .post('/api/v1/internal/claude-review-agent/claim-next')
          .set(authorization)
          .send({
            agentKey: 'review-default',
            trigger: 'manual',
            promptSummary: 'Inspect next pending lead.',
            workspaceCwd: '/tmp/review-default',
            leaseSeconds: 900,
          })
      ).body.claimed,
    ).toBe(true)
    expect(claimNextPredictionLeadForClaudeReviewAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentKey: 'review-default',
      }),
    )

    expect(
      (
        await request(app)
          .post('/api/v1/internal/claude-review-agent/runs/claude_run_1/events')
          .set(authorization)
          .send({
            eventType: 'claude_review_started',
            payload: { leadId: 'lead_1' },
          })
      ).body.eventType,
    ).toBe('claude_review_started')

    expect(
      (
        await request(app)
          .post('/api/v1/internal/claude-review-agent/runs/claude_run_1/complete')
          .set(authorization)
          .send({
            sessionId: 'session_1',
            providerRunId: 'provider_1',
            finalSummary: 'Completed review.',
            costUsd: 0.01,
            tokenUsage: { input: 1000 },
            toolUsage: { webFetchCalls: 1 },
            recommendation: buildClaudeRecommendation(),
          })
      ).body.run.status,
    ).toBe('completed')

    expect(
      (
        await request(app)
          .post('/api/v1/internal/claude-review-agent/runs/claude_run_1/fail')
          .set(authorization)
          .send({
            errorMessage: 'Claude review failed.',
            costUsd: 0,
          })
      ).body.run.status,
    ).toBe('failed')
  })

  it('maps lead workflow errors and fallback messages', async () => {
    vi.resetModules()

    const publishCurrentOperationalSnapshot = vi.fn(async () => ({}))
    const readPendingPredictionLeads = vi.fn(async () => {
      throw 'queue-failed'
    })
    const readPredictionLeadForInternal = vi.fn(async () => {
      throw new Error('lead-read-failed')
    })
    const readPredictionLeadInspectionForInternal = vi.fn(async () => {
      throw new Error('lead-inspect-failed')
    })
    const updatePredictionLeadStatusForInternal = vi
      .fn()
      .mockRejectedValueOnce(new Error('Prediction lead not found.'))
      .mockRejectedValueOnce(
        new Error('Prediction lead is no longer pending review.'),
      )
      .mockRejectedValueOnce('status-failed')
    const applyPredictionLeadReviewResultForInternal = vi
      .fn()
      .mockRejectedValueOnce(new Error('Prediction lead not found.'))
      .mockRejectedValueOnce(new Error('Linked market not found.'))
      .mockRejectedValueOnce('result-failed')
    const claimNextPredictionLeadForClaudeReviewAgent = vi
      .fn()
      .mockRejectedValueOnce('claim-failed')
    const appendClaudeReviewAgentRunEvent = vi
      .fn()
      .mockRejectedValueOnce(new Error('Claude review run not found.'))
      .mockRejectedValueOnce('event-failed')
    const completeClaudeReviewAgentRun = vi
      .fn()
      .mockRejectedValueOnce(new Error('Claude review run not found.'))
      .mockRejectedValueOnce(
        new Error('Claude review run no longer owns a pending lead claim.'),
      )
      .mockRejectedValueOnce('complete-failed')
    const failClaudeReviewAgentRun = vi
      .fn()
      .mockRejectedValueOnce(new Error('Claude review run not found.'))
      .mockRejectedValueOnce(
        new Error('Claude review run no longer owns a pending lead claim.'),
      )
      .mockRejectedValueOnce('fail-failed')

    vi.doMock('../services/lead-intake', () => ({
      readPendingPredictionLeads,
    }))
    vi.doMock('../services/claude-review-agent', () => ({
      claimNextPredictionLeadForClaudeReviewAgent,
      appendClaudeReviewAgentRunEvent,
      completeClaudeReviewAgentRun,
      failClaudeReviewAgentRun,
    }))
    vi.doMock('../services/lead-review-workflow', () => ({
      readPredictionLeadForInternal,
      readPredictionLeadInspectionForInternal,
      updatePredictionLeadStatusForInternal,
      applyPredictionLeadReviewResultForInternal,
    }))
    vi.doMock('./helpers', () => ({
      publishCurrentOperationalSnapshot,
    }))

    const app = await buildRouteApp()
    const authorization = {
      authorization: 'Bearer lemonsuk-dev-internal-service-token',
    }

    expect(
      (
        await request(app)
          .get('/api/v1/internal/leads')
          .set(authorization)
      ).body.message,
    ).toBe('Internal server error.')

    expect(
      (
        await request(app)
          .get('/api/v1/internal/leads/lead_1')
          .set(authorization)
      ).body.message,
    ).toBe('lead-read-failed')
    expect(
      (
        await request(app)
          .get('/api/v1/internal/leads/lead_1/inspect')
          .set(authorization)
      ).body.message,
    ).toBe('lead-inspect-failed')

    expect(
      (
        await request(app)
          .post('/api/v1/internal/leads/lead_1/status')
          .set(authorization)
          .send({
            status: 'failed',
            note: 'missing',
          })
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await request(app)
          .post('/api/v1/internal/leads/lead_1/status')
          .set(authorization)
          .send({
            status: 'failed',
            note: 'terminal',
          })
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await request(app)
          .post('/api/v1/internal/leads/lead_1/status')
          .set(authorization)
          .send({
            status: 'failed',
            note: 'fallback',
          })
      ).body.message,
    ).toBe('Could not update lead status.')

    expect(
      (
        await request(app)
          .post('/api/v1/internal/leads/lead_1/review-result')
          .set(authorization)
          .send({
            runId: 'run_1',
            reviewer: 'eddie',
            verdict: 'reject',
            confidence: 0.4,
            summary:
              'This review result is long enough to validate and should be accepted by the route.',
            evidence: [
              {
                url: 'https://example.com/source',
                excerpt: 'This source should be rejected.',
              },
            ],
            needsHumanReview: false,
          })
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await request(app)
          .post('/api/v1/internal/leads/lead_1/review-result')
          .set(authorization)
          .send({
            runId: 'run_2',
            reviewer: 'eddie',
            verdict: 'accept',
            confidence: 0.8,
            summary:
              'This review result is long enough to validate and should be accepted by the route.',
            evidence: [
              {
                url: 'https://example.com/source',
                excerpt: 'This source should be accepted.',
              },
            ],
            needsHumanReview: false,
            linkedMarketId: 'missing-market',
          })
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await request(app)
          .post('/api/v1/internal/leads/lead_1/review-result')
          .set(authorization)
          .send({
            runId: 'run_3',
            reviewer: 'eddie',
            verdict: 'reject',
            confidence: 0.4,
            summary:
              'This review result is long enough to validate and should be accepted by the route.',
            evidence: [
              {
                url: 'https://example.com/source',
                excerpt: 'This source should be rejected.',
              },
            ],
            needsHumanReview: false,
          })
      ).body.message,
    ).toBe('Could not apply prediction lead review result.')

    expect(
      (
        await request(app)
          .post('/api/v1/internal/claude-review-agent/claim-next')
          .set(authorization)
          .send({
            agentKey: 'review-default',
            trigger: 'manual',
            promptSummary: 'Inspect next pending lead.',
            workspaceCwd: '/tmp/review-default',
            leaseSeconds: 900,
          })
      ).body.message,
    ).toBe('Internal server error.')

    expect(
      (
        await request(app)
          .post('/api/v1/internal/claude-review-agent/runs/claude_run_1/events')
          .set(authorization)
          .send({
            eventType: 'claude_review_started',
            payload: { leadId: 'lead_1' },
          })
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await request(app)
          .post('/api/v1/internal/claude-review-agent/runs/claude_run_1/events')
          .set(authorization)
          .send({
            eventType: 'claude_review_started',
            payload: { leadId: 'lead_1' },
          })
      ).body.message,
    ).toBe('Could not append Claude review run event.')

    const validCompleteBody = {
      sessionId: 'session_1',
      providerRunId: 'provider_1',
      finalSummary: 'Completed review.',
      costUsd: 0.01,
      tokenUsage: { input: 1000 },
      toolUsage: { webFetchCalls: 1 },
      recommendation: buildClaudeRecommendation(),
    }

    expect(
      (
        await request(app)
          .post('/api/v1/internal/claude-review-agent/runs/claude_run_1/complete')
          .set(authorization)
          .send(validCompleteBody)
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await request(app)
          .post('/api/v1/internal/claude-review-agent/runs/claude_run_1/complete')
          .set(authorization)
          .send(validCompleteBody)
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await request(app)
          .post('/api/v1/internal/claude-review-agent/runs/claude_run_1/complete')
          .set(authorization)
          .send(validCompleteBody)
      ).body.message,
    ).toBe('Could not complete Claude review run.')

    expect(
      (
        await request(app)
          .post('/api/v1/internal/claude-review-agent/runs/claude_run_1/fail')
          .set(authorization)
          .send({
            errorMessage: 'Review run failed.',
            costUsd: 0,
          })
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await request(app)
          .post('/api/v1/internal/claude-review-agent/runs/claude_run_1/fail')
          .set(authorization)
          .send({
            errorMessage: 'Review run failed.',
            costUsd: 0,
          })
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await request(app)
          .post('/api/v1/internal/claude-review-agent/runs/claude_run_1/fail')
          .set(authorization)
          .send({
            errorMessage: 'Review run failed.',
            costUsd: 0,
          })
      ).body.message,
    ).toBe('Could not fail Claude review run.')

    expect(publishCurrentOperationalSnapshot).not.toHaveBeenCalled()
  })
})
