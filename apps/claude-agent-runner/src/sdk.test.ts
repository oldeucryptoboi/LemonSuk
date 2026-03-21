import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { internalPredictionLeadDetailSchema } from '../../../packages/shared/src/types'

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

const config = {
  internalApiBaseUrl: 'http://localhost:8787/api/v1',
  internalServiceToken: 'token',
  anthropicApiKey: 'anthropic-key',
  model: 'claude-sonnet-4-5',
  agentKey: 'review-default',
  maxTurns: 8,
  maxBudgetUsd: 1,
  leaseSeconds: 900,
  workspaceRoot: '/tmp/claude-review',
}

describe('createClaudeReviewModelClient', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.doUnmock('@anthropic-ai/claude-agent-sdk')
  })

  it('uses the injected query impl and returns structured output without persisting sessions', async () => {
    const queryImpl = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'result',
          subtype: 'success',
          session_id: 'session_1',
          uuid: 'provider_1',
          result: 'Completed review.',
          total_cost_usd: 0.02,
          usage: { input_tokens: 1000 },
          modelUsage: { 'claude-sonnet-4-5': { inputTokens: 1000 } },
          permission_denials: [],
          structured_output: {
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
            needsHumanReview: false,
            recommendedFamilySlug: 'product_ship_date',
            recommendedEntitySlug: 'apple',
            duplicateLeadIds: [],
            duplicateMarketIds: [],
            normalizedHeadline:
              'Apple ships the referenced feature by the stated deadline.',
            normalizedSummary:
              'The source maps cleanly to a settleable product ship-date market.',
            escalationReason: '',
          },
        }
      },
      close: vi.fn(),
    }))

    const { createClaudeReviewModelClient } = await import('./sdk')
    const client = createClaudeReviewModelClient({ queryImpl })
    const lead = buildLeadDetail()

    await expect(
      client.reviewLead({
        config,
        workspaceCwd: '/tmp/claude-review/review-default',
        lead,
      }),
    ).resolves.toEqual({
      sessionId: 'session_1',
      providerRunId: 'provider_1',
      finalSummary: 'Completed review.',
      costUsd: 0.02,
      tokenUsage: {
        usage: { input_tokens: 1000 },
        modelUsage: { 'claude-sonnet-4-5': { inputTokens: 1000 } },
      },
      toolUsage: {
        permissionDenials: [],
      },
      recommendation: {
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
        needsHumanReview: false,
        recommendedFamilySlug: 'product_ship_date',
        recommendedEntitySlug: 'apple',
        duplicateLeadIds: [],
        duplicateMarketIds: [],
        normalizedHeadline:
          'Apple ships the referenced feature by the stated deadline.',
        normalizedSummary:
          'The source maps cleanly to a settleable product ship-date market.',
        escalationReason: null,
      },
    })

    expect(queryImpl).toHaveBeenCalledTimes(1)
    const firstArgument = (queryImpl.mock.calls as unknown as Array<
      Array<{ prompt: string; options: Record<string, unknown> }>
    >)[0]?.[0]
    expect(firstArgument).toBeDefined()
    const { prompt, options } = firstArgument as {
      prompt: string
      options: Record<string, unknown>
    }
    expect(typeof prompt).toBe('string')
    expect(prompt).toContain('Review this LemonSuk pending lead.')
    expect(options).toMatchObject({
      cwd: '/tmp/claude-review/review-default',
      persistSession: false,
      permissionMode: 'dontAsk',
      maxTurns: 8,
      maxBudgetUsd: 1,
      model: 'claude-sonnet-4-5',
      tools: ['WebFetch', 'WebSearch'],
      allowedTools: ['WebFetch', 'WebSearch'],
      outputFormat: {
        type: 'json_schema',
      },
    })
    expect(options.env).toMatchObject({
      ANTHROPIC_API_KEY: 'anthropic-key',
      CLAUDE_AGENT_SDK_CLIENT_APP: 'lemonsuk-claude-review-agent/0.1.0',
    })
  })

  it('defaults missing telemetry fields to empty/null telemetry without hiding the structured recommendation', async () => {
    const queryImpl = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'result',
          subtype: 'success',
          session_id: 'session_1b',
          result: 'Completed review.',
          structured_output: {
            verdict: 'reject',
            confidence: 0.33,
            summary:
              'The source is too weak to support a settleable claim and should be rejected.',
            evidence: [],
            needsHumanReview: false,
            recommendedFamilySlug: '',
            recommendedEntitySlug: '',
            duplicateLeadIds: [],
            duplicateMarketIds: [],
            normalizedHeadline: '',
            normalizedSummary: '',
            escalationReason: '',
          },
        }
      },
      close: vi.fn(),
    }))

    const { createClaudeReviewModelClient } = await import('./sdk')
    const client = createClaudeReviewModelClient({ queryImpl })

    await expect(
      client.reviewLead({
        config,
        workspaceCwd: '/tmp/claude-review/review-default',
        lead: buildLeadDetail(),
      }),
    ).resolves.toEqual({
      sessionId: 'session_1b',
      providerRunId: null,
      finalSummary: 'Completed review.',
      costUsd: 0,
      tokenUsage: {
        usage: null,
        modelUsage: null,
      },
      toolUsage: {
        permissionDenials: [],
      },
      recommendation: {
        verdict: 'reject',
        confidence: 0.33,
        summary:
          'The source is too weak to support a settleable claim and should be rejected.',
        evidence: [],
        needsHumanReview: false,
        recommendedFamilySlug: null,
        recommendedEntitySlug: null,
        duplicateLeadIds: [],
        duplicateMarketIds: [],
        normalizedHeadline: null,
        normalizedSummary: null,
        escalationReason: null,
      },
    })
  })

  it('fails loudly when the provider returns success without structured output', async () => {
    const queryImpl = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'result',
          subtype: 'success',
          session_id: 'session_2',
          uuid: 'provider_2',
          result: 'Plain text only.',
          total_cost_usd: 0.03,
          usage: { input_tokens: 1200 },
          modelUsage: {},
          permission_denials: [],
        }
      },
      close: vi.fn(),
    }))

    const {
      ClaudeReviewAgentExecutionError,
      createClaudeReviewModelClient,
    } = await import('./sdk')
    const client = createClaudeReviewModelClient({ queryImpl })

    await expect(
      client.reviewLead({
        config,
        workspaceCwd: '/tmp/claude-review/review-default',
        lead: buildLeadDetail(),
      }),
    ).rejects.toMatchObject({
      name: 'ClaudeReviewAgentExecutionError',
      message: 'Claude review agent returned no structured recommendation.',
      sessionId: 'session_2',
      providerRunId: 'provider_2',
      costUsd: 0.03,
      finalSummary: 'Plain text only.',
    } satisfies Partial<InstanceType<typeof ClaudeReviewAgentExecutionError>>)
  })

  it('fails loudly when the provider returns success without a final summary', async () => {
    const queryImpl = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'result',
          subtype: 'success',
          session_id: 'session_2b',
          uuid: 'provider_2b',
          result: '',
          total_cost_usd: 0.03,
          usage: { input_tokens: 1100 },
          modelUsage: {},
          permission_denials: [],
          structured_output: {
            verdict: 'reject',
            confidence: 0.4,
            summary:
              'The source is too vague to support a settleable claim and should be rejected.',
            evidence: [],
            needsHumanReview: false,
            recommendedFamilySlug: '',
            recommendedEntitySlug: '',
            duplicateLeadIds: [],
            duplicateMarketIds: [],
            normalizedHeadline: '',
            normalizedSummary: '',
            escalationReason: '',
          },
        }
      },
      close: vi.fn(),
    }))

    const { createClaudeReviewModelClient } = await import('./sdk')
    const client = createClaudeReviewModelClient({ queryImpl })

    await expect(
      client.reviewLead({
        config,
        workspaceCwd: '/tmp/claude-review/review-default',
        lead: buildLeadDetail(),
      }),
    ).rejects.toMatchObject({
      message: 'Claude review agent returned no final summary.',
      sessionId: 'session_2b',
      providerRunId: 'provider_2b',
      costUsd: 0.03,
    })
  })

  it('fails loudly when structured output uses alias keys instead of the contract', async () => {
    const queryImpl = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'result',
          subtype: 'success',
          session_id: 'session_3',
          uuid: 'provider_3',
          result: 'Completed review.',
          total_cost_usd: 0.02,
          usage: {},
          modelUsage: {},
          permission_denials: [],
          structured_output: {
            decision: 'accept',
            confidence: 0.81,
            summary: 'This object intentionally uses the wrong keys.',
            evidence: [],
            needsHumanReview: false,
            suggestedFamilyId: 'product_ship_date',
            suggestedEntityId: 'apple',
            duplicateLeadIds: [],
            duplicateMarketIds: [],
            normalizedHeadline: '',
            normalizedSummary: '',
            escalationReason: '',
          },
        }
      },
      close: vi.fn(),
    }))

    const { createClaudeReviewModelClient } = await import('./sdk')
    const client = createClaudeReviewModelClient({ queryImpl })

    await expect(
      client.reviewLead({
        config,
        workspaceCwd: '/tmp/claude-review/review-default',
        lead: buildLeadDetail(),
      }),
    ).rejects.toThrow(/verdict/i)
  })

  it('surfaces provider error subtypes with joined error messages', async () => {
    const queryImpl = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'result',
          subtype: 'error_max_structured_output_retries',
          session_id: 'session_4',
          uuid: 'provider_4',
          total_cost_usd: 0.04,
          usage: { input_tokens: 1500 },
          modelUsage: {},
          permission_denials: [{ tool_name: 'WebFetch', reason: 'denied' }],
          errors: ['First failure.', 'Second failure.'],
        }
      },
      close: vi.fn(),
    }))

    const { createClaudeReviewModelClient } = await import('./sdk')
    const client = createClaudeReviewModelClient({ queryImpl })

    await expect(
      client.reviewLead({
        config,
        workspaceCwd: '/tmp/claude-review/review-default',
        lead: buildLeadDetail(),
      }),
    ).rejects.toMatchObject({
      message: 'First failure. | Second failure.',
      sessionId: 'session_4',
      providerRunId: 'provider_4',
      costUsd: 0.04,
    })
  })

  it('surfaces provider error subtypes with the generic subtype message when no errors array exists', async () => {
    const queryImpl = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'result',
          subtype: 'error_max_budget_usd',
          session_id: 'session_4b',
          uuid: 'provider_4b',
          total_cost_usd: 0.05,
          usage: { input_tokens: 1600 },
          modelUsage: {},
          permission_denials: [],
        }
      },
      close: vi.fn(),
    }))

    const { createClaudeReviewModelClient } = await import('./sdk')
    const client = createClaudeReviewModelClient({ queryImpl })

    await expect(
      client.reviewLead({
        config,
        workspaceCwd: '/tmp/claude-review/review-default',
        lead: buildLeadDetail(),
      }),
    ).rejects.toMatchObject({
      message: 'Claude review agent failed with subtype error_max_budget_usd.',
      sessionId: 'session_4b',
      providerRunId: 'provider_4b',
      costUsd: 0.05,
    })
  })

  it('surfaces the generic unknown subtype message when the provider omits subtype details', async () => {
    const queryImpl = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'result',
          session_id: 'session_4c',
          uuid: 'provider_4c',
          total_cost_usd: 0.01,
          usage: {},
          modelUsage: {},
          permission_denials: [],
        }
      },
      close: vi.fn(),
    }))

    const { createClaudeReviewModelClient } = await import('./sdk')
    const client = createClaudeReviewModelClient({ queryImpl })

    await expect(
      client.reviewLead({
        config,
        workspaceCwd: '/tmp/claude-review/review-default',
        lead: buildLeadDetail(),
      }),
    ).rejects.toMatchObject({
      message: 'Claude review agent failed with subtype unknown.',
      sessionId: 'session_4c',
      providerRunId: 'provider_4c',
      costUsd: 0.01,
    })
  })

  it('fails loudly when the provider stream ends without any final result', async () => {
    const queryImpl = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'assistant',
          subtype: 'message',
        }
      },
      close: vi.fn(),
    }))

    const { createClaudeReviewModelClient } = await import('./sdk')
    const client = createClaudeReviewModelClient({ queryImpl })

    await expect(
      client.reviewLead({
        config,
        workspaceCwd: '/tmp/claude-review/review-default',
        lead: buildLeadDetail(),
      }),
    ).rejects.toThrow('Claude review agent produced no final result.')
  })

  it('uses query when no query override is supplied', async () => {
    const query = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: 'result',
          subtype: 'success',
          session_id: 'session_5',
          uuid: 'provider_5',
          result: 'Completed review.',
          total_cost_usd: 0.01,
          usage: {},
          modelUsage: {},
          permission_denials: [],
          structured_output: {
            verdict: 'reject',
            confidence: 0.12,
            summary:
              'The source is too weak to support a settleable claim and should be rejected.',
            evidence: [],
            needsHumanReview: false,
            recommendedFamilySlug: '',
            recommendedEntitySlug: '',
            duplicateLeadIds: [],
            duplicateMarketIds: [],
            normalizedHeadline: '',
            normalizedSummary: '',
            escalationReason: '',
          },
        }
      },
      close: vi.fn(),
    }))

    vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
      query,
    }))

    const { createClaudeReviewModelClient } = await import('./sdk')
    const client = createClaudeReviewModelClient()

    await expect(
      client.reviewLead({
        config,
        workspaceCwd: '/tmp/claude-review/review-default',
        lead: buildLeadDetail(),
      }),
    ).resolves.toMatchObject({
      providerRunId: 'provider_5',
      recommendation: {
        verdict: 'reject',
      },
    })

    expect(query).toHaveBeenCalledTimes(1)
  })
})
