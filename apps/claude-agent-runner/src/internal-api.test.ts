import { afterEach, describe, expect, it, vi } from 'vitest'

import { internalPredictionLeadDetailSchema } from '../../../packages/shared/src/types'

import {
  appendClaudeReviewRunEvent,
  claimNextClaudeReviewLead,
  completeClaudeReviewRun,
  failClaudeReviewRun,
} from './internal-api'

const config = {
  internalApiBaseUrl: 'http://localhost:8787/api/v1',
  internalServiceToken: 'service-token',
  anthropicApiKey: 'anthropic-key',
  model: 'claude-sonnet-4-5',
  agentKey: 'review-default',
  maxTurns: 8,
  maxBudgetUsd: 1,
  leaseSeconds: 900,
  workspaceRoot: '/tmp/claude-review',
}

function buildLeadDetail() {
  return internalPredictionLeadDetailSchema.parse({
    lead: {
      id: 'lead_1',
      leadType: 'structured_agent_lead',
      submittedByAgentId: 'agent_1',
      submittedByOwnerEmail: null,
      sourceUrl: 'https://example.com/source',
      normalizedSourceUrl: 'https://example.com/source',
      sourceDomain: 'example.com',
      sourceType: 'blog',
      sourceLabel: 'Example',
      sourceNote: null,
      sourcePublishedAt: null,
      claimedHeadline: 'Claimed headline',
      claimedSubject: 'Claimed subject',
      claimedCategory: 'software_release',
      familyId: null,
      familySlug: null,
      familyDisplayName: null,
      primaryEntityId: null,
      primaryEntitySlug: null,
      primaryEntityDisplayName: null,
      eventGroupId: null,
      promisedDate: '2027-12-31T23:59:59.000Z',
      summary: 'A summary with enough detail to satisfy schema validation.',
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
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:00:00.000Z',
      submittedBy: null,
    },
    relatedPendingLeads: [],
    recentReviewedLeads: [],
    recentReviewResults: [],
  })
}

function buildRun(status: 'running' | 'completed' | 'failed' = 'running') {
  return {
    id: 'claude_run_1',
    agentKey: 'review-default',
    leadId: 'lead_1',
    sessionId: 'session_1',
    providerRunId: 'provider_1',
    status,
    trigger: 'manual',
    workspaceCwd: '/tmp/claude-review/review-default',
    promptSummary: 'Inspect the next lead.',
    finalSummary: status === 'running' ? null : 'Review completed.',
    errorMessage: status === 'failed' ? 'Malformed output.' : null,
    costUsd: 0.02,
    tokenUsage: { input: 1000 },
    toolUsage: { permissionDenials: [] },
    recommendation: status === 'running' ? null : buildRecommendation(),
    startedAt: '2026-03-21T00:00:00.000Z',
    completedAt: status === 'running' ? null : '2026-03-21T00:10:00.000Z',
    createdAt: '2026-03-21T00:00:00.000Z',
    updatedAt: '2026-03-21T00:10:00.000Z',
  }
}

function buildReviewResult() {
  return {
    runId: 'claude_run_1',
    leadId: 'lead_1',
    submissionId: 'submission_1',
    reviewer: 'review-default',
    verdict: 'accept',
    confidence: 0.81,
    summary:
      'The source is specific, public, and maps to a settleable market.',
    evidence: [
      {
        url: 'https://example.com/source',
        excerpt: 'The source is public and settleable.',
      },
    ],
    snapshotRef: null,
    needsHumanReview: false,
    providerRunId: 'provider_1',
    createdAt: '2026-03-21T00:10:00.000Z',
  }
}

function buildRecommendation() {
  return {
    verdict: 'accept' as const,
    confidence: 0.81,
    summary:
      'The source is specific, public, and maps to a settleable market.',
    evidence: [
      {
        url: 'https://example.com/source',
        excerpt: 'The source is public and settleable.',
      },
    ],
    needsHumanReview: false,
    duplicateLeadIds: [],
    duplicateMarketIds: [],
    recommendedFamilySlug: 'product_ship_date' as const,
    recommendedEntitySlug: 'apple',
    normalizedHeadline:
      'Apple ships the referenced feature by the stated deadline.',
    normalizedSummary:
      'The source maps cleanly to a settleable product ship-date market.',
    escalationReason: null,
  }
}

