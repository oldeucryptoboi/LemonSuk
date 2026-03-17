import { Router } from 'express'
import { z } from 'zod'

import {
  internalPredictionSubmissionReviewResultInputSchema,
  internalPredictionSubmissionStatusInputSchema,
} from '../shared'
import { apiConfig } from '../config'
import { asyncHandler } from '../middleware/async-handler'
import {
  applyPredictionReviewResultForInternal,
  readPredictionSubmissionForInternal,
  updatePredictionSubmissionStatusForInternal,
} from '../services/review-workflow'
import { publishCurrentOperationalSnapshot } from './helpers'

const paramsSchema = z.object({
  submissionId: z.string(),
})

function authorizeInternalRequest(
  authorizationHeader: string | undefined,
): boolean {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return false
  }

  const token = authorizationHeader.slice('Bearer '.length).trim()
  return token === apiConfig.internalServiceToken
}

export function createInternalRouter(): Router {
  const router = Router()

  router.use('/internal', (request, response, next) => {
    if (authorizeInternalRequest(request.header('authorization'))) {
      next()
      return
    }

    response.status(401).json({ message: 'Internal service token is required.' })
  })

  router.get(
    '/internal/prediction-submissions/:submissionId',
    asyncHandler(async (request, response) => {
      const params = paramsSchema.parse(request.params)
      const submission = await readPredictionSubmissionForInternal(
        params.submissionId,
      )

      if (!submission) {
        response.status(404).json({ message: 'Prediction submission not found.' })
        return
      }

      response.json(submission)
    }),
  )

  router.post(
    '/internal/prediction-submissions/:submissionId/status',
    asyncHandler(async (request, response) => {
      const params = paramsSchema.parse(request.params)
      const body = internalPredictionSubmissionStatusInputSchema.parse(
        request.body,
      )

      try {
        const submission = await updatePredictionSubmissionStatusForInternal(
          params.submissionId,
          body,
        )
        await publishCurrentOperationalSnapshot(new Date())
        response.json(submission)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not update submission status.'
        response
          .status(message === 'Prediction submission not found.' ? 404 : 400)
          .json({ message })
      }
    }),
  )

  router.post(
    '/internal/prediction-submissions/:submissionId/review-result',
    asyncHandler(async (request, response) => {
      const params = paramsSchema.parse(request.params)
      const body = internalPredictionSubmissionReviewResultInputSchema.parse(
        request.body,
      )

      try {
        const result = await applyPredictionReviewResultForInternal(
          params.submissionId,
          body,
        )
        await publishCurrentOperationalSnapshot(new Date())
        response.json(result)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not apply prediction review result.'
        response
          .status(message === 'Prediction submission not found.' ? 404 : 400)
          .json({ message })
      }
    }),
  )

  return router
}
