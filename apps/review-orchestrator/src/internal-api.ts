import {
  internalPredictionSubmissionReviewResultInputSchema,
  internalPredictionSubmissionSchema,
  internalPredictionSubmissionStatusInputSchema,
} from '../../../packages/shared/src/types'
import type {
  InternalPredictionSubmission,
  InternalPredictionSubmissionReviewResultInput,
  InternalPredictionSubmissionStatusInput,
} from '../../../packages/shared/src/types'

import { reviewOrchestratorConfig } from './config'

type RequestOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
  fetchImpl?: typeof fetch
}

async function requestInternalApi<T>(
  path: string,
  parse: (input: unknown) => T,
  options: RequestOptions = {},
): Promise<T> {
  const response = await (options.fetchImpl ?? fetch)(
    `${reviewOrchestratorConfig.apiInternalBaseUrl}${path}`,
    {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${reviewOrchestratorConfig.internalServiceToken}`,
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    },
  )

  const payload = (await response.json().catch(() => null)) as unknown
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'message' in payload &&
      typeof payload.message === 'string'
        ? payload.message
        : `Internal API request failed with status ${response.status}.`
    throw new Error(message)
  }

  return parse(payload)
}

export async function readInternalPredictionSubmission(
  submissionId: string,
  fetchImpl?: typeof fetch,
): Promise<InternalPredictionSubmission> {
  return requestInternalApi(
    `/internal/prediction-submissions/${submissionId}`,
    (payload) => internalPredictionSubmissionSchema.parse(payload),
    {
      fetchImpl,
    },
  )
}

export async function updateInternalPredictionSubmissionStatus(
  submissionId: string,
  input: InternalPredictionSubmissionStatusInput,
  fetchImpl?: typeof fetch,
): Promise<InternalPredictionSubmission> {
  return requestInternalApi(
    `/internal/prediction-submissions/${submissionId}/status`,
    (payload) => internalPredictionSubmissionSchema.parse(payload),
    {
      method: 'POST',
      body: internalPredictionSubmissionStatusInputSchema.parse(input),
      fetchImpl,
    },
  )
}

export async function submitInternalPredictionReviewResult(
  submissionId: string,
  input: InternalPredictionSubmissionReviewResultInput,
  fetchImpl?: typeof fetch,
): Promise<{
  submission: InternalPredictionSubmission
}> {
  return requestInternalApi(
    `/internal/prediction-submissions/${submissionId}/review-result`,
    (payload) => {
      const parsed = payload as {
        submission: unknown
        reviewResult: unknown
      }

      return {
        submission: internalPredictionSubmissionSchema.parse(parsed.submission),
        reviewResult:
          internalPredictionSubmissionReviewResultInputSchema.parse({
            runId:
              parsed.reviewResult &&
              typeof parsed.reviewResult === 'object' &&
              'runId' in parsed.reviewResult
                ? parsed.reviewResult.runId
                : input.runId,
            reviewer:
              parsed.reviewResult &&
              typeof parsed.reviewResult === 'object' &&
              'reviewer' in parsed.reviewResult
                ? parsed.reviewResult.reviewer
                : input.reviewer,
            verdict:
              parsed.reviewResult &&
              typeof parsed.reviewResult === 'object' &&
              'verdict' in parsed.reviewResult
                ? parsed.reviewResult.verdict
                : input.verdict,
            confidence:
              parsed.reviewResult &&
              typeof parsed.reviewResult === 'object' &&
              'confidence' in parsed.reviewResult
                ? parsed.reviewResult.confidence
                : input.confidence,
            summary:
              parsed.reviewResult &&
              typeof parsed.reviewResult === 'object' &&
              'summary' in parsed.reviewResult
                ? parsed.reviewResult.summary
                : input.summary,
            evidence:
              parsed.reviewResult &&
              typeof parsed.reviewResult === 'object' &&
              'evidence' in parsed.reviewResult
                ? parsed.reviewResult.evidence
                : input.evidence,
            needsHumanReview:
              parsed.reviewResult &&
              typeof parsed.reviewResult === 'object' &&
              'needsHumanReview' in parsed.reviewResult
                ? parsed.reviewResult.needsHumanReview
                : input.needsHumanReview,
            snapshotRef:
              parsed.reviewResult &&
              typeof parsed.reviewResult === 'object' &&
              'snapshotRef' in parsed.reviewResult
                ? parsed.reviewResult.snapshotRef
                : input.snapshotRef,
            linkedMarketId:
              parsed.reviewResult &&
              typeof parsed.reviewResult === 'object' &&
              'linkedMarketId' in parsed.reviewResult &&
              typeof parsed.reviewResult.linkedMarketId === 'string'
                ? parsed.reviewResult.linkedMarketId
                : input.linkedMarketId,
            providerRunId:
              parsed.reviewResult &&
              typeof parsed.reviewResult === 'object' &&
              'providerRunId' in parsed.reviewResult &&
              typeof parsed.reviewResult.providerRunId === 'string'
                ? parsed.reviewResult.providerRunId
                : input.providerRunId,
          }),
      }
    },
    {
      method: 'POST',
      body: internalPredictionSubmissionReviewResultInputSchema.parse(input),
      fetchImpl,
    },
  )
}
