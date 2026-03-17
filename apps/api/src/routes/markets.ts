import { Router } from 'express'
import { z } from 'zod'

import { marketResolutionInputSchema } from '../shared'
import { asyncHandler } from '../middleware/async-handler'
import { createRateLimitMiddleware } from '../middleware/rate-limit'
import { resolveMarket, runMaintenance } from '../services/maintenance'
import { withStoreTransaction } from '../services/store'
import {
  createOperationalSnapshot,
  publishOperationalSnapshot,
} from './helpers'

const marketParamsSchema = z.object({
  marketId: z.string(),
})

export function createMarketRouter(): Router {
  const router = Router()

  router.post(
    '/markets/:marketId/resolve',
    createRateLimitMiddleware({
      bucket: 'market-resolve',
      limit: 30,
      windowMs: 60 * 60 * 1_000,
    }),
    asyncHandler(async (request, response) => {
      const { marketId } = marketParamsSchema.parse(request.params)
      const payload = marketResolutionInputSchema.parse(request.body)
      const resolvedAt = payload.resolvedAt
        ? new Date(payload.resolvedAt)
        : new Date()

      const snapshot = await withStoreTransaction(async (store, persist, client) => {
        try {
          const resolved = resolveMarket(
            store,
            marketId,
            payload.resolution,
            payload.resolutionNotes,
            resolvedAt,
          )
          const maintained = runMaintenance(resolved.store, resolvedAt).store
          const savedStore = await persist(maintained)

          return createOperationalSnapshot(savedStore, resolvedAt, client)
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Could not resolve market.'
          const statusCode = message === 'Market not found.' ? 404 : 400

          response.status(statusCode).json({ message })
          return null
        }
      })

      if (snapshot) {
        publishOperationalSnapshot(snapshot)
        response.json(snapshot)
      }
    }),
  )

  return router
}
