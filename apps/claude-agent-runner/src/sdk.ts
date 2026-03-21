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

type QueryLike = AsyncGenerator<QueryMessage, void>

type QueryImpl = (params: {
  prompt: string
  options?: Record<string, unknown>
}) => QueryLike

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
  sessionId: string
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
    resumeSessionId: string | null
    lead: InternalPredictionLeadDetail
  }): Promise<ClaudeReviewModelResult>
}

function buildQueryOptions(input: {
  config: ClaudeReviewAgentRunnerConfig
  workspaceCwd: string
  resumeSessionId: string | null
}): Record<string, unknown> {
  return {
    cwd: input.workspaceCwd,
    resume: input.resumeSessionId ?? undefined,
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

      const prompt = buildReviewAgentPrompt(input.lead)
      const query = queryImpl({
        prompt,
        options: buildQueryOptions({
          config: input.config,
          workspaceCwd: input.workspaceCwd,
          resumeSessionId: input.resumeSessionId,
        }),
      })

      let sessionId = input.resumeSessionId
      let providerRunId: string | null = null
      let finalSummary: string | null = null
      let costUsd = 0
      let tokenUsage: unknown = null
      let toolUsage: unknown = null
      let structuredOutput: unknown = null
      let sawResult = false

      for await (const message of query) {
        if (!sessionId && typeof message.session_id === 'string') {
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

        finalSummary = typeof message.result === 'string' ? message.result : null
        structuredOutput = message.structured_output
      }

      if (!sawResult) {
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
      }

      if (!sessionId) {
        throw new ClaudeReviewAgentExecutionError(
          'Claude review agent did not expose a session id.',
          {
            providerRunId,
            costUsd,
            tokenUsage,
            toolUsage,
            finalSummary,
          },
        )
      }

      if (!structuredOutput) {
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

      const recommendation =
        claudeReviewAgentRecommendationSchema.parse(structuredOutput)

      return {
        sessionId,
        providerRunId,
        finalSummary: finalSummary ?? recommendation.summary,
        costUsd,
        tokenUsage,
        toolUsage,
        recommendation,
      }
    },
  }
}
