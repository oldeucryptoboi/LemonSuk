import { Router } from 'express'
import { z } from 'zod'

import {
  agentPredictionSubmissionInputSchema,
  agentRegistrationInputSchema,
  claimOwnerInputSchema,
  ownerEmailSetupInputSchema,
  ownerLoginLinkRequestSchema,
} from '../shared'
import { reconcileCandidates } from '../agent/reconcile'
import { asyncHandler } from '../middleware/async-handler'
import { createRateLimitMiddleware } from '../middleware/rate-limit'
import { placeAgainstBetForUser } from '../services/betting'
import { buildCandidateFromAgentSubmission } from '../services/agent-predictions'
import { runMaintenance } from '../services/maintenance'
import { debitAgentCredits } from '../services/wallet'
import {
  authenticateAgentApiKey,
  claimOwnerByClaimToken,
  createCaptchaChallenge,
  createOwnerLoginLink,
  readAgentProfileByIdFromClient,
  readCaptchaChallenge,
  readClaimView,
  readOwnerSession,
  registerAgent,
  setupOwnerEmail,
} from '../services/identity'
import { withStoreTransaction } from '../services/store'
import {
  createOperationalSnapshot,
  dispatchOwnerLoginLink,
  publishCurrentOperationalSnapshot,
  publishOperationalSnapshot,
  readApiKey,
} from './helpers'

const apiKeyBodySchema = z.object({
  apiKey: z.string().min(12).optional(),
})

const agentBetSchema = z.object({
  apiKey: z.string().min(12).optional(),
  marketId: z.string(),
  stakeCredits: z.number().positive().max(10000),
})
const agentPredictionSchema = agentPredictionSubmissionInputSchema.extend({
  apiKey: z.string().min(12).optional(),
})

function readApiKeyFromBody(body: unknown): string | undefined {
  if (
    typeof body === 'object' &&
    body !== null &&
    'apiKey' in body &&
    typeof body.apiKey === 'string'
  ) {
    return body.apiKey
  }

  return undefined
}

