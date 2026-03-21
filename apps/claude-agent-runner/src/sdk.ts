import type { Options } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import type {
  ClaudeReviewAgentRecommendation,
  InternalPredictionLeadDetail,
} from '../../../packages/shared/src/types'
import { claudeReviewAgentRecommendationSchema } from '../../../packages/shared/src/types'

import type { ClaudeReviewAgentRunnerConfig } from './config'
import {
  buildReviewAgentPrompt,
  buildReviewAgentSystemPrompt,
  reviewRecommendationOutputJsonSchema,
} from './prompt'

type QueryMessage = {
  type?: string
  subtype?: string
  session_id?: string
  uuid?: string
  result?: string
  total_cost_usd?: number
  usage?: unknown
  modelUsage?: unknown
  permission_denials?: unknown
  structured_output?: unknown
  errors?: string[]
}

type QueryLike = AsyncIterable<QueryMessage> & {
  close?: () => void
}

type QueryImpl = (params: {
  prompt: string
  options?: Options
}) => QueryLike

const reviewRecommendationTransportSchema = z.object({
  verdict: z.enum(['accept', 'reject', 'escalate']),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(12).max(500),
  evidence: z
    .array(
      z.object({
        url: z.string(),
        excerpt: z.string().min(1).max(500),
      }),
    )
    .max(12),
  needsHumanReview: z.boolean(),
  recommendedFamilySlug: z.string(),
  recommendedEntitySlug: z.string(),
  duplicateLeadIds: z.array(z.string().min(1).max(120)).max(12),
  duplicateMarketIds: z.array(z.string().min(1).max(120)).max(12),
  normalizedHeadline: z.string(),
  normalizedSummary: z.string(),
  escalationReason: z.string(),
})

function normalizeOptionalString(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeStructuredRecommendation(
  value: unknown,
): ClaudeReviewAgentRecommendation {
  const parsed = reviewRecommendationTransportSchema.parse(value)
  return claudeReviewAgentRecommendationSchema.parse({
    verdict: parsed.verdict,
    confidence: parsed.confidence,
    summary: parsed.summary,
    evidence: parsed.evidence.map((entry) => ({
      url: entry.url.trim(),
      excerpt: entry.excerpt.trim(),
    })),
    needsHumanReview: parsed.needsHumanReview,
    recommendedFamilySlug: normalizeOptionalString(parsed.recommendedFamilySlug),
    recommendedEntitySlug: normalizeOptionalString(parsed.recommendedEntitySlug),
    duplicateLeadIds: parsed.duplicateLeadIds,
    duplicateMarketIds: parsed.duplicateMarketIds,
    normalizedHeadline: normalizeOptionalString(parsed.normalizedHeadline),
    normalizedSummary: normalizeOptionalString(parsed.normalizedSummary),
    escalationReason: normalizeOptionalString(parsed.escalationReason),
  })
}

export class ClaudeReviewAgentExecutionError extends Error {
  sessionId: string | null
  providerRunId: string | null
  costUsd: number
  tokenUsage: unknown
  toolUsage: unknown
  finalSummary: string | null

  constructor(
    message: string,
    options: {
      sessionId?: string | null
      providerRunId?: string | null
      costUsd?: number
      tokenUsage?: unknown
      toolUsage?: unknown
      finalSummary?: string | null
    } = {},
  ) {
    super(message)
    this.name = 'ClaudeReviewAgentExecutionError'
    this.sessionId = options.sessionId ?? null
    this.providerRunId = options.providerRunId ?? null
    this.costUsd = options.costUsd ?? 0
    this.tokenUsage = options.tokenUsage ?? null
    this.toolUsage = options.toolUsage ?? null
    this.finalSummary = options.finalSummary ?? null
  }
}

export type ClaudeReviewModelResult = {
  sessionId: string | null
  providerRunId: string | null
  finalSummary: string
  costUsd: number
  tokenUsage: unknown
  toolUsage: unknown
  recommendation: ClaudeReviewAgentRecommendation
}

export type ClaudeReviewModelClient = {
  reviewLead(input: {
    config: ClaudeReviewAgentRunnerConfig
    workspaceCwd: string
    lead: InternalPredictionLeadDetail
  }): Promise<ClaudeReviewModelResult>
}

function buildQueryOptions(input: {
  config: ClaudeReviewAgentRunnerConfig
  workspaceCwd: string
}): Options {
  return {
    cwd: input.workspaceCwd,
    persistSession: false,
    tools: ['WebFetch', 'WebSearch'],
    allowedTools: ['WebFetch', 'WebSearch'],
    permissionMode: 'dontAsk',
    maxTurns: input.config.maxTurns,
    maxBudgetUsd: input.config.maxBudgetUsd,
    model: input.config.model,
    outputFormat: {
      type: 'json_schema',
      schema: reviewRecommendationOutputJsonSchema,
    },
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: buildReviewAgentSystemPrompt(),
    },
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: input.config.anthropicApiKey,
      CLAUDE_AGENT_SDK_CLIENT_APP: 'lemonsuk-claude-review-agent/0.1.0',
    },
  }
}

