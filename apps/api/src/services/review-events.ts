import { defaultReviewQueueKey, reviewRequestedEventSchema } from '../shared'
import type { ReviewRequestedEvent } from '../shared'
import { apiConfig } from '../config'

type ReviewEventStore = {
  enqueue: (queueKey: string, event: ReviewRequestedEvent) => Promise<void>
}

const memoryQueue = new Map<string, ReviewRequestedEvent[]>()

let redisStorePromise: Promise<ReviewEventStore | null> | null = null
let storeOverride: ReviewEventStore | null = null

async function resolveRedisStore(): Promise<ReviewEventStore | null> {
  if (!apiConfig.redisUrl) {
    return null
  }

  if (!redisStorePromise) {
    redisStorePromise = import('ioredis')
      .then(async ({ default: Redis }) => {
        const client = new Redis(apiConfig.redisUrl, {
          enableReadyCheck: false,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        })

        await client.connect()

        return {
          enqueue: async (queueKey, event) => {
            await client.lpush(queueKey, JSON.stringify(event))
          },
        } satisfies ReviewEventStore
      })
      .catch(() => null)
  }

  return redisStorePromise
}

function enqueueWithMemory(
  queueKey: string,
  event: ReviewRequestedEvent,
): void {
  const current = memoryQueue.get(queueKey) ?? []
  current.unshift(event)
  memoryQueue.set(queueKey, current)
}

export async function enqueueReviewRequestedEvent(
  event: ReviewRequestedEvent,
): Promise<boolean> {
  const parsed = reviewRequestedEventSchema.parse(event)
  /* v8 ignore next */
  const queueKey = apiConfig.reviewQueueKey || defaultReviewQueueKey

  if (storeOverride) {
    await storeOverride.enqueue(queueKey, parsed)
    return true
  }

  const redisStore = await resolveRedisStore()
  if (redisStore) {
    await redisStore.enqueue(queueKey, parsed)
    return true
  }

  enqueueWithMemory(queueKey, parsed)
  return true
}

export function __readReviewEventsForTests(
  /* v8 ignore next */
  queueKey = apiConfig.reviewQueueKey || defaultReviewQueueKey,
): ReviewRequestedEvent[] {
  return [...(memoryQueue.get(queueKey) ?? [])]
}

export function __setReviewEventStoreForTests(
  store: ReviewEventStore | null,
): void {
  storeOverride = store
}

export function __resetReviewEventStateForTests(): void {
  memoryQueue.clear()
  storeOverride = null
  redisStorePromise = null
}
