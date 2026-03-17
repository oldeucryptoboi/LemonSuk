import { describe, expect, it, vi } from 'vitest'

import type {
  InternalPredictionSubmission,
  ReviewRequestedEvent,
} from '../../../packages/shared/src/types'

describe('runReviewWorkerCycle', () => {
  function buildSubmission(
    overrides: Partial<InternalPredictionSubmission> = {},
  ): InternalPredictionSubmission {
    return {
      id: 'submission_1',
      headline: 'Queued headline',
      subject: 'Queued subject',
      category: 'social',
      summary: 'Queued summary that is long enough for schema validation.',
      promisedDate: '2027-12-31T23:59:59.000Z',
      sourceUrl: 'https://example.com/post',
      sourceLabel: 'example.com',
      sourceDomain: 'example.com',
      sourceType: 'blog',
      tags: [],
      status: 'pending',
      reviewNotes: null,
      linkedMarketId: null,
      submittedAt: '2026-03-17T00:00:00.000Z',
      updatedAt: '2026-03-17T00:00:00.000Z',
      reviewedAt: null,
      submittedBy: {
        id: 'agent_1',
        handle: 'alpha',
        displayName: 'Alpha',
      },
      sourceNote: null,
      sourcePublishedAt: null,
      ...overrides,
    }
  }

  function buildReviewRequestedEvent(
    overrides: Partial<ReviewRequestedEvent> = {},
  ): ReviewRequestedEvent {
    return {
      eventType: 'review.requested',
      submissionId: 'submission_1',
      submittedUrl: 'https://example.com/post',
      agentId: 'agent_1',
      createdAt: '2026-03-17T00:00:00.000Z',
      priority: 'normal',
      ...overrides,
    }
  }

  it('processes a queued review and submits an immediate completed result', async () => {
    const { runReviewWorkerCycle } = await import('./worker')

    const consumeEvent = vi.fn(async () => buildReviewRequestedEvent())
    const readSubmission = vi.fn(async () => buildSubmission())
    const updateStatus = vi.fn(async () =>
      buildSubmission({
        status: 'in_review',
        reviewNotes: 'Picked up by review worker.',
        updatedAt: '2026-03-17T00:00:15.000Z',
      }),
    )
    const fetchSnapshot = vi.fn(async () => ({
      snapshotText: 'Captured snapshot text.',
      snapshotRef: 'snapshot://submission_1',
    }))
    const dispatchReview = vi.fn(async () => ({
      mode: 'completed' as const,
      result: {
        runId: 'run_1',
        reviewer: 'eddie',
        verdict: 'escalate' as const,
        confidence: 0.4,
        summary: 'Escalated for manual review.',
        evidence: [
          {
            url: 'https://example.com/post',
            excerpt: 'Captured snapshot text.',
          },
        ],
        needsHumanReview: true,
        snapshotRef: 'snapshot://submission_1',
      },
    }))
    const submitResult = vi.fn(async () => ({
      submission: buildSubmission({
        status: 'escalated',
        reviewNotes: 'Escalated for manual review.',
        reviewedAt: '2026-03-17T00:01:00.000Z',
      }),
    }))

    await expect(
      runReviewWorkerCycle({
        consumeEvent,
        readSubmission,
        updateStatus,
        fetchSnapshot,
        dispatchReview,
        submitResult,
      }),
    ).resolves.toBe(true)

    expect(updateStatus).toHaveBeenNthCalledWith(
      1,
      'submission_1',
      expect.objectContaining({
        status: 'in_review',
      }),
    )
    expect(submitResult).toHaveBeenCalledWith(
      'submission_1',
      expect.objectContaining({
        reviewer: 'eddie',
      }),
    )

    vi.resetModules()
    vi.doMock('./queue', () => ({
      consumeReviewRequestedEvent: vi.fn(async () =>
        buildReviewRequestedEvent({ submissionId: 'submission_default' }),
      ),
    }))
    vi.doMock('./internal-api', () => ({
      readInternalPredictionSubmission: vi.fn(async () =>
        buildSubmission({ id: 'submission_default' }),
      ),
      updateInternalPredictionSubmissionStatus: vi.fn(async () =>
        buildSubmission({
          id: 'submission_default',
          status: 'in_review',
        }),
      ),
      submitInternalPredictionReviewResult: vi.fn(async () => ({
        submission: buildSubmission({
          id: 'submission_default',
          status: 'escalated',
        }),
      })),
    }))
    vi.doMock('./fetcher', () => ({
      fetchReviewSnapshot: vi.fn(async () => ({
        snapshotText: 'default snapshot',
        snapshotRef: null,
      })),
    }))
    vi.doMock('./eddie-client', () => ({
      dispatchToEddie: vi.fn(async () => ({
        mode: 'completed' as const,
        result: {
          runId: 'run_default',
          reviewer: 'eddie',
          verdict: 'escalate' as const,
          confidence: 0.5,
          summary: 'Default dependency path.',
          evidence: [],
          needsHumanReview: true,
        },
      })),
    }))

    const { runReviewWorkerCycle: runDefaultCycle, startReviewWorkerWithDependencies } =
      await import('./worker')

    await expect(runDefaultCycle()).resolves.toBe(true)

    const defaultController = new AbortController()
    defaultController.abort()
    await expect(
      startReviewWorkerWithDependencies(defaultController.signal, {}),
    ).resolves.toBeUndefined()
  })

  it('marks failures and returns false when there is no queued work', async () => {
    const {
      runReviewWorkerCycle,
      startReviewWorker,
      startReviewWorkerWithDependencies,
    } =
      await import('./worker')

    await expect(
      runReviewWorkerCycle({
        consumeEvent: vi.fn(async () => null),
      }),
    ).resolves.toBe(false)

    const updateStatus = vi.fn(async () =>
      buildSubmission({
        id: 'submission_2',
        status: 'failed',
        reviewNotes: 'Snapshot fetch exploded.',
        reviewedAt: '2026-03-17T00:02:00.000Z',
      }),
    )

    await expect(
      runReviewWorkerCycle({
        consumeEvent: vi.fn(async () =>
          buildReviewRequestedEvent({ submissionId: 'submission_2' }),
        ),
        readSubmission: vi.fn(async () => {
          throw new Error('Snapshot fetch exploded.')
        }),
        updateStatus,
      }),
    ).rejects.toThrow('Snapshot fetch exploded.')

    expect(updateStatus).toHaveBeenLastCalledWith(
      'submission_2',
      expect.objectContaining({
        status: 'failed',
      }),
    )

    const awaitingCallbackStatus = vi.fn(async () =>
      buildSubmission({
        id: 'submission_3',
        status: 'in_review',
        reviewNotes: 'Waiting on EDDIE callback.',
      }),
    )

    await expect(
      runReviewWorkerCycle({
        consumeEvent: vi.fn(async () =>
          buildReviewRequestedEvent({ submissionId: 'submission_3' }),
        ),
        readSubmission: vi.fn(async () =>
          buildSubmission({ id: 'submission_3' }),
        ),
        updateStatus: awaitingCallbackStatus,
        fetchSnapshot: vi.fn(async () => ({
          snapshotText: 'Captured snapshot text.',
          snapshotRef: null,
        })),
        dispatchReview: vi.fn(async () => ({
          mode: 'awaiting_callback' as const,
          providerRunId: 'provider_run_3',
        })),
      }),
    ).resolves.toBe(true)

    expect(awaitingCallbackStatus).toHaveBeenLastCalledWith(
      'submission_3',
      expect.objectContaining({
        status: 'in_review',
        providerRunId: 'provider_run_3',
      }),
    )

    const nonErrorStatus = vi.fn(async () =>
      buildSubmission({
        id: 'submission_4',
        status: 'failed',
        reviewNotes: 'Review orchestration failed.',
      }),
    )

    await expect(
      runReviewWorkerCycle({
        consumeEvent: vi.fn(async () =>
          buildReviewRequestedEvent({ submissionId: 'submission_4' }),
        ),
        readSubmission: vi.fn(async () => {
          throw 'string-failure'
        }),
        updateStatus: nonErrorStatus,
      }),
    ).rejects.toBe('string-failure')

    expect(nonErrorStatus).toHaveBeenLastCalledWith(
      'submission_4',
      expect.objectContaining({
        note: 'Review orchestration failed.',
      }),
    )

    const sleep = vi.fn(async () => undefined)
    const runCycle = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockImplementationOnce(async () => {
        abortController.abort()
        return true
      })
    const abortController = new AbortController()

    await expect(
      startReviewWorkerWithDependencies(abortController.signal, {
        runCycle,
        sleep,
      }),
    ).resolves.toBeUndefined()

    expect(sleep).toHaveBeenCalledWith(500)

    const failingAbortController = new AbortController()
    const failingRunCycle = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('cycle exploded'))
      .mockImplementationOnce(async () => {
        failingAbortController.abort()
        return true
      })

    await expect(
      startReviewWorkerWithDependencies(failingAbortController.signal, {
        runCycle: failingRunCycle,
        sleep,
      }),
    ).resolves.toBeUndefined()

    const immediatelyAbortedController = new AbortController()
    immediatelyAbortedController.abort()
    await expect(
      startReviewWorker(immediatelyAbortedController.signal),
    ).resolves.toBeUndefined()

    vi.useFakeTimers()
    const timerAbortController = new AbortController()
    const defaultSleepPromise = startReviewWorkerWithDependencies(
      timerAbortController.signal,
      {
        runCycle: vi
          .fn<() => Promise<boolean>>()
          .mockResolvedValueOnce(false)
          .mockImplementationOnce(async () => {
            timerAbortController.abort()
            return true
          }),
      },
    )
    await vi.advanceTimersByTimeAsync(500)
    await expect(defaultSleepPromise).resolves.toBeUndefined()
    vi.useRealTimers()
  })
})
