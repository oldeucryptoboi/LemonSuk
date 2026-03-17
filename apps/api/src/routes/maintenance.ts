import { Router } from 'express'

import { asyncHandler } from '../middleware/async-handler'
import { createOperationalSnapshot, publishOperationalSnapshot } from './helpers'
import { loadMaintainedStore } from '../services/maintenance'

export function createMaintenanceRouter(): Router {
  const router = Router()

  router.post(
    '/maintenance/run',
    asyncHandler(async (_request, response) => {
      const now = new Date()
      const store = await loadMaintainedStore(now)
      const snapshot = await createOperationalSnapshot(store, now)
      publishOperationalSnapshot(snapshot)
      response.json(snapshot)
    }),
  )

  return router
}
