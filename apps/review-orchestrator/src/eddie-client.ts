import { internalPredictionSubmissionReviewResultInputSchema } from '../../../packages/shared/src/types'

import { reviewOrchestratorConfig } from './config'
import { eddieDispatchTaskSchema } from './types'
import type { EddieDispatchTask } from './types'

type EddieDispatchResult =
  | {
      mode: 'completed'
      result: ReturnType<
        typeof internalPredictionSubmissionReviewResultInputSchema.parse
      >
    }
  | {
      mode: 'awaiting_callback'
      providerRunId: string
    }

function buildEddieDispatchUrl(): string {
  const endpoint = new URL(reviewOrchestratorConfig.eddieBaseUrl)
  if (reviewOrchestratorConfig.reviewToken) {
    endpoint.searchParams.set(
      'review_token',
      reviewOrchestratorConfig.reviewToken,
    )
  }
  return endpoint.toString()
}

export async function dispatchToEddie(
  task: EddieDispatchTask,
  fetchImpl: typeof fetch = fetch,
): Promise<EddieDispatchResult> {
  const parsed = eddieDispatchTaskSchema.parse(task)

  if (!reviewOrchestratorConfig.eddieBaseUrl) {
    return {
      mode: 'completed',
      result: internalPredictionSubmissionReviewResultInputSchema.parse({
        runId: parsed.runId,
        reviewer: 'eddie',
        verdict: 'escalate',
        confidence: 0.25,
        summary:
          'EDDIE endpoint is not configured yet. This submission was escalated for manual follow-up.',
        evidence: [
          {
            url: parsed.sourceUrl,
            excerpt:
              parsed.snapshotText.slice(0, 220) || 'No snapshot text captured.',
          },
        ],
        needsHumanReview: true,
        snapshotRef: parsed.snapshotRef,
      }),
    }
  }

  const response = await fetchImpl(buildEddieDispatchUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${reviewOrchestratorConfig.eddieApiKey}`,
    },
    body: JSON.stringify(parsed),
  })

  const payload = (await response.json().catch(() => null)) as {
    providerRunId?: string
  } | null

  if (!response.ok || !payload?.providerRunId) {
    throw new Error('EDDIE dispatch failed.')
  }

  return {
    mode: 'awaiting_callback',
    providerRunId: payload.providerRunId,
  }
}
