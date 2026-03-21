import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const claimNextClaudeReviewLead = vi.fn()
const appendClaudeReviewRunEvent = vi.fn()
const completeClaudeReviewRun = vi.fn()
const failClaudeReviewRun = vi.fn()

vi.mock('./internal-api', () => ({
  claimNextClaudeReviewLead,
  appendClaudeReviewRunEvent,
  completeClaudeReviewRun,
  failClaudeReviewRun,
}))

describe('runClaudeReviewAgent', () => {
  const config = {
    internalApiBaseUrl: 'http://localhost:8787/api/v1',
    internalServiceToken: 'token',
    anthropicApiKey: 'test-key',
    model: 'claude-sonnet-4-5',
    agentKey: 'review-default',
    maxTurns: 8,
    maxBudgetUsd: 1,
    leaseSeconds: 900,
    workspaceRoot: '/tmp/claude-review',
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    vi.unmock('./sdk')
  })

  it('returns an explicit no-work result when no lead is claimable', async () => {
    const { runClaudeReviewAgent } = await import('./review-agent')
    claimNextClaudeReviewLead.mockResolvedValue({
      claimed: false,
      run: null,
      lead: null,
    })

    await expect(
      runClaudeReviewAgent({
        config,
        modelClient: {
          reviewLead: vi.fn(),
        },
      }),
    ).resolves.toEqual({
      claimed: false,
    })

    expect(appendClaudeReviewRunEvent).not.toHaveBeenCalled()
    expect(completeClaudeReviewRun).not.toHaveBeenCalled()
  })

  it('fails loudly when a claimed payload is missing run state or lead detail', async () => {
    const { runClaudeReviewAgent } = await import('./review-agent')
    claimNextClaudeReviewLead.mockResolvedValue({
      claimed: true,
      run: null,
      lead: null,
    })

    await expect(
      runClaudeReviewAgent({
        config,
        modelClient: {
          reviewLead: vi.fn(),
        },
      }),
    ).rejects.toThrow(
      'Claude review agent claim response was malformed: claimed work is missing run or lead detail.',
    )
  })

  it('records events and completes the run on a successful model recommendation', async () => {
    const { runClaudeReviewAgent } = await import('./review-agent')

    claimNextClaudeReviewLead.mockResolvedValue({
      claimed: true,
      run: {
        id: 'claude_run_1',
        agentKey: 'review-default',
        leadId: 'lead_1',
        sessionId: null,
        providerRunId: null,
        status: 'running',
        trigger: 'manual',
        workspaceCwd: '/tmp/claude-review/review-default',
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
      },
      lead: {
        lead: {
          id: 'lead_1',
        },
        relatedPendingLeads: [],
        recentReviewedLeads: [],
        recentReviewResults: [],
      },
    })
    appendClaudeReviewRunEvent.mockResolvedValue({
      id: 'event_1',
      runId: 'claude_run_1',
      eventType: 'claude_review_started',
      payload: {},
      createdAt: '2026-03-21T00:00:10.000Z',
    })
    completeClaudeReviewRun.mockResolvedValue({
      run: {
        id: 'claude_run_1',
        status: 'completed',
      },
      reviewResult: {
        runId: 'claude_run_1',
        verdict: 'accept',
        confidence: 0.82,
      },
    })

    const outcome = await runClaudeReviewAgent({
      config,
      modelClient: {
        reviewLead: vi.fn().mockResolvedValue({
          sessionId: 'session_1',
          providerRunId: 'provider_1',
          finalSummary: 'Completed review.',
          costUsd: 0.01,
          tokenUsage: { input: 1000 },
          toolUsage: { webFetchCalls: 1 },
          recommendation: {
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
            duplicateLeadIds: [],
            duplicateMarketIds: [],
            recommendedFamilySlug: 'product_ship_date',
            recommendedEntitySlug: 'apple',
            normalizedHeadline:
              'Apple ships the referenced feature by the stated deadline.',
            normalizedSummary:
              'The source maps cleanly to a settleable product ship-date market.',
            escalationReason: null,
          },
        }),
      },
    })

    expect(outcome).toEqual({
      claimed: true,
      run: {
        id: 'claude_run_1',
        status: 'completed',
      },
      reviewResult: {
        runId: 'claude_run_1',
        verdict: 'accept',
        confidence: 0.82,
      },
    })
    expect(appendClaudeReviewRunEvent).toHaveBeenCalledTimes(2)
    expect(appendClaudeReviewRunEvent).toHaveBeenNthCalledWith(
      1,
      config,
      'claude_run_1',
      {
        eventType: 'claude_review_started',
        payload: {
          leadId: 'lead_1',
        },
      },
      undefined,
    )
    expect(completeClaudeReviewRun).toHaveBeenCalledTimes(1)
    expect(failClaudeReviewRun).not.toHaveBeenCalled()
  })

  it('fails the run and rethrows when the model raises an execution error', async () => {
    const { runClaudeReviewAgent } = await import('./review-agent')
    const { ClaudeReviewAgentExecutionError } = await import('./sdk')

    claimNextClaudeReviewLead.mockResolvedValue({
      claimed: true,
      run: {
        id: 'claude_run_2',
        agentKey: 'review-default',
        leadId: 'lead_2',
        sessionId: null,
        providerRunId: null,
        status: 'running',
        trigger: 'manual',
        workspaceCwd: '/tmp/claude-review/review-default',
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
      },
      lead: {
        lead: {
          id: 'lead_2',
        },
        relatedPendingLeads: [],
        recentReviewedLeads: [],
        recentReviewResults: [],
      },
    })
    appendClaudeReviewRunEvent.mockResolvedValue({
      id: 'event_2',
      runId: 'claude_run_2',
      eventType: 'claude_review_started',
      payload: {},
      createdAt: '2026-03-21T00:00:10.000Z',
    })
    failClaudeReviewRun.mockResolvedValue({
      run: {
        id: 'claude_run_2',
        status: 'failed',
      },
    })

    const error = new ClaudeReviewAgentExecutionError('Structured output invalid.', {
      sessionId: 'session_2',
      providerRunId: 'provider_2',
      costUsd: 0.02,
      tokenUsage: { input: 1200 },
      toolUsage: { webFetchCalls: 2 },
    })

    await expect(
      runClaudeReviewAgent({
        config,
        modelClient: {
          reviewLead: vi.fn().mockRejectedValue(error),
        },
      }),
    ).rejects.toThrow('Structured output invalid.')

    expect(failClaudeReviewRun).toHaveBeenCalledWith(
      config,
      'claude_run_2',
      expect.objectContaining({
        sessionId: 'session_2',
        providerRunId: 'provider_2',
        errorMessage: 'Structured output invalid.',
        costUsd: 0.02,
      }),
      undefined,
    )
  })

  it('surfaces cleanup failures instead of hiding them', async () => {
    const { runClaudeReviewAgent } = await import('./review-agent')

    claimNextClaudeReviewLead.mockResolvedValue({
      claimed: true,
      run: {
        id: 'claude_run_3',
        agentKey: 'review-default',
        leadId: 'lead_3',
        sessionId: null,
        providerRunId: null,
        status: 'running',
        trigger: 'manual',
        workspaceCwd: '/tmp/claude-review/review-default',
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
      },
      lead: {
        lead: {
          id: 'lead_3',
        },
        relatedPendingLeads: [],
        recentReviewedLeads: [],
        recentReviewResults: [],
      },
    })
    appendClaudeReviewRunEvent.mockResolvedValue({
      id: 'event_3',
      runId: 'claude_run_3',
      eventType: 'claude_review_started',
      payload: {},
      createdAt: '2026-03-21T00:00:10.000Z',
    })
    failClaudeReviewRun.mockRejectedValue(new Error('Database write failed.'))

    await expect(
      runClaudeReviewAgent({
        config,
        modelClient: {
          reviewLead: vi
            .fn()
            .mockRejectedValue(new Error('Claude transport died.')),
        },
      }),
    ).rejects.toThrow(
      'Claude transport died. Also failed to record Claude review run failure: Database write failed.',
    )
  })

  it('creates a default model client and normalizes non-error failures before recording them', async () => {
    const createClaudeReviewModelClient = vi.fn(() => ({
      reviewLead: vi.fn().mockRejectedValue('transport down'),
    }))

    vi.doMock('./sdk', async (importOriginal) => {
      const actual = await importOriginal<typeof import('./sdk')>()
      return {
        ...actual,
        createClaudeReviewModelClient,
      }
    })

    const { runClaudeReviewAgent } = await import('./review-agent')

    claimNextClaudeReviewLead.mockResolvedValue({
      claimed: true,
      run: {
        id: 'claude_run_4',
        agentKey: 'review-default',
        leadId: 'lead_4',
        sessionId: null,
        providerRunId: null,
        status: 'running',
        trigger: 'manual',
        workspaceCwd: '/tmp/claude-review/review-default',
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
      },
      lead: {
        lead: {
          id: 'lead_4',
        },
        relatedPendingLeads: [],
        recentReviewedLeads: [],
        recentReviewResults: [],
      },
    })
    appendClaudeReviewRunEvent.mockResolvedValue({
      id: 'event_4',
      runId: 'claude_run_4',
      eventType: 'claude_review_started',
      payload: {},
      createdAt: '2026-03-21T00:00:10.000Z',
    })
    failClaudeReviewRun.mockResolvedValue({
      run: {
        id: 'claude_run_4',
        status: 'failed',
      },
    })

    await expect(runClaudeReviewAgent({ config })).rejects.toThrow(
      'Unknown Claude review agent failure.',
    )

    expect(createClaudeReviewModelClient).toHaveBeenCalledTimes(1)
    expect(failClaudeReviewRun).toHaveBeenCalledWith(
      config,
      'claude_run_4',
      expect.objectContaining({
        errorMessage: 'Unknown Claude review agent failure.',
        providerRunId: undefined,
      }),
      undefined,
    )
  })

  it('omits provider and session identifiers when the model result does not include them', async () => {
    const { runClaudeReviewAgent } = await import('./review-agent')

    claimNextClaudeReviewLead.mockResolvedValue({
      claimed: true,
      run: {
        id: 'claude_run_5',
        agentKey: 'review-default',
        leadId: 'lead_5',
        sessionId: null,
        providerRunId: null,
        status: 'running',
        trigger: 'manual',
        workspaceCwd: '/tmp/claude-review/review-default',
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
      },
      lead: {
        lead: {
          id: 'lead_5',
        },
        relatedPendingLeads: [],
        recentReviewedLeads: [],
        recentReviewResults: [],
      },
    })
    appendClaudeReviewRunEvent.mockResolvedValue({
      id: 'event_5',
      runId: 'claude_run_5',
      eventType: 'claude_review_started',
      payload: {},
      createdAt: '2026-03-21T00:00:10.000Z',
    })
    completeClaudeReviewRun.mockResolvedValue({
      run: {
        id: 'claude_run_5',
        status: 'completed',
      },
      reviewResult: {
        runId: 'claude_run_5',
        verdict: 'reject',
        confidence: 0.25,
      },
    })

    await runClaudeReviewAgent({
      config,
      modelClient: {
        reviewLead: vi.fn().mockResolvedValue({
          sessionId: null,
          providerRunId: null,
          finalSummary: 'Rejected after review.',
          costUsd: 0.01,
          tokenUsage: { input: 1200 },
          toolUsage: { webFetchCalls: 1 },
          recommendation: {
            verdict: 'reject',
            confidence: 0.25,
            summary:
              'The source is too weak to map to a settleable claim and should be rejected.',
            evidence: [],
            needsHumanReview: false,
            duplicateLeadIds: [],
            duplicateMarketIds: [],
            recommendedFamilySlug: null,
            recommendedEntitySlug: null,
            normalizedHeadline: null,
            normalizedSummary: null,
            escalationReason: null,
          },
        }),
      },
    })

    expect(completeClaudeReviewRun).toHaveBeenCalledWith(
      config,
      'claude_run_5',
      expect.objectContaining({
        sessionId: undefined,
        providerRunId: undefined,
      }),
      undefined,
    )
  })
})
