import express from 'express'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  __resetRateLimitStateForTests,
  __setRateLimitStoreForTests,
} from '../services/rate-limit-store'
import { createRateLimitMiddleware } from './rate-limit'

describe('createRateLimitMiddleware', () => {
  afterEach(() => {
    __resetRateLimitStateForTests()
  })

  it('sets rate limit headers and continues when allowed', async () => {
    const consume = vi.fn(async () => ({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: 1234,
    }))
    __setRateLimitStoreForTests({ consume })

    const app = express()
    app.get(
      '/ok',
      createRateLimitMiddleware({
        bucket: 'api',
        limit: 10,
        windowMs: 60_000,
      }),
      (_request, response) => {
        response.json({ ok: true })
      },
    )

    const response = await request(app).get('/ok')

    expect(response.statusCode).toBe(200)
    expect(response.headers['x-ratelimit-limit']).toBe('10')
    expect(response.headers['x-ratelimit-remaining']).toBe('9')
    expect(response.headers['x-ratelimit-reset']).toBe('1234')
    expect(consume).toHaveBeenCalledWith(
      expect.stringMatching(/^api:/),
      10,
      60_000,
    )
  })

  it('uses forwarded addresses and blocks when the limit is exhausted', async () => {
    const consume = vi.fn(async () => ({
      allowed: false,
      limit: 1,
      remaining: 0,
      resetAt: 9999,
    }))
    __setRateLimitStoreForTests({ consume })

    const middleware = createRateLimitMiddleware({
      bucket: 'auth',
      limit: 1,
      windowMs: 60_000,
    })
    const response = {
      json: vi.fn(),
      setHeader: vi.fn(),
      status: vi.fn(() => response),
    }

    await middleware(
      {
        header: () => '203.0.113.11, 10.0.0.1',
        ip: '127.0.0.1',
      } as never,
      response as never,
      vi.fn(),
    )

    expect(response.status).toHaveBeenCalledWith(429)
    expect(response.json).toHaveBeenCalledWith({ message: 'Rate limit exceeded.' })
    expect(consume).toHaveBeenCalledWith('auth:203.0.113.11', 1, 60_000)
  })

  it('passes backend errors to the express error chain', async () => {
    const consume = vi.fn(async () => {
      throw new Error('rate limiter offline')
    })
    __setRateLimitStoreForTests({ consume })

    const middleware = createRateLimitMiddleware({
      bucket: 'api',
      limit: 10,
      windowMs: 60_000,
    })
    const next = vi.fn()

    await middleware(
      {
        header: () => undefined,
        ip: '127.0.0.1',
      } as never,
      {
        json: vi.fn(),
        setHeader: vi.fn(),
        status: vi.fn(),
      } as never,
      next,
    )

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'rate limiter offline',
      }),
    )
  })

  it('falls back to anonymous keys for malformed forwarded headers and missing ips', async () => {
    const consume = vi.fn(async () => ({
      allowed: true,
      limit: 5,
      remaining: 4,
      resetAt: 1111,
    }))
    __setRateLimitStoreForTests({ consume })

    const middleware = createRateLimitMiddleware({
      bucket: 'api',
      limit: 5,
      windowMs: 60_000,
    })
    const response = {
      json: vi.fn(),
      setHeader: vi.fn(),
      status: vi.fn(() => response),
    }

    await new Promise<void>((resolve, reject) => {
      middleware(
        {
          header: () =>
            ({
              split: () => [],
            }) as unknown as string,
          ip: '127.0.0.1',
        } as never,
        response as never,
        (error?: unknown) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        },
      )
    })

    await new Promise<void>((resolve, reject) => {
      middleware(
        {
          header: () => undefined,
          ip: undefined,
        } as never,
        response as never,
        (error?: unknown) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        },
      )
    })

    expect(consume).toHaveBeenNthCalledWith(1, 'api:anonymous', 5, 60_000)
    expect(consume).toHaveBeenNthCalledWith(2, 'api:anonymous', 5, 60_000)
  })
})
