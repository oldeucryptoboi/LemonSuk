import { afterEach, describe, expect, it, vi } from 'vitest'

describe('review orchestrator queue', () => {
  afterEach(async () => {
    const queue = await import('./queue')
    queue.__resetReviewQueueStateForTests()
  })

  it('uses queue overrides and returns null when no queue backend is configured', async () => {
    const queue = await import('./queue')

    await expect(queue.consumeReviewRequestedEvent()).resolves.toBeNull()

    const consume = vi.fn(async () => ({
      eventType: 'review.requested' as const,
      submissionId: 'submission_1',
      submittedUrl: 'https://example.com/post',
      agentId: 'agent_1',
      createdAt: '2026-03-17T00:00:00.000Z',
      priority: 'normal' as const,
    }))
    queue.__setReviewQueueStoreForTests({ consume })

    await expect(queue.consumeReviewRequestedEvent()).resolves.toEqual(
      expect.objectContaining({
        submissionId: 'submission_1',
      }),
    )
    expect(consume).toHaveBeenCalledWith('lemonsuk:review-requested')
  })

  it('consumes queued events from redis and falls back to null if redis setup fails', async () => {
    const originalRedisUrl = process.env.REDIS_URL
    process.env.REDIS_URL = 'redis://127.0.0.1:6379'

    try {
      vi.resetModules()
      let brpopCount = 0
      vi.doMock('ioredis', () => ({
        default: class Redis {
          async connect() {}

          async brpop() {
            brpopCount += 1
            if (brpopCount > 1) {
              return ['lemonsuk:review-requested']
            }

            return [
              'lemonsuk:review-requested',
              JSON.stringify({
                eventType: 'review.requested',
                submissionId: 'submission_redis',
                submittedUrl: 'https://example.com/post',
                agentId: 'agent_redis',
                createdAt: '2026-03-17T00:00:00.000Z',
                priority: 'high',
              }),
            ]
          }
        },
      }))

      const queue = await import('./queue')
      await expect(queue.consumeReviewRequestedEvent()).resolves.toEqual(
        expect.objectContaining({
          submissionId: 'submission_redis',
          priority: 'high',
        }),
      )
      await expect(queue.consumeReviewRequestedEvent()).resolves.toBeNull()
    } finally {
      vi.doUnmock('ioredis')
      process.env.REDIS_URL = originalRedisUrl
    }

    vi.resetModules()
    process.env.REDIS_URL = 'redis://127.0.0.1:6379'
    vi.doMock('ioredis', () => {
      throw new Error('redis unavailable')
    })

    try {
      const queue = await import('./queue')
      await expect(queue.consumeReviewRequestedEvent()).resolves.toBeNull()
    } finally {
      vi.doUnmock('ioredis')
      process.env.REDIS_URL = originalRedisUrl
    }
  })
})