describe('claude review internal api client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('posts to each internal endpoint and parses structured responses', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        input instanceof URL
          ? input.toString()
          : input instanceof Request
            ? input.url
            : input
      const path = url.replace(config.internalApiBaseUrl, '')
      expect(init?.headers).toEqual({
        Authorization: 'Bearer service-token',
        'Content-Type': 'application/json',
      })

      if (path === '/internal/claude-review-agent/claim-next') {
        expect(init?.method).toBe('POST')
        expect(init?.body).toBe(
          JSON.stringify({
            agentKey: 'review-default',
            trigger: 'manual',
            promptSummary: 'Inspect next pending lead.',
            workspaceCwd: '/tmp/review-default',
            leaseSeconds: 900,
          }),
        )
        return new Response(
          JSON.stringify({
            claimed: true,
            run: buildRun(),
            lead: buildLeadDetail(),
          }),
          { status: 200 },
        )
      }

      if (path === '/internal/claude-review-agent/runs/claude_run_1/events') {
        return new Response(
          JSON.stringify({
            id: 'event_1',
            runId: 'claude_run_1',
            eventType: 'claude_review_started',
            payload: { step: 1 },
            createdAt: '2026-03-21T00:05:00.000Z',
          }),
          { status: 200 },
        )
      }

      if (path === '/internal/claude-review-agent/runs/claude_run_1/complete') {
        return new Response(
          JSON.stringify({
            run: buildRun('completed'),
            reviewResult: buildReviewResult(),
          }),
          { status: 200 },
        )
      }

      if (path === '/internal/claude-review-agent/runs/claude_run_1/fail') {
        return new Response(
          JSON.stringify({
            run: buildRun('failed'),
          }),
          { status: 200 },
        )
      }

      throw new Error(`Unexpected path ${path}.`)
    })

    await expect(
      claimNextClaudeReviewLead(
        config,
        {
          agentKey: 'review-default',
          trigger: 'manual',
          promptSummary: 'Inspect next pending lead.',
          workspaceCwd: '/tmp/review-default',
          leaseSeconds: 900,
        },
        fetchImpl,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        claimed: true,
      }),
    )

    await expect(
      appendClaudeReviewRunEvent(
        config,
        'claude_run_1',
        {
          eventType: 'claude_review_started',
          payload: { step: 1 },
        },
        fetchImpl,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'event_1',
        eventType: 'claude_review_started',
      }),
    )

    await expect(
      completeClaudeReviewRun(
        config,
        'claude_run_1',
        {
          sessionId: 'session_1',
          providerRunId: 'provider_1',
          finalSummary: 'Completed review.',
          costUsd: 0.02,
          tokenUsage: { input: 1000 },
          toolUsage: { permissionDenials: [] },
          recommendation: buildRecommendation(),
        },
        fetchImpl,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        run: expect.objectContaining({ status: 'completed' }),
        reviewResult: expect.objectContaining({ verdict: 'accept' }),
      }),
    )

    await expect(
      failClaudeReviewRun(
        config,
        'claude_run_1',
        {
          errorMessage: 'Malformed output.',
          costUsd: 0.02,
        },
        fetchImpl,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        run: expect.objectContaining({ status: 'failed' }),
      }),
    )
  })

  it('surfaces explicit api error messages', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify({ message: 'Lead claim is already leased.' }), {
        status: 409,
      })
    })

    await expect(
      claimNextClaudeReviewLead(
        config,
        {
          agentKey: 'review-default',
          trigger: 'manual',
          promptSummary: 'Inspect next pending lead.',
          workspaceCwd: '/tmp/review-default',
          leaseSeconds: 900,
        },
        fetchImpl,
      ),
    ).rejects.toThrow('Lead claim is already leased.')
  })

  it('fails loudly when the internal api returns a non-json error payload', async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response('bad gateway', { status: 502 })
    })

    await expect(
      appendClaudeReviewRunEvent(
        config,
        'claude_run_1',
        {
          eventType: 'claude_review_started',
          payload: null,
        },
        fetchImpl,
      ),
    ).rejects.toThrow(
      'Claude review internal API request failed with status 502.',
    )
  })

  it('uses the global fetch implementation when no override is provided', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            claimed: false,
            run: null,
            lead: null,
          }),
          { status: 200 },
        ),
      )

    await expect(
      claimNextClaudeReviewLead(config, {
        agentKey: 'review-default',
        trigger: 'manual',
        promptSummary: 'Inspect next pending lead.',
        workspaceCwd: '/tmp/review-default',
        leaseSeconds: 900,
      }),
    ).resolves.toEqual({
      claimed: false,
      run: null,
      lead: null,
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
