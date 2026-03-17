import type {
  InternalPredictionSubmission,
  InternalPredictionSubmissionReviewResultInput,
} from '../../../packages/shared/src/types'
import type { ReviewRequestedEvent } from '../../../packages/shared/src/types'

import { dispatchToEddie } from './eddie-client'
import { fetchReviewSnapshot } from './fetcher'
import {
  readInternalPredictionSubmission,
  submitInternalPredictionReviewResult,
  updateInternalPredictionSubmissionStatus,
} from './internal-api'
import { consumeReviewRequestedEvent } from './queue'

type WorkerDependencies = {
  consumeEvent: () => Promise<ReviewRequestedEvent | null>
  readSubmission: (submissionId: string) => Promise<InternalPredictionSubmission>
  updateStatus: (
    submissionId: string,
    input: { status: 'in_review' | 'failed' | 'escalated'; note?: string; runId?: string; providerRunId?: string },
  ) => Promise<InternalPredictionSubmission>
  fetchSnapshot: (url: string) => Promise<{ snapshotText: string; snapshotRef: string | null }>
  dispatchReview: (
    task: {
      runId: string
      submissionId: string
      sourceUrl: string
      snapshotText: string
      snapshotRef: string | null
    },
  ) => Promise<
    | { mode: 'completed'; result: InternalPredictionSubmissionReviewResultInput }
    | { mode: 'awaiting_callback'; providerRunId: string }
  >
  submitResult: (
    submissionId: string,
    input: InternalPredictionSubmissionReviewResultInput,
  ) => Promise<unknown>
}

type WorkerLoopDependencies = {
  runCycle?: () => Promise<boolean>
  sleep?: (durationMs: number) => Promise<void>
}

function createRunId(submissionId: string): string {
  return `run_${submissionId.replace(/^submission_/, '')}`
}

export async function runReviewWorkerCycle(
  dependencies: Partial<WorkerDependencies> = {},
): Promise<boolean> {
  const consumeEvent = dependencies.consumeEvent ?? consumeReviewRequestedEvent
  const event = await consumeEvent()
  if (!event) {
    return false
  }

  const readSubmission =
    dependencies.readSubmission ?? readInternalPredictionSubmission
  const updateStatus =
    dependencies.updateStatus ?? updateInternalPredictionSubmissionStatus
  const fetchSnapshot = dependencies.fetchSnapshot ?? fetchReviewSnapshot
  const dispatchReview = dependencies.dispatchReview ?? dispatchToEddie
  const submitResult =
    dependencies.submitResult ?? submitInternalPredictionReviewResult

  const runId = createRunId(event.submissionId)

  try {
    const submission = await readSubmission(event.submissionId)
    await updateStatus(event.submissionId, {
      status: 'in_review',
      runId,
      note: 'Queued review picked up by the orchestrator worker.',
    })

    const snapshot = await fetchSnapshot(submission.sourceUrl)
    const dispatchResult = await dispatchReview({
      runId,
      submissionId: event.submissionId,
      sourceUrl: submission.sourceUrl,
      snapshotText: snapshot.snapshotText,
      snapshotRef: snapshot.snapshotRef,
    })

    if (dispatchResult.mode === 'completed') {
      await submitResult(event.submissionId, dispatchResult.result)
      return true
    }

    await updateStatus(event.submissionId, {
      status: 'in_review',
      runId,
      providerRunId: dispatchResult.providerRunId,
      note: 'Review dispatched to EDDIE and awaiting callback.',
    })
    return true
  } catch (error) {
    await updateStatus(event.submissionId, {
      status: 'failed',
      runId,
      note:
        error instanceof Error
          ? error.message
          : 'Review orchestration failed.',
    }).catch(() => undefined)
    throw error
  }
}

export async function startReviewWorker(signal?: AbortSignal): Promise<void> {
  return startReviewWorkerWithDependencies(signal, {})
}

export async function startReviewWorkerWithDependencies(
  signal: AbortSignal | undefined,
  dependencies: WorkerLoopDependencies,
): Promise<void> {
  /* v8 ignore next */
  const runCycle = dependencies.runCycle ?? (() => runReviewWorkerCycle())
  const sleep =
    dependencies.sleep ??
    ((durationMs: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, durationMs)
      }))

  while (!signal?.aborted) {
    const processed = await runCycle().catch(() => true)
    if (!processed) {
      await sleep(500)
    }
  }
}