export function createAuthRouter(): Router {
  const router = Router()

  router.get(
    '/captcha',
    asyncHandler(async (_request, response) => {
      response.json(await createCaptchaChallenge())
    }),
  )

  router.get(
    '/captcha/:challengeId',
    asyncHandler(async (request, response) => {
      const params = z
        .object({
          challengeId: z.string(),
        })
        .parse(request.params)
      const challenge = await readCaptchaChallenge(params.challengeId)

      if (!challenge) {
        response.status(404).json({ message: 'Captcha challenge not found.' })
        return
      }

      response.json(challenge)
    }),
  )

  router.post(
    '/agents/register',
    createRateLimitMiddleware({
      bucket: 'agent-register',
      limit: 12,
      windowMs: 60 * 60 * 1_000,
    }),
    asyncHandler(async (request, response) => {
      const input = agentRegistrationInputSchema.parse(request.body)

      try {
        const registration = await registerAgent(input)
        await publishCurrentOperationalSnapshot(new Date())
        response.json(registration)
      } catch (error) {
        response.status(400).json({
          message:
            error instanceof Error
              ? error.message
              : 'Agent registration failed.',
        })
      }
    }),
  )

  router.get(
    '/claims/:claimToken',
    asyncHandler(async (request, response) => {
      const params = z
        .object({
          claimToken: z.string(),
        })
        .parse(request.params)
      const claimView = await readClaimView(params.claimToken)

      if (!claimView) {
        response.status(404).json({ message: 'Claim not found.' })
        return
      }

      response.json(claimView)
    }),
  )

  router.post(
    '/claims/:claimToken/owner',
    createRateLimitMiddleware({
      bucket: 'claim-owner',
      limit: 20,
      windowMs: 60 * 60 * 1_000,
    }),
    asyncHandler(async (request, response) => {
      const params = z
        .object({
          claimToken: z.string(),
        })
        .parse(request.params)
      const body = claimOwnerInputSchema.parse(request.body)

      try {
        const loginLink = await claimOwnerByClaimToken(
          params.claimToken,
          body.ownerEmail,
        )
        await dispatchOwnerLoginLink(loginLink)
        await publishCurrentOperationalSnapshot(new Date())
        response.json(loginLink)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not claim this agent.'
        response
          .status(message === 'Claim not found.' ? 404 : 400)
          .json({ message })
      }
    }),
  )

  router.post(
    '/agents/setup-owner-email',
    createRateLimitMiddleware({
      bucket: 'owner-email-attach',
      limit: 20,
      windowMs: 60 * 60 * 1_000,
    }),
    asyncHandler(async (request, response) => {
      const body = ownerEmailSetupInputSchema
        .merge(apiKeyBodySchema)
        .parse(request.body)
      const apiKey = readApiKey(request.header('x-agent-api-key'), body.apiKey)

      if (!apiKey) {
        response.status(401).json({ message: 'Agent API key is required.' })
        return
      }

      try {
        const result = await setupOwnerEmail(apiKey, body.ownerEmail)
        response.json(result)
      } catch (error) {
        response.status(400).json({
          message:
            error instanceof Error
              ? error.message
              : 'Could not set owner email.',
        })
      }
    }),
  )

  router.post(
    '/owners/login-link',
    createRateLimitMiddleware({
      bucket: 'owner-login-link',
      limit: 20,
      windowMs: 60 * 60 * 1_000,
    }),
    asyncHandler(async (request, response) => {
      const body = ownerLoginLinkRequestSchema.parse(request.body)

      try {
        const loginLink = await createOwnerLoginLink(body.ownerEmail)
        await dispatchOwnerLoginLink(loginLink)
        response.json(loginLink)
      } catch (error) {
        response.status(400).json({
          message:
            error instanceof Error
              ? error.message
              : 'Could not create login link.',
        })
      }
    }),
  )

  router.get(
    '/owners/sessions/:sessionToken',
    asyncHandler(async (request, response) => {
      const params = z
        .object({
          sessionToken: z.string(),
        })
        .parse(request.params)
      const session = await readOwnerSession(params.sessionToken)

      if (!session) {
        response.status(404).json({ message: 'Owner session not found.' })
        return
      }

      response.json(session)
    }),
  )

  router.post(
    '/agents/predictions',
    createRateLimitMiddleware({
      bucket: 'agent-predictions',
      limit: 24,
      windowMs: 60_000,
      key: (request) =>
        readApiKey(
          request.header('x-agent-api-key'),
          readApiKeyFromBody(request.body),
        ) ??
        request.ip ??
        'anonymous',
    }),
    asyncHandler(async (request, response) => {
      const body = agentPredictionSchema.parse(request.body)
      const apiKey = readApiKey(request.header('x-agent-api-key'), body.apiKey)

      if (!apiKey) {
        response.status(401).json({ message: 'Agent API key is required.' })
        return
      }

      const agent = await authenticateAgentApiKey(apiKey)
      if (!agent) {
        response.status(401).json({ message: 'Agent API key is invalid.' })
        return
      }

      const now = new Date()
      const payload = await withStoreTransaction(async (store, persist, client) => {
        const candidate = buildCandidateFromAgentSubmission(agent, body)
        const reconciled = reconcileCandidates(store, [candidate], now.toISOString())
        // Reconcile always returns one created or updated market for a valid agent submission.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        const marketId = [
          ...reconciled.createdMarketIds,
          ...reconciled.updatedMarketIds,
        ][0]!
        const created = reconciled.createdMarketIds.includes(marketId)

        const savedStore = await persist(reconciled.store)
        // Persisted reconciliation keeps the target market in the saved store.
        const market = savedStore.markets.find((entry) => entry.id === marketId)!

        return {
          created,
          market,
          snapshot: await createOperationalSnapshot(savedStore, now, client),
        }
      })

      if (payload) {
        publishOperationalSnapshot(payload.snapshot)
        response.json(payload)
      }
    }),
  )

  router.post(
    '/agents/bets',
    createRateLimitMiddleware({
      bucket: 'agent-bets',
      limit: 60,
      windowMs: 60_000,
      key: (request) =>
        readApiKey(
          request.header('x-agent-api-key'),
          readApiKeyFromBody(request.body),
        ) ??
        request.ip ??
        'anonymous',
    }),
    asyncHandler(async (request, response) => {
      const body = agentBetSchema.parse(request.body)
      const apiKey = readApiKey(request.header('x-agent-api-key'), body.apiKey)

      if (!apiKey) {
        response.status(401).json({ message: 'Agent API key is required.' })
        return
      }

      const agent = await authenticateAgentApiKey(apiKey)
      if (!agent) {
        response.status(401).json({ message: 'Agent API key is invalid.' })
        return
      }

      const now = new Date()
      try {
        const payload = await withStoreTransaction(
          async (store, persist, client) => {
            const maintenance = runMaintenance(store, now)
            const readyStore = maintenance.changed
              ? await persist(maintenance.store)
              : store
            const result = placeAgainstBetForUser(
              readyStore,
              agent.id,
              body.marketId,
              body.stakeCredits,
              now,
            )
            const wallet = await debitAgentCredits(
              client,
              agent.id,
              body.stakeCredits,
            )
            const savedStore = await persist(result.store)
            const refreshedAgent =
              (await readAgentProfileByIdFromClient(client, agent.id)) ?? {
                ...agent,
                ...wallet,
              }

            return {
              agent: refreshedAgent,
              bet: result.bet,
              snapshot: await createOperationalSnapshot(
                savedStore,
                now,
                client,
              ),
            }
          },
        )
        publishOperationalSnapshot(payload.snapshot)
        response.json(payload)
      } catch (error) {
        response.status(400).json({
          message:
            error instanceof Error
              ? error.message
              : 'This market is closed.',
        })
      }
    }),
  )

  return router
}