export function createClaudeReviewModelClient(options: {
  queryImpl?: QueryImpl
} = {}): ClaudeReviewModelClient {
  return {
    async reviewLead(input) {
      const queryImpl =
        options.queryImpl ??
        ((await import('@anthropic-ai/claude-agent-sdk')).query as QueryImpl)

      const query = queryImpl({
        prompt: buildReviewAgentPrompt(input.lead),
        options: buildQueryOptions({
          config: input.config,
          workspaceCwd: input.workspaceCwd,
        }),
      })

      let sawResult = false
      let sessionId: string | null = null
      let providerRunId: string | null = null
      let costUsd = 0
      let tokenUsage: unknown = null
      let toolUsage: unknown = null
      let finalSummary: string | null = null

      try {
        for await (const message of query) {
          if (typeof message.session_id === 'string') {
            sessionId = message.session_id
          }

          if (message.type !== 'result') {
            continue
          }

          sawResult = true
          providerRunId = typeof message.uuid === 'string' ? message.uuid : null
          costUsd =
            typeof message.total_cost_usd === 'number' ? message.total_cost_usd : 0
          tokenUsage = {
            usage: message.usage ?? null,
            modelUsage: message.modelUsage ?? null,
          }
          toolUsage = {
            permissionDenials: message.permission_denials ?? [],
          }

          if (message.subtype !== 'success') {
            const errorMessage =
              Array.isArray(message.errors) && message.errors.length > 0
                ? message.errors.join(' | ')
                : `Claude review agent failed with subtype ${String(
                    message.subtype ?? 'unknown',
                  )}.`
            throw new ClaudeReviewAgentExecutionError(errorMessage, {
              sessionId,
              providerRunId,
              costUsd,
              tokenUsage,
              toolUsage,
            })
          }

          if (typeof message.result !== 'string' || message.result.trim().length === 0) {
            throw new ClaudeReviewAgentExecutionError(
              'Claude review agent returned no final summary.',
              {
                sessionId,
                providerRunId,
                costUsd,
                tokenUsage,
                toolUsage,
              },
            )
          }

          finalSummary = message.result
          if (!message.structured_output) {
            throw new ClaudeReviewAgentExecutionError(
              'Claude review agent returned no structured recommendation.',
              {
                sessionId,
                providerRunId,
                costUsd,
                tokenUsage,
                toolUsage,
                finalSummary,
              },
            )
          }

          const recommendation = normalizeStructuredRecommendation(
            message.structured_output,
          )

          return {
            sessionId,
            providerRunId,
            finalSummary,
            costUsd,
            tokenUsage,
            toolUsage,
            recommendation,
          }
        }
      } finally {
        query.close?.()
      }

      throw new ClaudeReviewAgentExecutionError(
        'Claude review agent produced no final result.',
        {
          sessionId,
          providerRunId,
          costUsd,
          tokenUsage,
          toolUsage,
          finalSummary,
        },
      )
    },
  }
}
