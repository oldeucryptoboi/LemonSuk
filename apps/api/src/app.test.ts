import express from 'express'
import request from 'supertest'
import { ZodError } from 'zod'
import { describe, expect, it, vi } from 'vitest'

import { supportMarketId } from './shared'
import { createSeedStore } from './data/seed'
import { setupApiContext } from '../../../test/helpers/api-context'

function solveCaptcha(prompt: string): string {
  const match = prompt.match(/slug:\s+([a-z]+-[a-z]+)-(\d+)\+(\d+)\./i)

  if (!match) {
    throw new Error(`Could not solve captcha prompt: ${prompt}`)
  }

  return `${match[1]}-${Number(match[2]) + Number(match[3])}`
}

describe('app routes', () => {
  it('serves health, dashboard, agent auth, and maintenance flows', async () => {
    const context = await setupApiContext()
    const app = context.buildApp()

    expect((await request(app).get('/health')).body).toEqual({
      ok: true,
    })

    const dashboardResponse = await request(app).get('/api/v1/dashboard')
    expect(dashboardResponse.statusCode).toBe(200)
    expect(dashboardResponse.body.stats.totalMarkets).toBe(
      createSeedStore().markets.filter(
        (market) => market.id !== supportMarketId,
      ).length,
    )

    const closedBetResponse = await request(app).post('/api/v1/bets').send({
      marketId: 'robotaxi-million-2020',
      stakeCredits: 25,
    })
    expect(closedBetResponse.statusCode).toBe(403)
    expect(closedBetResponse.body).toEqual({
      message: 'Only authenticated agents can place bets.',
    })

    const missingResolution = await request(app)
      .post('/api/v1/markets/missing/resolve')
      .send({
        resolution: 'missed',
        resolutionNotes: 'Deadline slipped again.',
      })
    expect(missingResolution.statusCode).toBe(404)

    const resolvedMarketResponse = await request(app)
      .post('/api/v1/markets/cybercab-volume-2026/resolve')
      .send({
        resolution: 'delivered',
        resolutionNotes: 'Tesla shipped the feature before the deadline.',
      })
    expect(resolvedMarketResponse.statusCode).toBe(200)
    expect(resolvedMarketResponse.body.stats.resolvedMarkets).toBe(1)

    const captchaResponse = await request(app).get('/api/v1/auth/captcha')
    expect(captchaResponse.statusCode).toBe(200)
    const captcha = captchaResponse.body

    expect(
      (await request(app).get(`/api/v1/auth/captcha/${captcha.id}`)).body.id,
    ).toBe(captcha.id)
    expect(
      (await request(app).get('/api/v1/auth/captcha/missing')).statusCode,
    ).toBe(404)

    const invalidRegistration = await request(app)
      .post('/api/v1/auth/agents/register')
      .send({
        handle: 'deadlinebot',
        displayName: 'Deadline Bot',
        ownerName: 'Observer',
        modelProvider: 'OpenAI',
        biography:
          'Systematic agent that fades optimistic Musk timelines and writes counter-bets.',
        captchaChallengeId: 'missing',
        captchaAnswer: 'wrong',
      })
    expect(invalidRegistration.statusCode).toBe(400)
    expect(invalidRegistration.body.message).toBe(
      'Captcha challenge not found.',
    )

    const registrationResponse = await request(app)
      .post('/api/v1/auth/agents/register')
      .send({
        handle: 'deadlinebot',
        displayName: 'Deadline Bot',
        ownerName: 'Observer',
        modelProvider: 'OpenAI',
        biography:
          'Systematic agent that fades optimistic Musk timelines and writes counter-bets.',
        captchaChallengeId: captcha.id,
        captchaAnswer: solveCaptcha(captcha.prompt),
      })
    expect(registrationResponse.statusCode).toBe(200)
    const registration = registrationResponse.body
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')

    expect(
      (await request(app).get(`/api/v1/auth/claims/${claimToken}`)).body.agent
        .handle,
    ).toBe('deadlinebot')
    expect(
      (await request(app).get('/api/v1/auth/claims/missing')).statusCode,
    ).toBe(404)
    expect(
      (
        await request(app).post('/api/v1/auth/claims/missing/owner').send({
          ownerEmail: 'owner@example.com',
        })
      ).statusCode,
    ).toBe(404)

    const unverifiedAgentBetResponse = await request(app)
      .post('/api/v1/auth/agents/bets')
      .send({
        apiKey: registration.apiKey,
        marketId: 'optimus-customizable-2026',
        stakeCredits: 15,
      })
    expect(unverifiedAgentBetResponse.statusCode).toBe(400)
    expect(unverifiedAgentBetResponse.body.message).toBe(
      'Insufficient agent credits.',
    )

    const claimOwnerResponse = await request(app)
      .post(`/api/v1/auth/claims/${claimToken}/owner`)
      .send({
        ownerEmail: 'owner@example.com',
      })
    expect(claimOwnerResponse.statusCode).toBe(200)
    expect(claimOwnerResponse.body.ownerEmail).toBe('owner@example.com')

    expect(
      (
        await request(app).post('/api/v1/auth/agents/setup-owner-email').send({
          ownerEmail: 'owner@example.com',
        })
      ).statusCode,
    ).toBe(401)

    expect(
      (
        await request(app).post('/api/v1/auth/agents/setup-owner-email').send({
          apiKey: 'invalid-api-key',
          ownerEmail: 'owner@example.com',
        })
      ).statusCode,
    ).toBe(400)

    const ownerEmailResponse = await request(app)
      .post('/api/v1/auth/agents/setup-owner-email')
      .set('x-agent-api-key', registration.apiKey)
      .send({
        ownerEmail: 'owner@example.com',
      })
    expect(ownerEmailResponse.statusCode).toBe(200)
    expect(ownerEmailResponse.body.agent.ownerEmail).toBe('owner@example.com')

    expect(
      (
        await request(app).post('/api/v1/auth/owners/login-link').send({
          ownerEmail: 'missing@example.com',
        })
      ).statusCode,
    ).toBe(400)

    const loginLinkResponse = await request(app)
      .post('/api/v1/auth/owners/login-link')
      .send({
        ownerEmail: 'owner@example.com',
      })
    expect(loginLinkResponse.statusCode).toBe(200)
    const loginLink = loginLinkResponse.body

    expect(
      (
        await request(app).get(
          `/api/v1/auth/owners/sessions/${loginLink.sessionToken}`,
        )
      ).body.ownerEmail,
    ).toBe('owner@example.com')
    expect(
      (await request(app).get('/api/v1/auth/owners/sessions/missing'))
        .statusCode,
    ).toBe(404)

    expect(
      (
        await request(app).post('/api/v1/auth/agents/predictions').send({
          headline: 'Tesla ships a new Roadster by December 31, 2027',
          subject: 'Tesla Roadster',
          category: 'vehicle',
          promisedDate: '2027-12-31T23:59:59.000Z',
          summary:
            'Musk says Tesla will ship a new Roadster by the end of 2027.',
          sourceUrl: 'https://www.tesla.com/blog/future-roadster-update',
        })
      ).statusCode,
    ).toBe(401)
    expect(
      (
        await request(app).post('/api/v1/auth/agents/predictions').send({
          apiKey: 'invalid-api-key',
          headline: 'Tesla ships a new Roadster by December 31, 2027',
          subject: 'Tesla Roadster',
          category: 'vehicle',
          promisedDate: '2027-12-31T23:59:59.000Z',
          summary:
            'Musk says Tesla will ship a new Roadster by the end of 2027.',
          sourceUrl: 'https://www.tesla.com/blog/future-roadster-update',
        })
      ).statusCode,
    ).toBe(401)

    const predictionResponse = await request(app)
      .post('/api/v1/auth/agents/predictions')
      .send({
        apiKey: registration.apiKey,
        headline: 'Tesla ships a new Roadster by December 31, 2027',
        subject: 'Tesla Roadster',
        category: 'vehicle',
        promisedDate: '2027-12-31T23:59:59.000Z',
        summary: 'Musk says Tesla will ship a new Roadster by the end of 2027.',
        sourceUrl: 'https://www.tesla.com/blog/future-roadster-update',
        sourceLabel: 'Tesla Blog',
      })
    expect(predictionResponse.statusCode).toBe(202)
    expect(predictionResponse.body.queued).toBe(true)
    expect(predictionResponse.body.submission.headline).toBe(
      'Tesla ships a new Roadster by December 31, 2027',
    )
    expect(predictionResponse.body.submission.submittedBy.handle).toBe(
      'deadlinebot',
    )
    expect(predictionResponse.body.reviewHint).toContain('offline review')

    const queuedDashboardResponse = await request(app).get('/api/v1/dashboard')
    expect(queuedDashboardResponse.statusCode).toBe(200)
    expect(queuedDashboardResponse.body.submissionQueue).toBeUndefined()

    const reviewCaptchaResponse = await request(app).get('/api/v1/auth/captcha')
    const reviewCaptcha = reviewCaptchaResponse.body

    expect(
      (
        await request(app).post('/api/v1/auth/owners/review-submissions').send({
          sessionToken: loginLink.sessionToken,
          sourceUrl: 'https://example.com/musk-quote',
          note: 'Potential date-bound claim for offline review.',
          captchaChallengeId: reviewCaptcha.id,
          captchaAnswer: solveCaptcha(reviewCaptcha.prompt),
        })
      ).body,
    ).toEqual({
      queued: true,
      submissionId: expect.stringMatching(/^human_submission_/),
      sourceUrl: 'https://example.com/musk-quote',
      sourceDomain: 'example.com',
      submittedAt: expect.any(String),
      reviewHint: expect.stringContaining('offline review'),
    })
    const duplicateReviewCaptcha = (
      await request(app).get('/api/v1/auth/captcha')
    ).body
    expect(
      (
        await request(app).post('/api/v1/auth/owners/review-submissions').send({
          sessionToken: loginLink.sessionToken,
          sourceUrl: 'https://example.com/musk-quote',
          note: 'Potential date-bound claim for offline review.',
          captchaChallengeId: duplicateReviewCaptcha.id,
          captchaAnswer: solveCaptcha(duplicateReviewCaptcha.prompt),
        })
      ).body.message,
    ).toBe('That source is already queued for offline review.')

    expect(
      (
        await request(app).post('/api/v1/auth/owners/review-submissions').send({
          sessionToken: 'missing-owner-session',
          sourceUrl: 'https://example.com/missing-owner',
          note: 'This should not be accepted without a live owner session.',
          captchaChallengeId: duplicateReviewCaptcha.id,
          captchaAnswer: solveCaptcha(duplicateReviewCaptcha.prompt),
        })
      ).body.message,
    ).toBe('Owner session is required to submit review leads.')

    expect(
      (
        await request(app).post('/api/v1/auth/agents/bets').send({
          marketId: 'optimus-customizable-2026',
          stakeCredits: 15,
        })
      ).statusCode,
    ).toBe(401)
    expect(
      (
        await request(app).post('/api/v1/auth/agents/bets').send({
          apiKey: 'invalid-api-key',
          marketId: 'optimus-customizable-2026',
          stakeCredits: 15,
        })
      ).statusCode,
    ).toBe(401)

    const agentBetResponse = await request(app)
      .post('/api/v1/auth/agents/bets')
      .send({
        apiKey: registration.apiKey,
        marketId: 'optimus-customizable-2026',
        stakeCredits: 15,
      })
    expect(agentBetResponse.statusCode).toBe(200)
    expect(agentBetResponse.body.agent.handle).toBe('deadlinebot')
    expect(agentBetResponse.body.agent.availableCredits).toBe(25)
    expect(agentBetResponse.body.agent.promoCredits).toBe(25)
    expect(agentBetResponse.body.agent.earnedCredits).toBe(0)

    const closedAgentBetResponse = await request(app)
      .post('/api/v1/auth/agents/bets')
      .send({
        apiKey: registration.apiKey,
        marketId: 'robotaxi-million-2020',
        stakeCredits: 15,
      })
    expect(closedAgentBetResponse.statusCode).toBe(400)
    expect(closedAgentBetResponse.body.message).toBe('This market is closed.')

    const discoveryResponse = await request(app)
      .post('/api/v1/agent/discover')
      .send({
        query: 'musk deadlines',
      })
    expect(discoveryResponse.statusCode).toBe(200)
    expect(discoveryResponse.body.report.query).toBe('musk deadlines')

    const maintenanceResponse = await request(app).post(
      '/api/v1/maintenance/run',
    )
    expect(maintenanceResponse.statusCode).toBe(200)
    expect(maintenanceResponse.body.hallOfFame.length).toBeGreaterThanOrEqual(1)

    await context.pool.end()
  }, 10_000)

  it('surfaces zod and internal errors through the express error handler', async () => {
    const context = await setupApiContext({
      applyMocks: () => {
        vi.doMock('./services/maintenance', async () => {
          const actual = await vi.importActual<
            typeof import('./services/maintenance')
          >('./services/maintenance')

          return {
            ...actual,
            loadMaintainedStore: vi.fn(async () => {
              throw new Error('maintenance exploded')
            }),
          }
        })
      },
    })
    const app = context.buildApp()

    const invalidPayload = await request(app).post('/api/v1/bets').send({})
    expect(invalidPayload.statusCode).toBe(403)
    expect(invalidPayload.body).toEqual({
      message: 'Only authenticated agents can place bets.',
    })

    const failedDashboard = await request(app).get('/api/v1/dashboard')
    expect(failedDashboard.statusCode).toBe(500)
    expect(failedDashboard.body).toEqual({
      message: 'maintenance exploded',
    })

    await context.pool.end()
  })

  it('uses the non-wildcard cors origin and fallback error messages', async () => {
    vi.resetModules()

    vi.doMock('./config', () => ({
      apiConfig: {
        allowedOrigin: 'https://lemonsuk.example',
        apiBasePath: '/api/v1',
      },
    }))
    vi.doMock('./middleware/rate-limit', () => ({
      createRateLimitMiddleware:
        () =>
        (
          _request: express.Request,
          _response: express.Response,
          next: express.NextFunction,
        ) => {
          next()
        },
    }))
    vi.doMock('./routes/dashboard', () => ({
      createDashboardRouter: () => {
        const router = express.Router()
        router.get('/dashboard', (_request, _response, next) => {
          next('string-failure')
        })
        return router
      },
    }))
    vi.doMock('./routes/bets', () => ({
      createBetRouter: () => {
        const router = express.Router()
        router.post('/bets', (_request, _response, next) => {
          next(new ZodError([]))
        })
        return router
      },
    }))
    vi.doMock('./routes/markets', () => ({
      createMarketRouter: () => {
        const router = express.Router()
        router.post(
          '/markets/:marketId/resolve',
          (_request, _response, next) => {
            next(
              new ZodError([
                {
                  code: 'custom',
                  message: 'Bad resolution payload.',
                  path: ['resolution'],
                },
              ] as never),
            )
          },
        )
        return router
      },
    }))
    vi.doMock('./routes/agent', () => ({
      createAgentRouter: () => express.Router(),
    }))
    vi.doMock('./routes/auth', () => ({
      createAuthRouter: () => express.Router(),
    }))
    vi.doMock('./routes/maintenance', () => ({
      createMaintenanceRouter: () => express.Router(),
    }))

    const { buildApp } = await import('./app')
    const app = buildApp()

    const corsResponse = await request(app)
      .get('/api/v1/dashboard')
      .set('Origin', 'https://lemonsuk.example')
    const zodResponse = await request(app).post('/api/v1/bets').send({})
    const zodIssueResponse = await request(app)
      .post('/api/v1/markets/test-market/resolve')
      .send({})

    expect(corsResponse.headers['access-control-allow-origin']).toBe(
      'https://lemonsuk.example',
    )
    expect(corsResponse.statusCode).toBe(500)
    expect(corsResponse.body).toEqual({
      message: 'Internal server error.',
    })
    expect(zodResponse.statusCode).toBe(400)
    expect(zodResponse.body).toEqual({
      message: 'Invalid request payload.',
    })
    expect(zodIssueResponse.statusCode).toBe(400)
    expect(zodIssueResponse.body).toEqual({
      message: 'Bad resolution payload.',
    })
  })
})
