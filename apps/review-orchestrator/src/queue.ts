import { reviewRequestedEventSchema } from '../../../packages/shared/src/types'
import type { ReviewRequestedEvent } from '../../../packages/shared/src/types'

import { reviewOrchestratorConfig } from './config'

type ReviewQueueStore = {
  consume: (queueKey: string) => Promise<ReviewRequestedEvent | null>
}

let redisStorePromise: Promise<ReviewQueueStore | null> | null = null
let storeOverride: ReviewQueueStore | null = null

async function resolveRedisStore(): Promise<ReviewQueueStore | null> {
  if (!reviewOrchestratorConfig.redisUrl) {
    return null
  }

  if (!redisStorePromise) {
    redisStorePromise = import('ioredis')
      .then(async ({ default: Redis }) => {
        const client = new Redis(reviewOrchestratorConfig.redisUrl, {
          enableReadyCheck: false,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        })

        await client.connect()

        return {
          consume: async (queueKey) => {
            const payload = await client.brpop(queueKey, 1)
            if (!payload?.[1]) {
              return null
            }

            return reviewRequestedEventSchema.parse(JSON.parse(payload[1]))
          },
        } satisfies ReviewQueueStore
      })
      .catch(() => null)
  }

  return redisStorePromise
}

export async function consumeReviewRequestedEvent(): Promise<ReviewRequestedEvent | null> {
  if (storeOverride) {
    return storeOverride.consume(reviewOrchestratorConfig.reviewQueueKey)
  }

  const redisStore = await resolveRedisStore()
  if (!redisStore) {
    return null
  }

  return redisStore.consume(reviewOrchestratorConfig.reviewQueueKey)
}

export function __setReviewQueueStoreForTests(
  store: ReviewQueueStore | null,
): void {
  storeOverride = store
}

export function __resetReviewQueueStateForTests(): void {
  storeOverride = null
  redisStorePromise = null
}
