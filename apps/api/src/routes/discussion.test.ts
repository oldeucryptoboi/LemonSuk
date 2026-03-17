import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

describe('createDiscussionRouter', () => {
  it('loads threads, creates posts, and casts votes', async () => {
    vi.resetModules()

    const authenticateAgentApiKey = vi.fn(async (apiKey: string) =>
      apiKey === 'lsk_live_123456'
        ? {
            id: 'agent-1',
          }
        : null,
    )
    const thread = {
      marketId: 'market-1',
      commentCount: 1,
      participantCount: 1,
      posts: [],
    }

    const readMarketDiscussionThread = vi.fn(async () => thread)
    const createMarketDiscussionPost = vi.fn(async () => thread)
    const voteOnDiscussionPost = vi.fn(async () => thread)
    const flagDiscussionPost = vi.fn(async () => thread)

    vi.doMock('../services/discussion', () => ({
      readMarketDiscussionThread,
      createMarketDiscussionPost,
      voteOnDiscussionPost,
      flagDiscussionPost,
    }))
    vi.doMock('../services/identity', () => ({
      authenticateAgentApiKey,
    }))
    vi.doMock('./helpers', () => ({
      publishCurrentOperationalSnapshot: vi.fn(async () => ({})),
      readApiKey: (headerValue: unknown, bodyValue: string | undefined) => {
        if (typeof headerValue === 'string') {
          return headerValue
        }

        return bodyValue ?? null
      },
    }))

    const { createDiscussionRouter } = await import('./discussion')
    const app = express()
    app.use(express.json())
    app.use('/api/v1', createDiscussionRouter())

    const getResponse = await request(app)
      .get('/api/v1/markets/market-1/discussion')
      .set('x-agent-api-key', 'lsk_live_123456')
    const postResponse = await request(app)
      .post('/api/v1/markets/market-1/discussion/posts')
      .set('x-agent-api-key', 'lsk_live_123456')
      .send({
        body: 'A thread opener',
      })
    const voteResponse = await request(app)
      .post('/api/v1/discussion/posts/post-1/vote')
      .set('x-agent-api-key', 'lsk_live_123456')
      .send({
        value: 'up',
        captchaChallengeId: 'captcha-1',
        captchaAnswer: 'hedge-deadline-9',
      })
    const flagResponse = await request(app)
      .post('/api/v1/discussion/posts/post-1/flag')
      .set('x-agent-api-key', 'lsk_live_123456')
      .send({})

    expect(getResponse.statusCode).toBe(200)
    expect(postResponse.statusCode).toBe(200)
    expect(voteResponse.statusCode).toBe(200)
    expect(flagResponse.statusCode).toBe(200)
    expect(readMarketDiscussionThread).toHaveBeenCalledWith('market-1', 'agent-1')
    expect(createMarketDiscussionPost).toHaveBeenCalledWith({
      marketId: 'market-1',
      body: 'A thread opener',
      parentId: undefined,
      apiKey: 'lsk_live_123456',
    })
    expect(voteOnDiscussionPost).toHaveBeenCalledWith({
      postId: 'post-1',
      value: 'up',
      apiKey: 'lsk_live_123456',
      captchaChallengeId: 'captcha-1',
      captchaAnswer: 'hedge-deadline-9',
    })
    expect(flagDiscussionPost).toHaveBeenCalledWith({
      postId: 'post-1',
      apiKey: 'lsk_live_123456',
    })
  })

  it('maps market and post errors to the expected HTTP status codes', async () => {
    vi.resetModules()

    const authenticateAgentApiKey = vi.fn(async (apiKey: string) =>
      apiKey === 'good-key'
        ? {
            id: 'agent-1',
          }
        : null,
    )
    vi.doMock('../services/discussion', () => ({
      readMarketDiscussionThread: vi.fn(async () => {
        throw new Error('Market not found.')
      }),
      createMarketDiscussionPost: vi.fn(async () => {
        throw 'post-failed'
      }),
      voteOnDiscussionPost: vi.fn(async () => {
        throw new Error('Discussion post not found.')
      }),
      flagDiscussionPost: vi.fn(async () => {
        throw new Error('Discussion post not found.')
      }),
    }))
    vi.doMock('../services/identity', () => ({
      authenticateAgentApiKey,
    }))
    vi.doMock('./helpers', () => ({
      publishCurrentOperationalSnapshot: vi.fn(async () => ({})),
      readApiKey: (headerValue: unknown, bodyValue: string | undefined) => {
        if (typeof headerValue === 'string') {
          return headerValue
        }

        return bodyValue ?? null
      },
    }))

    const { createDiscussionRouter } = await import('./discussion')
    const app = express()
    app.use(express.json())
    app.use('/api/v1', createDiscussionRouter())

    const getResponse = await request(app)
      .get('/api/v1/markets/missing/discussion')
      .set('x-agent-api-key', 'bad-key')
    const getMissingResponse = await request(app).get(
      '/api/v1/markets/missing/discussion',
    )
    const postUnauthorizedResponse = await request(app)
      .post('/api/v1/markets/market-1/discussion/posts')
      .send({
        body: 'post body',
      })
    const postResponse = await request(app)
      .post('/api/v1/markets/market-1/discussion/posts')
      .set('x-agent-api-key', 'good-key')
      .send({
        body: 'post body',
      })
    const voteUnauthorizedResponse = await request(app)
      .post('/api/v1/discussion/posts/missing/vote')
      .send({
        value: 'down',
        captchaChallengeId: 'captcha-1',
        captchaAnswer: 'wrong-answer',
      })
    const voteResponse = await request(app)
      .post('/api/v1/discussion/posts/missing/vote')
      .set('x-agent-api-key', 'good-key')
      .send({
        value: 'down',
        captchaChallengeId: 'captcha-1',
        captchaAnswer: 'wrong-answer',
      })
    const flagUnauthorizedResponse = await request(app)
      .post('/api/v1/discussion/posts/missing/flag')
      .send({})
    const flagResponse = await request(app)
      .post('/api/v1/discussion/posts/missing/flag')
      .set('x-agent-api-key', 'good-key')
      .send({})

    expect(getResponse.statusCode).toBe(401)
    expect(getResponse.body.message).toBe('Agent API key was not recognized.')
    expect(getMissingResponse.statusCode).toBe(404)
    expect(getMissingResponse.body.message).toBe('Market not found.')
    expect(postUnauthorizedResponse.statusCode).toBe(401)
    expect(postUnauthorizedResponse.body.message).toBe('Agent API key is required.')
    expect(postResponse.statusCode).toBe(400)
    expect(postResponse.body.message).toBe('Could not create post.')
    expect(voteUnauthorizedResponse.statusCode).toBe(401)
    expect(voteUnauthorizedResponse.body.message).toBe('Agent API key is required.')
    expect(voteResponse.statusCode).toBe(404)
    expect(voteResponse.body.message).toBe('Discussion post not found.')
    expect(flagUnauthorizedResponse.statusCode).toBe(401)
    expect(flagUnauthorizedResponse.body.message).toBe('Agent API key is required.')
    expect(flagResponse.statusCode).toBe(404)
    expect(flagResponse.body.message).toBe('Discussion post not found.')
  })

  it('uses fallback discussion error copy for non-Error failures', async () => {
    vi.resetModules()

    vi.doMock('../services/discussion', () => ({
      readMarketDiscussionThread: vi.fn(async () => {
        throw 'thread-failed'
      }),
      createMarketDiscussionPost: vi.fn(async () => {
        throw new Error('Market not found.')
      }),
      voteOnDiscussionPost: vi.fn(async () => {
        throw 'vote-failed'
      }),
      flagDiscussionPost: vi.fn(async () => {
        throw 'flag-failed'
      }),
    }))
    vi.doMock('../services/identity', () => ({
      authenticateAgentApiKey: vi.fn(async () => ({
        id: 'agent-1',
      })),
    }))
    vi.doMock('./helpers', () => ({
      publishCurrentOperationalSnapshot: vi.fn(async () => ({})),
      readApiKey: (headerValue: unknown, bodyValue: string | undefined) => {
        if (typeof headerValue === 'string') {
          return headerValue
        }

        return bodyValue ?? null
      },
    }))

    const { createDiscussionRouter } = await import('./discussion')
    const buildTestApp = () => {
      const app = express()
      app.use(express.json())
      app.use('/api/v1', createDiscussionRouter())
      return app
    }

    const getResponse = await request(buildTestApp()).get(
      '/api/v1/markets/missing/discussion',
    )
    const postResponse = await request(buildTestApp())
      .post('/api/v1/markets/missing/discussion/posts')
      .set('x-agent-api-key', 'lsk_live_123456')
      .send({
        body: 'post body',
      })
    const voteResponse = await request(buildTestApp())
      .post('/api/v1/discussion/posts/post-1/vote')
      .set('x-agent-api-key', 'lsk_live_123456')
      .send({
        value: 'up',
        captchaChallengeId: 'captcha-1',
        captchaAnswer: 'hedge-deadline-9',
      })
    const flagResponse = await request(buildTestApp())
      .post('/api/v1/discussion/posts/post-1/flag')
      .set('x-agent-api-key', 'lsk_live_123456')
      .send({})

    expect(getResponse.statusCode).toBe(400)
    expect(getResponse.body.message).toBe('Could not load discussion.')
    expect(postResponse.statusCode).toBe(404)
    expect(postResponse.body.message).toBe('Market not found.')
    expect(voteResponse.statusCode).toBe(400)
    expect(voteResponse.body.message).toBe('Could not cast vote.')
    expect(flagResponse.statusCode).toBe(400)
    expect(flagResponse.body.message).toBe('Could not flag post.')
  })
})
