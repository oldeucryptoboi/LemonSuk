import { Router } from 'express'
import { z } from 'zod'

import {
  claudeReviewAgentClaimNextInputSchema,
  claudeReviewAgentCompleteRunInputSchema,
  claudeReviewAgentFailRunInputSchema,
  claudeReviewAgentRunEventInputSchema,
  internalPredictionSubmissionReviewResultInputSchema,
  internalPredictionSubmissionStatusInputSchema,
} from '../shared'
import { apiConfig } from '../config'
import { asyncHandler } from '../middleware/async-handler'
import {
  appendClaudeReviewAgentRunEvent,
  claimNextPredictionLeadForClaudeReviewAgent,
  completeClaudeReviewAgentRun,
  failClaudeReviewAgentRun,
  readRecentClaudeReviewAgentRuns,
} from '../services/claude-review-agent'
import {
  applyPredictionLeadReviewResultForInternal,
  readPredictionLeadInspectionForInternal,
  readPredictionLeadForInternal,
  updatePredictionLeadStatusForInternal,
} from '../services/lead-review-workflow'
import { readPendingPredictionLeads } from '../services/lead-intake'
import { publishCurrentOperationalSnapshot } from './helpers'

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
    '/internal/leads',
    asyncHandler(async (request, response) => {
      const query = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).optional(),
          leadType: z
            .enum([
              'structured_agent_lead',
              'human_url_lead',
              'system_discovery_lead',
            ])
            .optional(),
          familySlug: z
            .enum([
              'ai_launch',
              'product_ship_date',
              'earnings_guidance',
              'policy_promise',
              'ceo_claim',
            ])
            .optional(),
          entitySlug: z.string().min(1).optional(),
          sourceDomain: z.string().min(1).optional(),
        })
        .parse(request.query)

      response.json(await readPendingPredictionLeads(query))
    }),
  )

  router.get(
    '/internal/leads/:leadId',
    asyncHandler(async (request, response) => {
      const params = z
        .object({
          leadId: z.string(),
        })
        .parse(request.params)
      const lead = await readPredictionLeadForInternal(params.leadId)

      if (!lead) {
        response.status(404).json({ message: 'Prediction lead not found.' })
        return
      }

      response.json(lead)
    }),
  )

  router.get(
    '/internal/leads/:leadId/inspect',
    asyncHandler(async (request, response) => {
      const params = z
        .object({
          leadId: z.string(),
        })
        .parse(request.params)
      const detail = await readPredictionLeadInspectionForInternal(params.leadId)

      if (!detail) {
        response.status(404).json({ message: 'Prediction lead not found.' })
        return
      }

      response.json(detail)
    }),
  )

  router.post(
    '/internal/claude-review-agent/claim-next',
    asyncHandler(async (request, response) => {
      const body = claudeReviewAgentClaimNextInputSchema.parse(request.body)
      response.json(await claimNextPredictionLeadForClaudeReviewAgent(body))
    }),
  )

  router.get(
    '/internal/claude-review-agent/runs',
    asyncHandler(async (request, response) => {
      const query = z
        .object({
          limit: z.coerce.number().int().min(1).max(50).optional(),
        })
        .parse(request.query)

      response.json(await readRecentClaudeReviewAgentRuns(query.limit ?? 8))
    }),
  )

  router.post(
    '/internal/claude-review-agent/runs/:runId/events',
    asyncHandler(async (request, response) => {
      const params = z
        .object({
          runId: z.string(),
        })
        .parse(request.params)
      const body = claudeReviewAgentRunEventInputSchema.parse(request.body)

      try {
        response.json(await appendClaudeReviewAgentRunEvent(params.runId, body))
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not append Claude review run event.'
        response
          .status(message === 'Claude review run not found.' ? 404 : 400)
          .json({ message })
      }
    }),
  )

  router.post(
    '/internal/claude-review-agent/runs/:runId/complete',
    asyncHandler(async (request, response) => {
      const params = z
        .object({
          runId: z.string(),
        })
        .parse(request.params)
      const body = claudeReviewAgentCompleteRunInputSchema.parse(request.body)

      try {
        response.json(await completeClaudeReviewAgentRun(params.runId, body))
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not complete Claude review run.'
        response
          .status(message === 'Claude review run not found.' ? 404 : 400)
          .json({ message })
      }
    }),
  )

  router.post(
    '/internal/claude-review-agent/runs/:runId/fail',
    asyncHandler(async (request, response) => {
      const params = z
        .object({
          runId: z.string(),
        })
        .parse(request.params)
      const body = claudeReviewAgentFailRunInputSchema.parse(request.body)

      try {
        response.json(await failClaudeReviewAgentRun(params.runId, body))
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not fail Claude review run.'
        response
          .status(message === 'Claude review run not found.' ? 404 : 400)
          .json({ message })
      }
    }),
  )

  router.post(
    '/internal/leads/:leadId/status',
    asyncHandler(async (request, response) => {
      const params = z
        .object({
          leadId: z.string(),
        })
        .parse(request.params)
      const body = internalPredictionSubmissionStatusInputSchema.parse(
        request.body,
      )

      try {
        const lead = await updatePredictionLeadStatusForInternal(
          params.leadId,
          body,
        )
        await publishCurrentOperationalSnapshot(new Date())
        response.json(lead)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not update lead status.'
        response
          .status(message === 'Prediction lead not found.' ? 404 : 400)
          .json({ message })
      }
    }),
  )

  router.post(
    '/internal/leads/:leadId/review-result',
    asyncHandler(async (request, response) => {
      const params = z
        .object({
          leadId: z.string(),
        })
        .parse(request.params)
      const body = internalPredictionSubmissionReviewResultInputSchema.parse(
        request.body,
      )

      try {
        const result = await applyPredictionLeadReviewResultForInternal(
          params.leadId,
          body,
        )
        await publishCurrentOperationalSnapshot(new Date())
        response.json(result)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not apply prediction lead review result.'
        response
          .status(message === 'Prediction lead not found.' ? 404 : 400)
          .json({ message })
      }
    }),
  )

  return router
}
