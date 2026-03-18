import type {
  InternalPredictionLead,
  InternalPredictionSubmissionReviewResultInput,
} from '../../../packages/shared/src/types'
import type { ReviewRequestedEvent } from '../../../packages/shared/src/types'

import { dispatchToEddie } from './eddie-client'
import { fetchReviewSnapshot } from './fetcher'
import {
  readInternalPredictionLead,
  submitInternalPredictionLeadReviewResult,
  updateInternalPredictionLeadStatus,
} from './internal-api'
import { consumeReviewRequestedEvent } from './queue'

type WorkerDependencies = {
  consumeEvent: () => Promise<ReviewRequestedEvent | null>
  readLead: (leadId: string) => Promise<InternalPredictionLead>
  updateStatus: (
    leadId: string,
    input: { status: 'in_review' | 'failed' | 'escalated'; note?: string; runId?: string; providerRunId?: string },
  ) => Promise<InternalPredictionLead>
  fetchSnapshot: (url: string) => Promise<{ snapshotText: string; snapshotRef: string | null }>
  dispatchReview: (
    task: {
      runId: string
      leadId: string
      legacySubmissionId?: string | null
      sourceUrl: string
      snapshotText: string
      snapshotRef: string | null
    },
  ) => Promise<
    | { mode: 'completed'; result: InternalPredictionSubmissionReviewResultInput }
    | { mode: 'awaiting_callback'; providerRunId: string }
  >
  submitResult: (
    leadId: string,
    input: InternalPredictionSubmissionReviewResultInput,
  ) => Promise<unknown>
}

type WorkerLoopDependencies = {
  runCycle?: () => Promise<boolean>
  sleep?: (durationMs: number) => Promise<void>
}

function createRunId(leadId: string): string {
  return `run_${leadId.replace(/^lead_/, '')}`
}

export async function runReviewWorkerCycle(
  dependencies: Partial<WorkerDependencies> = {},
): Promise<boolean> {
  const consumeEvent = dependencies.consumeEvent ?? consumeReviewRequestedEvent
  const event = await consumeEvent()
  if (!event) {
    return false
  }

  const readLead = dependencies.readLead ?? readInternalPredictionLead
  const updateStatus =
    dependencies.updateStatus ?? updateInternalPredictionLeadStatus
  const fetchSnapshot = dependencies.fetchSnapshot ?? fetchReviewSnapshot
  const dispatchReview = dependencies.dispatchReview ?? dispatchToEddie
  const submitResult =
    dependencies.submitResult ?? submitInternalPredictionLeadReviewResult

  const runId = createRunId(event.leadId)

  try {
    const lead = await readLead(event.leadId)
    await updateStatus(event.leadId, {
      status: 'in_review',
      runId,
      note: 'Queued review picked up by the orchestrator worker.',
    })

    const snapshot = await fetchSnapshot(lead.sourceUrl)
    const dispatchResult = await dispatchReview({
      runId,
      leadId: event.leadId,
      legacySubmissionId: event.legacySubmissionId ?? null,
      sourceUrl: lead.sourceUrl,
      snapshotText: snapshot.snapshotText,
      snapshotRef: snapshot.snapshotRef,
    })

    if (dispatchResult.mode === 'completed') {
      await submitResult(event.leadId, dispatchResult.result)
      return true
    }

    await updateStatus(event.leadId, {
      status: 'in_review',
      runId,
      providerRunId: dispatchResult.providerRunId,
      note: 'Review dispatched to EDDIE and awaiting callback.',
    })
    return true
  } catch (error) {
    await updateStatus(event.leadId, {
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
