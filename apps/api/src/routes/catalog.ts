import { Router } from 'express'
import { z } from 'zod'

import { asyncHandler } from '../middleware/async-handler'
import { readEntities, readEventGroups, readPredictionFamilies } from '../services/catalog'
import {
  createBoardEventGroupSummaries,
  createBoardFamilySummaries,
  createEventGroupDetail,
  createMarketDetail,
} from '../services/board-read-model'
import { readOperationalSnapshot } from './helpers'

export function createCatalogRouter(): Router {
  const router = Router()

  router.get(
    '/families',
    asyncHandler(async (_request, response) => {
      const [snapshot, families, entities, groups] = await Promise.all([
        readOperationalSnapshot(new Date(), { deliverEmails: false }),
        readPredictionFamilies(),
        readEntities(),
        readEventGroups(),
      ])

      response.json(createBoardFamilySummaries(snapshot, { families, entities, groups }))
    }),
  )

  router.get(
    '/groups',
    asyncHandler(async (_request, response) => {
      const [snapshot, families, entities, groups] = await Promise.all([
        readOperationalSnapshot(new Date(), { deliverEmails: false }),
        readPredictionFamilies(),
        readEntities(),
        readEventGroups(),
      ])

      response.json(
        createBoardEventGroupSummaries(snapshot, { families, entities, groups }),
      )
    }),
  )

  router.get(
    '/groups/:groupSlug',
    asyncHandler(async (request, response) => {
      const { groupSlug } = z
        .object({
          groupSlug: z.string(),
        })
        .parse(request.params)
      const [snapshot, families, entities, groups] = await Promise.all([
        readOperationalSnapshot(new Date(), { deliverEmails: false }),
        readPredictionFamilies(),
        readEntities(),
        readEventGroups(),
      ])

      const detail = createEventGroupDetail(groupSlug, snapshot, {
        families,
        entities,
        groups,
      })

      if (!detail) {
        response.status(404).json({ message: 'Event group not found.' })
        return
      }

      response.json(detail)
    }),
  )

  router.get(
    '/markets/slug/:marketSlug',
    asyncHandler(async (request, response) => {
      const { marketSlug } = z
        .object({
          marketSlug: z.string(),
        })
        .parse(request.params)
      const [snapshot, families, entities, groups] = await Promise.all([
        readOperationalSnapshot(new Date(), { deliverEmails: false }),
        readPredictionFamilies(),
        readEntities(),
        readEventGroups(),
      ])

      const detail = createMarketDetail(marketSlug, snapshot, {
        families,
        entities,
        groups,
      })

      if (!detail) {
        response.status(404).json({ message: 'Market not found.' })
        return
      }

      response.json(detail)
    }),
  )

  return router
}
