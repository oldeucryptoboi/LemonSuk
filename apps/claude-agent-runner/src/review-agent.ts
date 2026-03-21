import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import type { ClaudeReviewAgentRun, PredictionReviewResult } from '../../../packages/shared/src/types'

import type { ClaudeReviewAgentRunnerConfig } from './config'
import {
  appendClaudeReviewRunEvent,
  claimNextClaudeReviewLead,
  completeClaudeReviewRun,
  failClaudeReviewRun,
} from './internal-api'
import {
  ClaudeReviewAgentExecutionError,
  createClaudeReviewModelClient,
  type ClaudeReviewModelClient,
} from './sdk'

export type ReviewAgentRunOutcome =
  | {
      claimed: false
      resumeSessionId: string | null
    }
  | {
      claimed: true
      run: ClaudeReviewAgentRun
      reviewResult: PredictionReviewResult
    }

type ReviewAgentDependencies = {
  config: ClaudeReviewAgentRunnerConfig
  modelClient?: ClaudeReviewModelClient
  fetchImpl?: typeof fetch
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown Claude review agent failure.'
}

export async function runClaudeReviewAgent(
  dependencies: ReviewAgentDependencies,
): Promise<ReviewAgentRunOutcome> {
  const modelClient =
    dependencies.modelClient ?? createClaudeReviewModelClient()
  const workspaceCwd = path.join(
    dependencies.config.workspaceRoot,
    dependencies.config.agentKey,
  )
  await mkdir(workspaceCwd, { recursive: true })

  const claim = await claimNextClaudeReviewLead(
    dependencies.config,
    {
      agentKey: dependencies.config.agentKey,
      trigger: 'manual',
      promptSummary: 'Inspect next pending lead and return a structured review recommendation.',
      workspaceCwd,
      leaseSeconds: dependencies.config.leaseSeconds,
    },
    dependencies.fetchImpl,
  )

  if (!claim.claimed || !claim.run || !claim.lead) {
    return {
      claimed: false,
      resumeSessionId: claim.resumeSessionId,
    }
  }

  try {
    await appendClaudeReviewRunEvent(
      dependencies.config,
      claim.run.id,
      {
        eventType: 'claude_review_started',
        payload: {
          leadId: claim.lead.lead.id,
          resumeSessionId: claim.resumeSessionId,
        },
      },
      dependencies.fetchImpl,
    )

    const result = await modelClient.reviewLead({
      config: dependencies.config,
      workspaceCwd,
      resumeSessionId: claim.resumeSessionId,
      lead: claim.lead,
    })

    await appendClaudeReviewRunEvent(
      dependencies.config,
      claim.run.id,
      {
        eventType: 'claude_review_recommendation_ready',
        payload: {
          providerRunId: result.providerRunId,
          verdict: result.recommendation.verdict,
          needsHumanReview: result.recommendation.needsHumanReview,
          costUsd: result.costUsd,
        },
      },
      dependencies.fetchImpl,
    )

    const completed = await completeClaudeReviewRun(
      dependencies.config,
      claim.run.id,
      {
        sessionId: result.sessionId,
        providerRunId: result.providerRunId ?? undefined,
        finalSummary: result.finalSummary,
        costUsd: result.costUsd,
        tokenUsage: result.tokenUsage,
        toolUsage: result.toolUsage,
        recommendation: result.recommendation,
      },
      dependencies.fetchImpl,
    )

    return {
      claimed: true,
      run: completed.run,
      reviewResult: completed.reviewResult,
    }
  } catch (error) {
    const failure =
      error instanceof ClaudeReviewAgentExecutionError
        ? error
        : new ClaudeReviewAgentExecutionError(toErrorMessage(error))

    try {
      await failClaudeReviewRun(
        dependencies.config,
        claim.run.id,
        {
          sessionId: failure.sessionId ?? undefined,
          providerRunId: failure.providerRunId ?? undefined,
          finalSummary: failure.finalSummary ?? undefined,
          errorMessage: failure.message,
          costUsd: failure.costUsd,
          tokenUsage: failure.tokenUsage,
          toolUsage: failure.toolUsage,
        },
        dependencies.fetchImpl,
      )
    } catch (failError) {
      throw new Error(
        `${failure.message} Also failed to record Claude review run failure: ${toErrorMessage(
          failError,
        )}`,
      )
    }

    throw failure
  }
}
