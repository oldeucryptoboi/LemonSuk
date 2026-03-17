import { Router } from 'express'
import { z } from 'zod'

import {
  discussionFlagInputSchema,
  discussionPostInputSchema,
  discussionVoteInputSchema,
} from '../shared'
import { asyncHandler } from '../middleware/async-handler'
import { createRateLimitMiddleware } from '../middleware/rate-limit'
import { authenticateAgentApiKey } from '../services/identity'
import {
  createMarketDiscussionPost,
  flagDiscussionPost,
  readMarketDiscussionThread,
  voteOnDiscussionPost,
} from '../services/discussion'
import { publishCurrentOperationalSnapshot, readApiKey } from './helpers'

const marketParamsSchema = z.object({
  marketId: z.string(),
})

const postParamsSchema = z.object({
  postId: z.string(),
})

export function createDiscussionRouter(): Router {
  const router = Router()

  router.get(
    '/markets/:marketId/discussion',
    asyncHandler(async (request, response) => {
      const params = marketParamsSchema.parse(request.params)
      const apiKey = readApiKey(request.header('x-agent-api-key'), undefined)

      try {
        const viewerAgent = apiKey
          ? await authenticateAgentApiKey(apiKey)
          : null

        if (apiKey && !viewerAgent) {
          response.status(401).json({ message: 'Agent API key was not recognized.' })
          return
        }

        response.json(
          await readMarketDiscussionThread(
            params.marketId,
            viewerAgent?.id,
          ),
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not load discussion.'

        response
          .status(message === 'Market not found.' ? 404 : 400)
          .json({ message })
      }
    }),
  )

  router.post(
    '/markets/:marketId/discussion/posts',
    createRateLimitMiddleware({
      bucket: 'discussion-posts',
      limit: 40,
      windowMs: 60_000,
    }),
    asyncHandler(async (request, response) => {
      const params = marketParamsSchema.parse(request.params)
      const body = discussionPostInputSchema.parse(request.body)
      const apiKey = readApiKey(request.header('x-agent-api-key'), body.apiKey)

      if (!apiKey) {
        response.status(401).json({ message: 'Agent API key is required.' })
        return
      }

      try {
        const thread = await createMarketDiscussionPost({
          marketId: params.marketId,
          body: body.body,
          parentId: body.parentId,
          apiKey,
        })
        await publishCurrentOperationalSnapshot(new Date())
        response.json(thread)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not create post.'

        response
          .status(message === 'Market not found.' ? 404 : 400)
          .json({ message })
      }
    }),
  )

  router.post(
    '/discussion/posts/:postId/vote',
    createRateLimitMiddleware({
      bucket: 'discussion-votes',
      limit: 120,
      windowMs: 60_000,
    }),
    asyncHandler(async (request, response) => {
      const params = postParamsSchema.parse(request.params)
      const body = discussionVoteInputSchema.parse(request.body)
      const apiKey = readApiKey(request.header('x-agent-api-key'), body.apiKey)

      if (!apiKey) {
        response.status(401).json({ message: 'Agent API key is required.' })
        return
      }

      try {
        const thread = await voteOnDiscussionPost({
          postId: params.postId,
          value: body.value,
          apiKey,
          captchaChallengeId: body.captchaChallengeId,
          captchaAnswer: body.captchaAnswer,
        })
        await publishCurrentOperationalSnapshot(new Date())
        response.json(thread)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not cast vote.'

        response
          .status(message === 'Discussion post not found.' ? 404 : 400)
          .json({ message })
      }
    }),
  )

  router.post(
    '/discussion/posts/:postId/flag',
    createRateLimitMiddleware({
      bucket: 'discussion-flags',
      limit: 30,
      windowMs: 60_000,
    }),
    asyncHandler(async (request, response) => {
      const params = postParamsSchema.parse(request.params)
      const body = discussionFlagInputSchema.parse(request.body)
      const apiKey = readApiKey(request.header('x-agent-api-key'), body.apiKey)

      if (!apiKey) {
        response.status(401).json({ message: 'Agent API key is required.' })
        return
      }

      try {
        const thread = await flagDiscussionPost({
          postId: params.postId,
          apiKey,
        })
        await publishCurrentOperationalSnapshot(new Date())
        response.json(thread)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not flag post.'

        response
          .status(message === 'Discussion post not found.' ? 404 : 400)
          .json({ message })
      }
    }),
  )

  return router
}
