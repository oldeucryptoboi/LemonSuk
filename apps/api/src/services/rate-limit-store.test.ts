import { afterEach, describe, expect, it, vi } from 'vitest'

describe('rate limit store', () => {
  afterEach(() => {
    delete process.env.REDIS_URL
    vi.resetModules()
  })

  it('tracks limits in memory and honors explicit test overrides', async () => {
    const rateLimitStore = await import('./rate-limit-store')

    rateLimitStore.__resetRateLimitStateForTests()

    const first = await rateLimitStore.consumeRateLimit('dashboard:ip', 1, 5_000)
    const second = await rateLimitStore.consumeRateLimit(
      'dashboard:ip',
      1,
      5_000,
    )

    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(false)

    rateLimitStore.__setRateLimitStoreForTests({
      consume: vi.fn(async () => ({
        allowed: true,
        limit: 99,
        remaining: 98,
        resetAt: 123,
      })),
    })

    expect(await rateLimitStore.consumeRateLimit('override', 1, 1_000)).toEqual({
      allowed: true,
      limit: 99,
      remaining: 98,
      resetAt: 123,
    })
  })

  it('uses redis when configured', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379'

    const connect = vi.fn(async () => undefined)
    const incr = vi
      .fn(async () => 1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
    const pttl = vi
      .fn(async () => -1)
      .mockResolvedValueOnce(-1)
      .mockResolvedValueOnce(-1)
    const pexpire = vi.fn(async () => 1)

    vi.doMock('ioredis', () => ({
      default: class MockRedis {
        connect = connect
        incr = incr
        pttl = pttl
        pexpire = pexpire
      },
    }))

    const rateLimitStore = await import('./rate-limit-store')
    rateLimitStore.__resetRateLimitStateForTests()

    const first = await rateLimitStore.consumeRateLimit('dashboard:ip', 3, 10_000)
    const second = await rateLimitStore.consumeRateLimit(
      'dashboard:ip',
      3,
      10_000,
    )

    expect(connect).toHaveBeenCalledTimes(1)
    expect(incr).toHaveBeenCalledWith('lemonsuk:rate-limit:dashboard:ip')
    expect(pttl).toHaveBeenCalledWith('lemonsuk:rate-limit:dashboard:ip')
    expect(pexpire).toHaveBeenCalledWith(
      'lemonsuk:rate-limit:dashboard:ip',
      10_000,
    )
    expect(first.allowed).toBe(true)
    expect(first.limit).toBe(3)
    expect(second.allowed).toBe(true)
  })
})
