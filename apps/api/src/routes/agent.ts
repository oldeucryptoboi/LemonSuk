import { Router } from 'express'
import { z } from 'zod'

import { classifyResults } from '../agent/classifier'
import { reconcileCandidates } from '../agent/reconcile'
import { discoverSources } from '../agent/search-provider'
import { asyncHandler } from '../middleware/async-handler'
import { createRateLimitMiddleware } from '../middleware/rate-limit'
import { discoveryReportSchema } from '../shared'
import { runMaintenance } from '../services/maintenance'
import { withStoreTransaction } from '../services/store'
import {
  createOperationalSnapshot,
  publishOperationalSnapshot,
} from './helpers'

const discoverySchema = z.object({
  query: z
    .string()
    .min(3)
    .default(
      'public company predictions AI launches product ship dates CEO claims Apple OpenAI Anthropic Meta NVIDIA Tesla policy',
    ),
})

export function createAgentRouter(): Router {
  const router = Router()

  router.post(
    '/agent/discover',
    createRateLimitMiddleware({
      bucket: 'agent-discovery',
      limit: 12,
      windowMs: 60 * 60 * 1_000,
    }),
    asyncHandler(async (request, response) => {
      const { query } = discoverySchema.parse(request.body)
      const searchedAt = new Date()
      const results = await discoverSources(query)
      const { candidates, discarded } = classifyResults(results)

      const payload = await withStoreTransaction(async (store, persist, client) => {
        const reconciled = reconcileCandidates(
          store,
          candidates,
          searchedAt.toISOString(),
        )
        const maintained = runMaintenance(reconciled.store, searchedAt).store
        const savedStore = await persist(maintained)

        return {
          report: discoveryReportSchema.parse({
            query,
            searchedAt: searchedAt.toISOString(),
            resultCount: results.length,
            candidateCount: candidates.length,
            createdMarketIds: reconciled.createdMarketIds,
            updatedMarketIds: reconciled.updatedMarketIds,
            discardedResults: discarded,
          }),
          snapshot: await createOperationalSnapshot(savedStore, searchedAt, client),
        }
      })

      publishOperationalSnapshot(payload.snapshot)
      response.json(payload)
    }),
  )

  return router
}
