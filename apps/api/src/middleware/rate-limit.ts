import type { Request, RequestHandler } from 'express'

import { consumeRateLimit } from '../services/rate-limit-store'

type RateLimitOptions = {
  bucket: string
  limit: number
  windowMs: number
  key?: (request: Request) => string
}

function defaultKey(request: Request): string {
  const forwardedFor = request.header('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() ?? 'anonymous'
  }

  return request.ip || 'anonymous'
}

export function createRateLimitMiddleware(
  options: RateLimitOptions,
): RequestHandler {
  return async (request, response, next) => {
    try {
      const actor = options.key?.(request) ?? defaultKey(request)
      const result = await consumeRateLimit(
        `${options.bucket}:${actor}`,
        options.limit,
        options.windowMs,
      )

      response.setHeader('X-RateLimit-Limit', String(result.limit))
      response.setHeader('X-RateLimit-Remaining', String(result.remaining))
      response.setHeader('X-RateLimit-Reset', String(result.resetAt))

      if (!result.allowed) {
        response.status(429).json({ message: 'Rate limit exceeded.' })
        return
      }

      next()
    } catch (error) {
      next(error)
    }
  }
}
