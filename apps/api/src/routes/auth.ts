import { Router } from 'express'
import { z } from 'zod'

import {
  agentProfileUpdateInputSchema,
  agentPredictionSubmissionInputSchema,
  agentRegistrationInputSchema,
  claimOwnerInputSchema,
  claimOwnerTweetVerificationInputSchema,
  ownerEmailSetupInputSchema,
  ownerLoginLinkRequestSchema,
  betSideSchema,
} from '../shared'
import { apiConfig } from '../config'
import { asyncHandler } from '../middleware/async-handler'
import { createRateLimitMiddleware } from '../middleware/rate-limit'
import { placeBetForUser } from '../services/betting'
import { runMaintenance } from '../services/maintenance'
import { enqueuePredictionSubmission } from '../services/submission-queue'
import { debitAgentCredits } from '../services/wallet'
import {
  authenticateAgentApiKey,
  authenticateOwnerSession,
  claimOwnerByClaimToken,
  completeOwnerClaimXConnection,
  createCaptchaChallenge,
  createClaimOwnerEmailVerificationLink,
  createOwnerClaimXConnectUrl,
  createOwnerLoginLink,
  verifyClaimOwnerEmail,
  readAgentProfileByIdFromClient,
  readCaptchaChallenge,
  readClaimView,
  readOwnerSession,
  registerAgent,
  setupOwnerEmail,
  updateAgentProfile,
  verifyOwnerByClaimTweet,
} from '../services/identity'
import { withStoreTransaction } from '../services/store'
import {
  createOperationalSnapshot,
  dispatchClaimOwnerEmailVerification,
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
  side: betSideSchema.optional(),
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
  const appUrl = new URL(apiConfig.appUrl)

  function buildAppRedirect(searchParams: Record<string, string>): string {
    const nextUrl = new URL(appUrl.toString())
    for (const [key, value] of Object.entries(searchParams)) {
      nextUrl.searchParams.set(key, value)
    }
    return nextUrl.toString()
  }

  router.get(
    '/captcha',
    createRateLimitMiddleware({
      bucket: 'captcha-create',
      limit: 30,
      windowMs: 60_000,
    }),
    asyncHandler(async (_request, response) => {
      response.json(await createCaptchaChallenge())
    }),
  )

  router.get(
    '/captcha/:challengeId',
    createRateLimitMiddleware({
      bucket: 'captcha-read',
      limit: 60,
      windowMs: 60_000,
    }),
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
        const claimView = await claimOwnerByClaimToken(
          params.claimToken,
          body.ownerEmail,
        )
        if (claimView.agent.ownerVerificationStatus === 'pending_email') {
          await dispatchClaimOwnerEmailVerification(
            await createClaimOwnerEmailVerificationLink(params.claimToken),
          )
        }
        await publishCurrentOperationalSnapshot(new Date())
        response.json(claimView)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not claim this agent.'
        response
          .status(message === 'Claim not found.' ? 404 : 400)
          .json({ message })
      }
    }),
  )

  router.get(
    '/claim-email/verify',
    asyncHandler(async (request, response) => {
      const query = z
        .object({
          token: z.string().optional(),
        })
        .parse(request.query)

      if (!query.token) {
        response.redirect(
          buildAppRedirect({
            email_error: 'missing_email_verification_token',
          }),
        )
        return
      }

      try {
        const result = await verifyClaimOwnerEmail(query.token)
        response.redirect(
          buildAppRedirect({
            claim: result.claimToken,
            email_verified: '1',
          }),
        )
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not verify that owner email.'
        response.redirect(
          buildAppRedirect({
            email_error: message,
          }),
        )
      }
    }),
  )

  router.post(
    '/claims/:claimToken/verify-tweet',
    createRateLimitMiddleware({
      bucket: 'claim-owner-tweet',
      limit: 20,
      windowMs: 60 * 60 * 1_000,
    }),
    asyncHandler(async (request, response) => {
      const params = z
        .object({
          claimToken: z.string(),
        })
        .parse(request.params)
      const body = claimOwnerTweetVerificationInputSchema.parse(request.body)

      try {
        const loginLink = await verifyOwnerByClaimTweet(params.claimToken, body)
        await dispatchOwnerLoginLink(loginLink)
        await publishCurrentOperationalSnapshot(new Date())
        response.json(loginLink)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not verify that X post.'

        response.status(400).json({ message })
      }
    }),
  )

  router.get(
    '/claims/:claimToken/connect-x',
    asyncHandler(async (request, response) => {
      const params = z
        .object({
          claimToken: z.string(),
        })
        .parse(request.params)

      try {
        const authorizeUrl = await createOwnerClaimXConnectUrl(params.claimToken)
        response.redirect(authorizeUrl)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not start X verification.'
        response.status(400).json({ message })
      }
    }),
  )

  router.get(
    '/x/callback',
    asyncHandler(async (request, response) => {
      const query = z
        .object({
          code: z.string().optional(),
          state: z.string().optional(),
          error: z.string().optional(),
          error_description: z.string().optional(),
        })
        .parse(request.query)

      if (!query.state) {
        response.redirect(
          buildAppRedirect({
            x_error: 'missing_state',
          }),
        )
        return
      }

      if (query.error) {
        response.redirect(
          buildAppRedirect({
            x_error: query.error_description ?? query.error,
          }),
        )
        return
      }

      if (!query.code) {
        response.redirect(
          buildAppRedirect({
            x_error: 'Missing X authorization code.',
          }),
        )
        return
      }

      try {
        const result = await completeOwnerClaimXConnection({
          state: query.state,
          code: query.code,
        })
        response.redirect(
          buildAppRedirect({
            claim: result.claimToken,
            x_connected: '1',
          }),
        )
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not connect that X account.'
        response.redirect(
          buildAppRedirect({
            x_error: message,
          }),
        )
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

  router.patch(
    '/agents/profile',
    createRateLimitMiddleware({
      bucket: 'agent-profile-update',
      limit: 30,
      windowMs: 60 * 60 * 1_000,
    }),
    asyncHandler(async (request, response) => {
      const body = agentProfileUpdateInputSchema
        .merge(apiKeyBodySchema)
        .parse(request.body)
      const apiKey = readApiKey(request.header('x-agent-api-key'), body.apiKey)

      if (!apiKey) {
        response.status(401).json({ message: 'Agent API key is required.' })
        return
      }

      try {
        const agent = await updateAgentProfile(apiKey, body)
        await publishCurrentOperationalSnapshot(new Date())
        response.json(agent)
      } catch (error) {
        response.status(400).json({
          message:
            error instanceof Error
              ? error.message
              : 'Could not update agent profile.',
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
        const message =
          error instanceof Error
            ? error.message
            : 'Could not create login link.'

        response.status(400).json({
          message,
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

      try {
        const payload = await enqueuePredictionSubmission(agent, body)
        await publishCurrentOperationalSnapshot(new Date())
        response.status(202).json(payload)
      } catch (error) {
        response.status(400).json({
          message:
            error instanceof Error
              ? error.message
              : 'Could not queue this claim packet.',
        })
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
            const result = placeBetForUser(
              readyStore,
              agent.id,
              body.marketId,
              body.stakeCredits,
              body.side ?? 'against',
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
