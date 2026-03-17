import { apiConfig } from '../config'

export type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
}

type RateLimitStore = {
  consume: (
    key: string,
    limit: number,
    windowMs: number,
  ) => Promise<RateLimitResult>
}

type MemoryBucket = {
  count: number
  resetAt: number
}

const memoryBuckets = new Map<string, MemoryBucket>()

let redisStorePromise: Promise<RateLimitStore | null> | null = null
let storeOverride: RateLimitStore | null = null

function formatResult(
  count: number,
  limit: number,
  resetAt: number,
): RateLimitResult {
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(limit - count, 0),
    resetAt,
  }
}

function consumeWithMemory(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now()
  const current = memoryBuckets.get(key)

  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs
    memoryBuckets.set(key, { count: 1, resetAt })
    return formatResult(1, limit, resetAt)
  }

  current.count += 1
  memoryBuckets.set(key, current)
  return formatResult(current.count, limit, current.resetAt)
}

async function resolveRedisStore(): Promise<RateLimitStore | null> {
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
          consume: async (
            key: string,
            limit: number,
            windowMs: number,
          ): Promise<RateLimitResult> => {
            const scopedKey = `lemonsuk:rate-limit:${key}`
            const count = await client.incr(scopedKey)
            let ttlMs = await client.pttl(scopedKey)

            if (count === 1 || ttlMs < 0) {
              await client.pexpire(scopedKey, windowMs)
              ttlMs = windowMs
            }

            return formatResult(count, limit, Date.now() + ttlMs)
          },
        } satisfies RateLimitStore
      })
      .catch(() => null)
  }

  return redisStorePromise
}

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  if (storeOverride) {
    return storeOverride.consume(key, limit, windowMs)
  }

  const redisStore = await resolveRedisStore()
  if (redisStore) {
    return redisStore.consume(key, limit, windowMs)
  }

  return consumeWithMemory(key, limit, windowMs)
}

export function __setRateLimitStoreForTests(store: RateLimitStore | null): void {
  storeOverride = store
}

export function __resetRateLimitStateForTests(): void {
  memoryBuckets.clear()
  storeOverride = null
  redisStorePromise = null
}
