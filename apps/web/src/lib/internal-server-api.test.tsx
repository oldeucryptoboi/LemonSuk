import { afterEach, describe, expect, it, vi } from 'vitest'

describe('internal server api helpers', () => {
  const originalFetch = global.fetch
  const originalInternalBaseUrl = process.env.INTERNAL_API_BASE_URL
  const originalPublicBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL
  const originalInternalServiceToken = process.env.INTERNAL_SERVICE_TOKEN
  const originalReviewKey = process.env.REVIEW_CONSOLE_ACCESS_KEY
  const originalNodeEnv = process.env.NODE_ENV

  function setNodeEnv(value: string | undefined) {
    Object.defineProperty(process.env, 'NODE_ENV', {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    })
  }

  afterEach(() => {
    global.fetch = originalFetch
    process.env.INTERNAL_API_BASE_URL = originalInternalBaseUrl
    process.env.NEXT_PUBLIC_API_BASE_URL = originalPublicBaseUrl
    process.env.INTERNAL_SERVICE_TOKEN = originalInternalServiceToken
    process.env.REVIEW_CONSOLE_ACCESS_KEY = originalReviewKey
    setNodeEnv(originalNodeEnv)
    vi.restoreAllMocks()
    vi.resetModules()
  })

  function buildLead() {
    return {
      id: 'lead_1',
      leadType: 'structured_agent_lead',
      submittedByAgentId: 'agent_1',
      submittedByOwnerEmail: null,
      sourceUrl: 'https://example.com/source',
      normalizedSourceUrl: 'https://example.com/source',
      sourceDomain: 'example.com',
      sourceType: 'news',
      sourceLabel: 'Example',
      sourceNote: 'A sourced lead.',
      sourcePublishedAt: null,
      claimedHeadline: 'Example lead',
      claimedSubject: 'Example',
      claimedCategory: 'ai',
      familyId: 'family_ai_launch',
      familySlug: 'ai_launch',
      familyDisplayName: 'AI launches',
      primaryEntityId: 'entity_openai',
      primaryEntitySlug: 'openai',
      primaryEntityDisplayName: 'OpenAI',
      eventGroupId: null,
      promisedDate: '2026-09-30T23:59:59.000Z',
      summary: 'Summary',
      tags: ['openai'],
      status: 'pending',
      spamScore: 0,
      duplicateOfLeadId: null,
      duplicateOfMarketId: null,
      reviewNotes: null,
      linkedMarketId: null,
      reviewedAt: null,
      legacyAgentSubmissionId: null,
      legacyHumanSubmissionId: null,
      createdAt: '2026-03-18T00:00:00.000Z',
      updatedAt: '2026-03-18T00:00:00.000Z',
      submittedBy: {
        id: 'agent_1',
        handle: 'eddie',
        displayName: 'Eddie',
      },
    }
  }

  function buildReviewResult() {
    return {
      runId: 'run_1',
      leadId: 'lead_1',
      submissionId: null,
      reviewer: 'Eddie',
      verdict: 'accept',
      confidence: 0.82,
      summary: 'Strong evidence backs this lead.',
      evidence: [
        {
          url: 'https://example.com/source',
          excerpt: 'Explicit timeline in source.',
        },
      ],
      needsHumanReview: false,
      snapshotRef: null,
      linkedMarketId: null,
      providerRunId: null,
      createdAt: '2026-03-18T00:00:00.000Z',
    }
  }

  function buildClaudeRun() {
    return {
      id: 'claude_run_1',
      agentKey: 'review-default',
      leadId: 'lead_1',
      sessionId: null,
      providerRunId: 'provider_1',
      status: 'completed',
      trigger: 'manual',
      workspaceCwd: '/tmp/review-default',
      promptSummary: 'Inspect next pending lead.',
      finalSummary: 'Completed review.',
      errorMessage: null,
      costUsd: 0.01,
      tokenUsage: null,
      toolUsage: null,
      recommendation: {
        verdict: 'accept',
        confidence: 0.82,
        summary: 'Strong evidence backs this lead.',
        evidence: [
          {
            url: 'https://example.com/source',
            excerpt: 'Explicit timeline in source.',
          },
        ],
        needsHumanReview: false,
        recommendedFamilySlug: 'ai_launch',
        recommendedEntitySlug: 'openai',
        duplicateLeadIds: [],
        duplicateMarketIds: [],
        normalizedHeadline: 'Example lead',
        normalizedSummary: 'Summary with enough detail.',
        escalationReason: null,
      },
      startedAt: '2026-03-18T00:00:00.000Z',
      completedAt: '2026-03-18T00:01:00.000Z',
      createdAt: '2026-03-18T00:00:00.000Z',
      updatedAt: '2026-03-18T00:01:00.000Z',
    }
  }

  it('uses the internal api base url, auth header, and parses queue/detail/write payloads', async () => {
    process.env.INTERNAL_API_BASE_URL = 'https://internal.example.com'
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://public.example.com'
    process.env.INTERNAL_SERVICE_TOKEN = 'internal-secret'
    process.env.REVIEW_CONSOLE_ACCESS_KEY = 'review-secret'

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url

      expect(init?.headers).toEqual(
        expect.objectContaining({
          Authorization: 'Bearer internal-secret',
          'Content-Type': 'application/json',
        }),
      )

      if (url.includes('/internal/leads?')) {
        return new Response(
          JSON.stringify({
            pendingCount: 1,
            items: [buildLead()],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }

      if (url.endsWith('/internal/leads/lead_1/inspect')) {
        return new Response(
          JSON.stringify({
            lead: buildLead(),
            relatedPendingLeads: [],
            recentReviewedLeads: [],
            recentReviewResults: [buildReviewResult()],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }

      if (url.includes('/internal/claude-review-agent/runs?')) {
        return new Response(JSON.stringify([buildClaudeRun()]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url.endsWith('/status')) {
        return new Response(JSON.stringify(buildLead()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      return new Response(JSON.stringify(buildReviewResult()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    global.fetch = fetchMock as typeof fetch

    const api = await import('./internal-server-api')

    await expect(
      api.fetchInternalLeadQueueServer({
        limit: 12,
        leadType: 'structured_agent_lead',
        familySlug: 'ai_launch',
        entitySlug: 'openai',
        sourceDomain: 'example.com',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        pendingCount: 1,
      }),
    )
    await expect(api.fetchInternalLeadInspectionServer('lead_1')).resolves.toEqual(
      expect.objectContaining({
        lead: expect.objectContaining({
          id: 'lead_1',
        }),
      }),
    )
    await expect(api.fetchInternalClaudeReviewRunsServer(6)).resolves.toEqual([
      expect.objectContaining({
        id: 'claude_run_1',
      }),
    ])
    await expect(
      api.updateInternalLeadStatusServer('lead_1', {
        status: 'in_review',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'lead_1',
      }),
    )
    await expect(
      api.applyInternalLeadReviewResultServer('lead_1', {
        runId: 'run_1',
        reviewer: 'Eddie',
        verdict: 'accept',
        confidence: 0.82,
        summary: 'Strong evidence backs this lead.',
        evidence: [
          {
            url: 'https://example.com/source',
            excerpt: 'Explicit timeline in source.',
          },
        ],
        needsHumanReview: false,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        runId: 'run_1',
      }),
    )

    expect(api.isReviewConsoleAuthorized('review-secret')).toBe(true)
    expect(api.isReviewConsoleAuthorized('bad-secret')).toBe(false)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/internal/leads?limit=12&leadType=structured_agent_lead&familySlug=ai_launch&entitySlug=openai&sourceDomain=example.com',
      expect.any(Object),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/internal/claude-review-agent/runs?limit=6',
      expect.any(Object),
    )
  })

  it('falls back to the public api base url and surfaces request failures', async () => {
    delete process.env.INTERNAL_API_BASE_URL
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://public.example.com'
    process.env.INTERNAL_SERVICE_TOKEN = 'internal-secret'
    process.env.REVIEW_CONSOLE_ACCESS_KEY = 'review-secret'

    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ message: 'broken' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch

    const api = await import('./internal-server-api')
    await expect(api.fetchInternalLeadQueueServer()).rejects.toThrow('broken')
  })

  it('falls back to the local default api base url and generic request errors', async () => {
    delete process.env.INTERNAL_API_BASE_URL
    delete process.env.NEXT_PUBLIC_API_BASE_URL
    process.env.INTERNAL_SERVICE_TOKEN = 'internal-secret'

    const fetchMock = vi
      .fn(async () =>
        new Response(JSON.stringify({ pendingCount: 0, items: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockImplementationOnce(async () =>
        new Response('not-json', {
          status: 502,
          headers: { 'content-type': 'text/plain' },
        }),
      )
    global.fetch = fetchMock as typeof fetch

    const api = await import('./internal-server-api')
    await expect(api.fetchInternalLeadQueueServer()).rejects.toThrow('Request failed')
    await expect(api.fetchInternalLeadQueueServer()).resolves.toEqual({
      pendingCount: 0,
      items: [],
    })
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://127.0.0.1:8787/api/v1/internal/leads',
      expect.any(Object),
    )
  })

  it('requires an internal token for operator requests', async () => {
    process.env.INTERNAL_API_BASE_URL = 'https://internal.example.com'
    delete process.env.INTERNAL_SERVICE_TOKEN

    const api = await import('./internal-server-api')
    expect(api.isReviewConsoleAvailable()).toBe(false)
    await expect(api.fetchInternalLeadQueueServer()).rejects.toThrow(
      'INTERNAL_SERVICE_TOKEN is required for the review console.',
    )
  })

  it('allows review access without a configured key only outside production', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'internal-secret'
    delete process.env.REVIEW_CONSOLE_ACCESS_KEY
    setNodeEnv('test')

    let api = await import('./internal-server-api')
    expect(api.isReviewConsoleAuthorized(undefined)).toBe(true)

    vi.resetModules()
    delete process.env.REVIEW_CONSOLE_ACCESS_KEY
    setNodeEnv('production')

    api = await import('./internal-server-api')
    expect(api.isReviewConsoleAuthorized(undefined)).toBe(false)
  })

  it('reports the review console as available when the internal token is configured', async () => {
    process.env.INTERNAL_SERVICE_TOKEN = 'internal-secret'

    const api = await import('./internal-server-api')
    expect(api.isReviewConsoleAvailable()).toBe(true)
  })
})
