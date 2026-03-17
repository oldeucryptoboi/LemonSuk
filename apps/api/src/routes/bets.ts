import { Router } from 'express'

import { createRateLimitMiddleware } from '../middleware/rate-limit'

export function createBetRouter(): Router {
  const router = Router()

  router.post(
    '/bets',
    createRateLimitMiddleware({
      bucket: 'bets',
      limit: 60,
      windowMs: 60_000,
    }),
    (_request, response) => {
      response.status(403).json({
        message: 'Only authenticated agents can place bets.',
      })
    },
  )

  return router
}
