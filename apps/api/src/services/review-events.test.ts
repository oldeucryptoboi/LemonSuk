import { afterEach, describe, expect, it, vi } from 'vitest'

describe('review event publisher', () => {
  afterEach(async () => {
    const reviewEvents = await import('./review-events')
    reviewEvents.__resetReviewEventStateForTests()
  })

  it('queues review requested events in memory by default and supports overrides', async () => {
    const reviewEvents = await import('./review-events')

    await expect(
      reviewEvents.enqueueReviewRequestedEvent({
        eventType: 'review.requested',
        leadId: 'lead_1',
        legacySubmissionId: 'submission_1',
        submittedUrl: 'https://example.com/claim',
        agentId: 'agent_1',
        createdAt: '2026-03-17T00:00:00.000Z',
        priority: 'normal',
      }),
    ).resolves.toBe(true)

    expect(reviewEvents.__readReviewEventsForTests()).toEqual([
      expect.objectContaining({
        leadId: 'lead_1',
        legacySubmissionId: 'submission_1',
      }),
    ])
    expect(reviewEvents.__readReviewEventsForTests('missing-queue')).toEqual([])

    const enqueue = vi.fn(async () => undefined)
    reviewEvents.__setReviewEventStoreForTests({ enqueue })

    await expect(
      reviewEvents.enqueueReviewRequestedEvent({
        eventType: 'review.requested',
        leadId: 'lead_2',
        legacySubmissionId: 'submission_2',
        submittedUrl: 'https://example.com/claim-2',
        agentId: 'agent_2',
        createdAt: '2026-03-17T00:05:00.000Z',
        priority: 'high',
      }),
    ).resolves.toBe(true)

    expect(enqueue).toHaveBeenCalledWith(
      'lemonsuk:review-requested',
      expect.objectContaining({
        leadId: 'lead_2',
        legacySubmissionId: 'submission_2',
        priority: 'high',
      }),
    )
  })

  it('publishes to redis when configured and falls back when redis setup fails', async () => {
    const originalRedisUrl = process.env.REDIS_URL
    const originalQueueKey = process.env.REVIEW_QUEUE_KEY
    process.env.REDIS_URL = 'redis://127.0.0.1:6379'
    process.env.REVIEW_QUEUE_KEY = 'lemonsuk:review-custom'

    try {
      vi.resetModules()
      const lpush = vi.fn(
        async (_queueKey: string, _payload: string) => 1,
      )
      vi.doMock('ioredis', () => ({
        default: class Redis {
          async connect() {}

          async lpush(queueKey: string, payload: string) {
            return lpush(queueKey, payload)
          }
        },
      }))

      const reviewEvents = await import('./review-events')
      await expect(
        reviewEvents.enqueueReviewRequestedEvent({
          eventType: 'review.requested',
          leadId: 'lead_redis',
          legacySubmissionId: 'submission_redis',
          submittedUrl: 'https://example.com/redis',
          agentId: 'agent_redis',
          createdAt: '2026-03-17T00:10:00.000Z',
          priority: 'normal',
        }),
      ).resolves.toBe(true)

      expect(lpush).toHaveBeenCalledWith(
        'lemonsuk:review-custom',
        expect.stringContaining('"leadId":"lead_redis"'),
      )
    } finally {
      vi.doUnmock('ioredis')
      process.env.REDIS_URL = originalRedisUrl
      process.env.REVIEW_QUEUE_KEY = originalQueueKey
    }

    vi.resetModules()
    process.env.REDIS_URL = 'redis://127.0.0.1:6379'
    process.env.REVIEW_QUEUE_KEY = 'lemonsuk:review-custom'
    vi.doMock('ioredis', () => {
      throw new Error('redis unavailable')
    })

    try {
      const reviewEvents = await import('./review-events')
      await expect(
        reviewEvents.enqueueReviewRequestedEvent({
          eventType: 'review.requested',
          leadId: 'lead_fallback',
          legacySubmissionId: 'submission_fallback',
          submittedUrl: 'https://example.com/fallback',
          agentId: 'agent_fallback',
          createdAt: '2026-03-17T00:15:00.000Z',
          priority: 'high',
        }),
      ).resolves.toBe(true)

      expect(reviewEvents.__readReviewEventsForTests('lemonsuk:review-custom')).toEqual([
        expect.objectContaining({
          leadId: 'lead_fallback',
          legacySubmissionId: 'submission_fallback',
        }),
      ])
    } finally {
      vi.doUnmock('ioredis')
      process.env.REDIS_URL = originalRedisUrl
      process.env.REVIEW_QUEUE_KEY = originalQueueKey
    }
  })
})
