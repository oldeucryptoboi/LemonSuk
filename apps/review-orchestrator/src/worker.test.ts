import { describe, expect, it, vi } from 'vitest'

import type {
  InternalPredictionLead,
  ReviewRequestedEvent,
} from '../../../packages/shared/src/types'

describe('runReviewWorkerCycle', () => {
  function buildLead(
    overrides: Partial<InternalPredictionLead> = {},
  ): InternalPredictionLead {
    return {
      id: 'lead_1',
      leadType: 'structured_agent_lead',
      submittedByAgentId: 'agent_1',
      submittedByOwnerEmail: null,
      sourceUrl: 'https://example.com/post',
      normalizedSourceUrl: 'https://example.com/post',
      sourceLabel: 'example.com',
      sourceDomain: 'example.com',
      sourceType: 'blog',
      sourceNote: null,
      sourcePublishedAt: null,
      claimedHeadline: 'Queued headline',
      claimedSubject: 'Queued subject',
      claimedCategory: 'social',
      familyId: null,
      familySlug: null,
      familyDisplayName: null,
      primaryEntityId: null,
      primaryEntitySlug: null,
      primaryEntityDisplayName: null,
      eventGroupId: null,
      promisedDate: '2027-12-31T23:59:59.000Z',
      summary: 'Queued summary that is long enough for schema validation.',
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
      createdAt: '2026-03-17T00:00:00.000Z',
      updatedAt: '2026-03-17T00:00:00.000Z',
      submittedBy: {
        id: 'agent_1',
        handle: 'alpha',
        displayName: 'Alpha',
        avatarUrl: null,
      },
      ...overrides,
    }
  }

  function buildReviewRequestedEvent(
    overrides: Partial<ReviewRequestedEvent> = {},
  ): ReviewRequestedEvent {
    return {
      eventType: 'review.requested',
      leadId: 'lead_1',
      legacySubmissionId: 'submission_1',
      submittedUrl: 'https://example.com/post',
      agentId: 'agent_1',
      ownerEmail: null,
      createdAt: '2026-03-17T00:00:00.000Z',
      priority: 'normal',
      ...overrides,
    }
  }

  it('processes a queued review and submits an immediate completed result', async () => {
    const { runReviewWorkerCycle } = await import('./worker')

    const consumeEvent = vi.fn(async () =>
      buildReviewRequestedEvent({ legacySubmissionId: undefined }),
    )
    const readLead = vi.fn(async () => buildLead())
    const updateStatus = vi.fn(async () =>
      buildLead({
        status: 'in_review',
        reviewNotes: 'Picked up by review worker.',
        updatedAt: '2026-03-17T00:00:15.000Z',
      }),
    )
    const fetchSnapshot = vi.fn(async () => ({
      snapshotText: 'Captured snapshot text.',
      snapshotRef: 'snapshot://lead_1',
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
        snapshotRef: 'snapshot://lead_1',
      },
    }))
    const submitResult = vi.fn(async () => ({
      lead: buildLead({
        status: 'escalated',
        reviewNotes: 'Escalated for manual review.',
        reviewedAt: '2026-03-17T00:01:00.000Z',
      }),
    }))

    await expect(
      runReviewWorkerCycle({
        consumeEvent,
        readLead,
        updateStatus,
        fetchSnapshot,
        dispatchReview,
        submitResult,
      }),
    ).resolves.toBe(true)

    expect(updateStatus).toHaveBeenNthCalledWith(
      1,
      'lead_1',
      expect.objectContaining({
        status: 'in_review',
      }),
    )
    expect(submitResult).toHaveBeenCalledWith(
      'lead_1',
      expect.objectContaining({
        reviewer: 'eddie',
      }),
    )
    expect(dispatchReview).toHaveBeenCalledWith(
      expect.objectContaining({
        legacySubmissionId: null,
      }),
    )

    vi.resetModules()
    vi.doMock('./queue', () => ({
      consumeReviewRequestedEvent: vi.fn(async () =>
        buildReviewRequestedEvent({
          leadId: 'lead_default',
          legacySubmissionId: 'submission_default',
        }),
      ),
    }))
    vi.doMock('./internal-api', () => ({
      readInternalPredictionLead: vi.fn(async () =>
        buildLead({
          id: 'lead_default',
          legacyAgentSubmissionId: 'submission_default',
        }),
      ),
      updateInternalPredictionLeadStatus: vi.fn(async () =>
        buildLead({
          id: 'lead_default',
          status: 'in_review',
          legacyAgentSubmissionId: 'submission_default',
        }),
      ),
      submitInternalPredictionLeadReviewResult: vi.fn(async () => ({
        lead: buildLead({
          id: 'lead_default',
          status: 'escalated',
          legacyAgentSubmissionId: 'submission_default',
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
    } = await import('./worker')

    await expect(
      runReviewWorkerCycle({
        consumeEvent: vi.fn(async () => null),
      }),
    ).resolves.toBe(false)

    const updateStatus = vi.fn(async () =>
      buildLead({
        id: 'lead_2',
        status: 'failed',
        reviewNotes: 'Snapshot fetch exploded.',
        reviewedAt: '2026-03-17T00:02:00.000Z',
      }),
    )

    await expect(
      runReviewWorkerCycle({
        consumeEvent: vi.fn(async () =>
          buildReviewRequestedEvent({
            leadId: 'lead_2',
            legacySubmissionId: 'submission_2',
          }),
        ),
        readLead: vi.fn(async () => {
          throw new Error('Snapshot fetch exploded.')
        }),
        updateStatus,
      }),
    ).rejects.toThrow('Snapshot fetch exploded.')

    expect(updateStatus).toHaveBeenLastCalledWith(
      'lead_2',
      expect.objectContaining({
        status: 'failed',
      }),
    )

    const awaitingCallbackStatus = vi.fn(async () =>
      buildLead({
        id: 'lead_3',
        status: 'in_review',
        reviewNotes: 'Waiting on EDDIE callback.',
      }),
    )

    await expect(
      runReviewWorkerCycle({
        consumeEvent: vi.fn(async () =>
          buildReviewRequestedEvent({
            leadId: 'lead_3',
            legacySubmissionId: 'submission_3',
          }),
        ),
        readLead: vi.fn(async () =>
          buildLead({
            id: 'lead_3',
            legacyAgentSubmissionId: 'submission_3',
          }),
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
      'lead_3',
      expect.objectContaining({
        status: 'in_review',
        providerRunId: 'provider_run_3',
      }),
    )

    const nonErrorStatus = vi.fn(async () =>
      buildLead({
        id: 'lead_4',
        status: 'failed',
        reviewNotes: 'Review orchestration failed.',
      }),
    )

    await expect(
      runReviewWorkerCycle({
        consumeEvent: vi.fn(async () =>
          buildReviewRequestedEvent({
            leadId: 'lead_4',
            legacySubmissionId: 'submission_4',
          }),
        ),
        readLead: vi.fn(async () => {
          throw 'string-failure'
        }),
        updateStatus: nonErrorStatus,
      }),
    ).rejects.toBe('string-failure')

    expect(nonErrorStatus).toHaveBeenLastCalledWith(
      'lead_4',
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
