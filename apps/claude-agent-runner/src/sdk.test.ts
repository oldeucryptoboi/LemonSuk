import { afterEach, describe, expect, it, vi } from 'vitest'

import { internalPredictionLeadDetailSchema } from '../../../packages/shared/src/types'

import { createClaudeReviewModelClient } from './sdk'

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

describe('Claude review model client', () => {
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

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    vi.unmock('@anthropic-ai/claude-agent-sdk')
  })

  function buildRecommendation() {
    return {
      verdict: 'accept' as const,
      confidence: 0.81,
      summary:
        'The source is concrete and maps cleanly to a settleable product launch claim.',
      evidence: [
        {
          url: 'https://example.com/source',
          excerpt: 'The feature ships before the stated deadline.',
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
        'The source maps to a settleable product ship date market and is suitable for operator review.',
      escalationReason: null,
    }
  }

  it('returns structured recommendations from a successful result message', async () => {
    const client = createClaudeReviewModelClient({
      queryImpl: () =>
        (async function* () {
          yield {
            type: 'system',
            session_id: 'session_1',
          }
          yield {
            type: 'result',
            subtype: 'success',
            session_id: 'session_1',
            uuid: 'provider_1',
            result: 'Accepted after source inspection.',
            total_cost_usd: 0.01,
            usage: { input: 1000, output: 200 },
            modelUsage: { 'claude-sonnet-4-5': { inputTokens: 1000 } },
            permission_denials: [],
            structured_output: buildRecommendation(),
          }
        })(),
    })

    const result = await client.reviewLead({
      config,
      workspaceCwd: '/tmp/claude-review/review-default',
      resumeSessionId: null,
      lead: buildLeadDetail(),
    })

    expect(result).toEqual(
      expect.objectContaining({
        sessionId: 'session_1',
        providerRunId: 'provider_1',
        costUsd: 0.01,
        recommendation: expect.objectContaining({
          verdict: 'accept',
          recommendedFamilySlug: 'product_ship_date',
        }),
      }),
    )
  })

  it('fails loudly when structured output is missing even if the SDK result succeeded', async () => {
    const client = createClaudeReviewModelClient({
      queryImpl: () =>
        (async function* () {
          yield {
            type: 'system',
            session_id: 'session_2',
          }
          yield {
            type: 'result',
            subtype: 'success',
            session_id: 'session_2',
            uuid: 'provider_2',
            result: 'No structured output was returned.',
            total_cost_usd: 0.01,
            usage: {},
            modelUsage: {},
            permission_denials: [],
          }
        })(),
    })

    await expect(
      client.reviewLead({
        config,
        workspaceCwd: '/tmp/claude-review/review-default',
        resumeSessionId: null,
        lead: buildLeadDetail(),
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'ClaudeReviewAgentExecutionError',
        message: 'Claude review agent returned no structured recommendation.',
        sessionId: 'session_2',
        providerRunId: 'provider_2',
      }),
    )
  })

  it('fails loudly when the SDK returns malformed structured output with alias keys', async () => {
    const client = createClaudeReviewModelClient({
      queryImpl: () =>
        (async function* () {
          yield {
            type: 'system',
            session_id: 'session_alias',
          }
          yield {
            type: 'result',
            subtype: 'success',
            session_id: 'session_alias',
            uuid: 'provider_alias',
            result: 'A markdown summary with the wrong key names.',
            total_cost_usd: 0.01,
            usage: {},
            modelUsage: {},
            permission_denials: [],
            structured_output: {
              decision: 'reject',
              confidence: 0.21,
              summary: 'Wrong alias keys should not be tolerated.',
              evidence: [],
              needsHumanReview: false,
              suggestedFamilyId: null,
              suggestedEntityId: null,
              duplicateLeadIds: [],
              duplicateMarketIds: [],
              normalizedHeadline: null,
              normalizedSummary: null,
              escalationReason: null,
            },
          }
        })(),
    })

    await expect(
      client.reviewLead({
        config,
        workspaceCwd: '/tmp/claude-review/review-default',
        resumeSessionId: null,
        lead: buildLeadDetail(),
      }),
    ).rejects.toThrowError(/verdict/i)
  })

  it('surfaces SDK error results with captured execution context', async () => {
    const client = createClaudeReviewModelClient({
      queryImpl: () =>
        (async function* () {
          yield {
            type: 'system',
            session_id: 'session_3',
          }
          yield {
            type: 'result',
            subtype: 'error_max_budget_usd',
            session_id: 'session_3',
            uuid: 'provider_3',
            total_cost_usd: 1.2,
            usage: { input: 8000, output: 4000 },
            modelUsage: {},
            permission_denials: [],
            errors: ['Maximum budget exceeded.'],
          }
        })(),
    })

    await expect(
      client.reviewLead({
        config,
        workspaceCwd: '/tmp/claude-review/review-default',
        resumeSessionId: null,
        lead: buildLeadDetail(),
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'ClaudeReviewAgentExecutionError',
        message: 'Maximum budget exceeded.',
        sessionId: 'session_3',
        providerRunId: 'provider_3',
        costUsd: 1.2,
      }),
    )
  })

  it('uses the SDK module query implementation when no override is provided', async () => {
    const sdkQuery = vi.fn(() =>
      (async function* () {
        yield {
          type: 'system',
          session_id: 'session_4',
        }
        yield {
          type: 'result',
          subtype: 'success',
          session_id: 'session_4',
          uuid: 'provider_4',
          total_cost_usd: 0.03,
          usage: { input: 900, output: 180 },
          modelUsage: { 'claude-sonnet-4-5': { inputTokens: 900 } },
          permission_denials: [],
          structured_output: buildRecommendation(),
        }
      })(),
    )

    vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
      query: sdkQuery,
    }))

    const { createClaudeReviewModelClient: createClient } = await import('./sdk')
    const client = createClient()

    const result = await client.reviewLead({
      config,
      workspaceCwd: '/tmp/claude-review/review-default',
      resumeSessionId: null,
      lead: buildLeadDetail(),
    })

    expect(sdkQuery).toHaveBeenCalledTimes(1)
    expect(result.finalSummary).toBe(buildRecommendation().summary)
  })

  it('forks persisted sessions when resuming a previous successful review session', async () => {
    const sdkQuery = vi.fn(() =>
      (async function* () {
        yield {
          type: 'system',
          session_id: 'session_4_forked',
        }
        yield {
          type: 'result',
          subtype: 'success',
          session_id: 'session_4_forked',
          uuid: 'provider_4_forked',
          total_cost_usd: 0.03,
          usage: { input: 900, output: 180 },
          modelUsage: { 'claude-sonnet-4-5': { inputTokens: 900 } },
          permission_denials: [],
          structured_output: buildRecommendation(),
        }
      })(),
    )

    const client = createClaudeReviewModelClient({
      queryImpl: sdkQuery,
    })

    await client.reviewLead({
      config,
      workspaceCwd: '/tmp/claude-review/review-default',
      resumeSessionId: 'session_previous',
      lead: buildLeadDetail(),
    })

    expect(sdkQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          resume: 'session_previous',
          forkSession: true,
          persistSession: true,
        }),
      }),
    )
  })

  it('fails loudly when the sdk yields no result message at all', async () => {
    const client = createClaudeReviewModelClient({
      queryImpl: () =>
        (async function* () {
          yield {
            type: 'system',
            session_id: 'session_5',
          }
        })(),
    })

    await expect(
      client.reviewLead({
        config,
        workspaceCwd: '/tmp/claude-review/review-default',
        resumeSessionId: null,
        lead: buildLeadDetail(),
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'ClaudeReviewAgentExecutionError',
        message: 'Claude review agent produced no final result.',
        sessionId: 'session_5',
      }),
    )
  })

  it('fails loudly when the final result omits a session id', async () => {
    const client = createClaudeReviewModelClient({
      queryImpl: () =>
        (async function* () {
          yield {
            type: 'result',
            subtype: 'success',
            uuid: 'provider_5',
            total_cost_usd: 0.01,
            usage: {},
            modelUsage: {},
            permission_denials: [],
            structured_output: buildRecommendation(),
          }
        })(),
    })

    await expect(
      client.reviewLead({
        config,
        workspaceCwd: '/tmp/claude-review/review-default',
        resumeSessionId: null,
        lead: buildLeadDetail(),
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'ClaudeReviewAgentExecutionError',
        message: 'Claude review agent did not expose a session id.',
        providerRunId: 'provider_5',
      }),
    )
  })

  it('uses a generic subtype error when the sdk does not return explicit errors', async () => {
    const client = createClaudeReviewModelClient({
      queryImpl: () =>
        (async function* () {
          yield {
            type: 'system',
            session_id: 'session_6',
          }
          yield {
            type: 'result',
            subtype: 'error_permission',
            session_id: 'session_6',
            uuid: 'provider_6',
            total_cost_usd: 0.02,
            usage: {},
            modelUsage: {},
            permission_denials: ['WebFetch'],
          }
        })(),
    })

    await expect(
      client.reviewLead({
        config,
        workspaceCwd: '/tmp/claude-review/review-default',
        resumeSessionId: null,
        lead: buildLeadDetail(),
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'ClaudeReviewAgentExecutionError',
        message: 'Claude review agent failed with subtype error_permission.',
        sessionId: 'session_6',
        providerRunId: 'provider_6',
      }),
    )
  })

  it('normalizes missing provider usage fields and unknown failure subtypes', async () => {
    const client = createClaudeReviewModelClient({
      queryImpl: () =>
        (async function* () {
          yield {
            type: 'system',
            session_id: 'session_7',
          }
          yield {
            type: 'result',
            session_id: 'session_7',
          }
        })(),
    })

    await expect(
      client.reviewLead({
        config,
        workspaceCwd: '/tmp/claude-review/review-default',
        resumeSessionId: null,
        lead: buildLeadDetail(),
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'ClaudeReviewAgentExecutionError',
        message: 'Claude review agent failed with subtype unknown.',
        sessionId: 'session_7',
        providerRunId: null,
        costUsd: 0,
        tokenUsage: {
          usage: null,
          modelUsage: null,
        },
        toolUsage: {
          permissionDenials: [],
        },
      }),
    )
  })
})
