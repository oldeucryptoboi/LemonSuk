import express from 'express'
import request from 'supertest'
import { ZodError } from 'zod'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { supportMarketId } from './shared'
import { createSeedStore } from './data/seed'
import { setupApiContext } from '../../../test/helpers/api-context'
import { solveCaptchaPrompt as solveCaptcha } from '../../../test/helpers/captcha'

const avatarStorageMocks = vi.hoisted(() => ({
  ingestAgentAvatarFromUrl: vi.fn(async (sourceUrl: string, agentHandle: string) => {
    const extension = sourceUrl.split('.').pop() || 'png'
    return `https://cdn.lemonsuk.test/agent-avatars/${agentHandle}/${agentHandle}.${extension}`
  }),
  deleteManagedAvatarUrl: vi.fn(async () => undefined),
  isManagedAvatarUrl: vi.fn((url: string | null | undefined) =>
    typeof url === 'string' && url.startsWith('https://cdn.lemonsuk.test/'),
  ),
}))

vi.mock('./services/avatar-storage', () => avatarStorageMocks)

describe('app routes', () => {
  beforeEach(() => {
    avatarStorageMocks.ingestAgentAvatarFromUrl.mockClear()
    avatarStorageMocks.deleteManagedAvatarUrl.mockClear()
    avatarStorageMocks.isManagedAvatarUrl.mockClear()
    avatarStorageMocks.ingestAgentAvatarFromUrl.mockImplementation(
      async (sourceUrl: string, agentHandle: string) => {
        const extension = sourceUrl.split('.').pop() || 'png'
        return `https://cdn.lemonsuk.test/agent-avatars/${agentHandle}/${agentHandle}.${extension}`
      },
    )
    avatarStorageMocks.deleteManagedAvatarUrl.mockImplementation(
      async () => undefined,
    )
    avatarStorageMocks.isManagedAvatarUrl.mockImplementation(
      (url: string | null | undefined) =>
        typeof url === 'string' && url.startsWith('https://cdn.lemonsuk.test/'),
    )
  })

  it('serves health, dashboard, agent auth, and maintenance flows', async () => {
    process.env.SENDGRID_API_KEY = 'test-sendgrid-key'
    process.env.SENDGRID_FROM_EMAIL = 'noreply@lemonsuk.test'
    process.env.API_PUBLIC_URL = 'http://localhost:8787'
    process.env.X_CLIENT_ID = 'x-client-id'
    process.env.X_CLIENT_SECRET = 'x-client-secret'
    process.env.X_BEARER_TOKEN = 'x-bearer-token'
    const sendMail = vi.fn(async () => undefined)

    const context = await setupApiContext({
      applyMocks: () => {
        vi.doMock('@sendgrid/mail', () => ({
          default: {
            setApiKey: vi.fn(),
            send: sendMail,
          },
        }))
      },
    })
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
    expect(Array.isArray(dashboardResponse.body.competitionStandings)).toBe(true)
    const resolvedMarketsBefore = dashboardResponse.body.stats.resolvedMarkets

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
    expect(resolvedMarketResponse.body.stats.resolvedMarkets).toBe(
      resolvedMarketsBefore + 1,
    )

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
        avatarUrl: 'https://example.com/deadline-bot.png',
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
    expect(registration.agent.avatarUrl).toBe(
      'https://cdn.lemonsuk.test/agent-avatars/deadlinebot/deadlinebot.png',
    )

    const profileUpdateResponse = await request(app)
      .patch('/api/v1/auth/agents/profile')
      .set('x-agent-api-key', registration.apiKey)
      .send({
        displayName: 'Deadline Bot Prime',
        biography:
          'Systematic agent that fades optimistic Musk timelines and sharpens profile copy.',
        avatarUrl: 'https://example.com/deadline-bot-prime.png',
      })
    expect(profileUpdateResponse.statusCode).toBe(200)
    expect(profileUpdateResponse.body.displayName).toBe('Deadline Bot Prime')
    expect(profileUpdateResponse.body.avatarUrl).toBe(
      'https://cdn.lemonsuk.test/agent-avatars/deadlinebot/deadlinebot.png',
    )

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
    expect(claimOwnerResponse.body.agent.ownerEmail).toBe('owner@example.com')
    expect(claimOwnerResponse.body.agent.ownerVerificationStatus).toBe(
      'pending_email',
    )

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
    expect(
      (
        await request(app).post('/api/v1/auth/owners/login-link').send({
          ownerEmail: 'owner@example.com',
        })
      ).body.message,
    ).toBe(
      'Finish the claim verification steps from your claim link before opening the owner deck.',
    )

    const lockedConnectResponse = await request(app).get(
      `/api/v1/auth/claims/${claimToken}/connect-x`,
    )
    expect(lockedConnectResponse.statusCode).toBe(400)
    expect(lockedConnectResponse.body.message).toBe(
      'Confirm the owner email from the claim link before connecting X.',
    )

    const firstClaimEmailCall = sendMail.mock.calls.at(0) as
      | Array<Record<string, unknown>>
      | undefined
    const claimEmailMessage = (firstClaimEmailCall?.[0] ?? null) as
      | { html?: string }
      | null
    const claimEmailUrlMatch = String(claimEmailMessage?.html ?? '').match(
      /https?:\/\/[^"\s<]+/,
    )
    expect(claimEmailUrlMatch?.[0]).toBeTruthy()
    const claimEmailUrl = new URL(claimEmailUrlMatch![0])

    const verifyEmailResponse = await request(app).get(
      `${claimEmailUrl.pathname}${claimEmailUrl.search}`,
    )
    expect(verifyEmailResponse.statusCode).toBe(302)
    expect(verifyEmailResponse.headers.location).toContain(
      `http://localhost:5173/?claim=${claimToken}&email_verified=1`,
    )

    const connectResponse = await request(app).get(
      `/api/v1/auth/claims/${claimToken}/connect-x`,
    )
    expect(connectResponse.statusCode).toBe(302)
    const oauthState = new URL(connectResponse.headers.location).searchParams.get(
      'state',
    )
    expect(oauthState).not.toBeNull()

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: 'x-access-token',
              token_type: 'bearer',
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: {
                id: 'x-user-1',
                username: 'owner',
              },
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: {
                id: '1',
                author_id: 'x-user-1',
                text: `Claiming @deadlinebot on LemonSuk. Human verification code: ${claimOwnerResponse.body.agent.ownerVerificationCode}`,
              },
              includes: {
                users: [
                  {
                    id: 'x-user-1',
                    username: 'owner',
                  },
                ],
              },
            }),
            { status: 200 },
          ),
        ),
    )
    const callbackResponse = await request(app).get(
      `/api/v1/auth/x/callback?state=${oauthState}&code=test-code`,
    )
    expect(callbackResponse.statusCode).toBe(302)
    expect(callbackResponse.headers.location).toContain(
      `http://localhost:5173/?claim=${claimToken}&x_connected=1`,
    )
    const verifyTweetResponse = await request(app)
      .post(`/api/v1/auth/claims/${claimToken}/verify-tweet`)
      .send({
        tweetUrl: 'https://x.com/owner/status/1',
      })
    expect(verifyTweetResponse.statusCode).toBe(200)
    vi.unstubAllGlobals()

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

    const preBetDashboardResponse = await request(app).get('/api/v1/dashboard')
    expect(preBetDashboardResponse.statusCode).toBe(200)
    const preBetOptimusLine = preBetDashboardResponse.body.markets.find(
      (market: { id: string; payoutMultiplier: number }) =>
        market.id === 'optimus-customizable-2026',
    )?.payoutMultiplier
    const preBetStarshipLine = preBetDashboardResponse.body.markets.find(
      (market: { id: string; payoutMultiplier: number }) =>
        market.id === 'starship-mars-2026',
    )?.payoutMultiplier

    const agentBetResponse = await request(app)
      .post('/api/v1/auth/agents/bets')
      .send({
        apiKey: registration.apiKey,
        marketId: 'optimus-customizable-2026',
        stakeCredits: 90,
      })
    expect(agentBetResponse.statusCode).toBe(200)
    expect(agentBetResponse.body.agent.handle).toBe('deadlinebot')
    expect(agentBetResponse.body.agent.availableCredits).toBe(10)
    expect(agentBetResponse.body.agent.promoCredits).toBe(10)
    expect(agentBetResponse.body.agent.earnedCredits).toBe(0)
    expect(agentBetResponse.body.bet.payoutMultiplierAtPlacement).toBe(
      preBetOptimusLine,
    )
    expect(
      agentBetResponse.body.snapshot.markets.find(
        (market: { id: string; payoutMultiplier: number }) =>
          market.id === 'optimus-customizable-2026',
      )?.payoutMultiplier,
    ).toBeLessThan(preBetOptimusLine)
    expect(
      agentBetResponse.body.snapshot.markets.find(
        (market: { id: string; payoutMultiplier: number }) =>
          market.id === 'starship-mars-2026',
      )?.payoutMultiplier,
    ).toBe(preBetStarshipLine)
    expect(agentBetResponse.body.snapshot.stats.activeBets).toBe(1)

    const postBetDashboardResponse = await request(app).get('/api/v1/dashboard')
    expect(postBetDashboardResponse.statusCode).toBe(200)
    expect(
      postBetDashboardResponse.body.markets.find(
        (market: { id: string; payoutMultiplier: number }) =>
          market.id === 'optimus-customizable-2026',
      )?.payoutMultiplier,
    ).toBe(
      agentBetResponse.body.snapshot.markets.find(
        (market: { id: string; payoutMultiplier: number }) =>
          market.id === 'optimus-customizable-2026',
      )?.payoutMultiplier,
    )
    expect(
      postBetDashboardResponse.body.markets.find(
        (market: { id: string; payoutMultiplier: number }) =>
          market.id === 'starship-mars-2026',
      )?.payoutMultiplier,
    ).toBe(preBetStarshipLine)

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
    expect(discoveryResponse.statusCode).toBe(404)

    const maintenanceResponse = await request(app).post(
      '/api/v1/maintenance/run',
    )
    expect(maintenanceResponse.statusCode).toBe(200)
    expect(maintenanceResponse.body.hallOfFame.length).toBeGreaterThanOrEqual(1)
    expect(maintenanceResponse.body.competitionStandings.length).toBeGreaterThanOrEqual(1)

    await context.pool.end()
  }, 10_000)

  it('settles agent bets through the api for both wins and losses', async () => {
    process.env.SENDGRID_API_KEY = 'test-sendgrid-key'
    process.env.SENDGRID_FROM_EMAIL = 'noreply@lemonsuk.test'
    process.env.API_PUBLIC_URL = 'http://localhost:8787'
    process.env.X_CLIENT_ID = 'x-client-id'
    process.env.X_CLIENT_SECRET = 'x-client-secret'
    process.env.X_BEARER_TOKEN = 'x-bearer-token'
    const sendMail = vi.fn(async () => undefined)

    const context = await setupApiContext({
      applyMocks: () => {
        vi.doMock('@sendgrid/mail', () => ({
          default: {
            setApiKey: vi.fn(),
            send: sendMail,
          },
        }))
      },
    })
    const app = context.buildApp()

    const captcha = (await request(app).get('/api/v1/auth/captcha')).body
    const registrationResponse = await request(app)
      .post('/api/v1/auth/agents/register')
      .send({
        handle: 'hedgebot',
        displayName: 'Hedge Bot',
        ownerName: 'Observer',
        modelProvider: 'OpenAI',
        biography:
          'Systematic agent that sizes contrarian bets and tracks settlement outcomes.',
        captchaChallengeId: captcha.id,
        captchaAnswer: solveCaptcha(captcha.prompt),
      })

    expect(registrationResponse.statusCode).toBe(200)
    const registration = registrationResponse.body
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')

    const claimOwnerResponse = await request(app)
      .post(`/api/v1/auth/claims/${claimToken}/owner`)
      .send({
        ownerEmail: 'owner@example.com',
      })
    expect(claimOwnerResponse.statusCode).toBe(200)
    const secondClaimEmailCall = sendMail.mock.calls.at(0) as
      | Array<Record<string, unknown>>
      | undefined
    const claimEmailMessage = (secondClaimEmailCall?.[0] ?? null) as
      | { html?: string }
      | null
    const claimEmailUrlMatch = String(claimEmailMessage?.html ?? '').match(
      /https?:\/\/[^"\s<]+/,
    )
    expect(claimEmailUrlMatch?.[0]).toBeTruthy()
    const claimEmailUrl = new URL(claimEmailUrlMatch![0])
    const verifyEmailResponse = await request(app).get(
      `${claimEmailUrl.pathname}${claimEmailUrl.search}`,
    )
    expect(verifyEmailResponse.statusCode).toBe(302)

    const connectResponse = await request(app).get(
      `/api/v1/auth/claims/${claimToken}/connect-x`,
    )
    const oauthState = new URL(connectResponse.headers.location).searchParams.get(
      'state',
    )
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: 'x-access-token',
              token_type: 'bearer',
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: {
                id: 'x-user-1',
                username: 'owner',
              },
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: {
                id: '2',
                author_id: 'x-user-1',
                text: `Claiming @hedgebot on LemonSuk. Human verification code: ${claimOwnerResponse.body.agent.ownerVerificationCode}`,
              },
              includes: {
                users: [
                  {
                    id: 'x-user-1',
                    username: 'owner',
                  },
                ],
              },
            }),
            { status: 200 },
          ),
        ),
    )
    const callbackResponse = await request(app).get(
      `/api/v1/auth/x/callback?state=${oauthState}&code=test-code`,
    )
    expect(callbackResponse.statusCode).toBe(302)
    const verifyTweetResponse = await request(app)
      .post(`/api/v1/auth/claims/${claimToken}/verify-tweet`)
      .send({
        tweetUrl: 'https://x.com/owner/status/2',
      })
    expect(verifyTweetResponse.statusCode).toBe(200)
    vi.unstubAllGlobals()
    const ownerSession = verifyTweetResponse.body

    const winningBetResponse = await request(app)
      .post('/api/v1/auth/agents/bets')
      .send({
        apiKey: registration.apiKey,
        marketId: 'optimus-customizable-2026',
        stakeCredits: 15,
      })
    expect(winningBetResponse.statusCode).toBe(200)
    expect(winningBetResponse.body.bet.projectedPayoutCredits).toBeGreaterThan(15)
    const winningPayout = winningBetResponse.body.bet.projectedPayoutCredits

    const overbetResponse = await request(app)
      .post('/api/v1/auth/agents/bets')
      .send({
        apiKey: registration.apiKey,
        marketId: 'starship-mars-2026',
        stakeCredits: 95,
      })
    expect(overbetResponse.statusCode).toBe(400)
    expect(overbetResponse.body.message).toBe('Insufficient agent credits.')

    const wonResolutionResponse = await request(app)
      .post('/api/v1/markets/optimus-customizable-2026/resolve')
      .send({
        resolution: 'missed',
        resolutionNotes: 'The robot missed the shipping window.',
      })
    expect(wonResolutionResponse.statusCode).toBe(200)
    expect(wonResolutionResponse.body.stats.activeBets).toBe(0)
    expect(wonResolutionResponse.body.stats.wonBets).toBe(1)

    const ownerAfterWinResponse = await request(app).get(
      `/api/v1/auth/owners/sessions/${ownerSession.sessionToken}`,
    )
    expect(ownerAfterWinResponse.statusCode).toBe(200)
    expect(ownerAfterWinResponse.body.agents[0]).toMatchObject({
      handle: 'hedgebot',
      promoCredits: 85,
      earnedCredits: winningPayout,
      availableCredits: Number((85 + winningPayout).toFixed(2)),
    })
    expect(
      ownerAfterWinResponse.body.notifications.some(
        (notification: { type: string; marketId: string | null }) =>
          notification.type === 'bet_won' &&
          notification.marketId === 'optimus-customizable-2026',
      ),
    ).toBe(true)

    await context.store.withStoreTransaction(async (store, persist) => {
      await persist({
        ...store,
        markets: store.markets.map((market) =>
          market.id === 'openai-device-2026'
            ? {
                ...market,
                betMode: 'binary',
              }
            : market,
        ),
      })
    })

    const forBetResponse = await request(app)
      .post('/api/v1/auth/agents/bets')
      .send({
        apiKey: registration.apiKey,
        marketId: 'openai-device-2026',
        stakeCredits: 15,
        side: 'for',
      })
    expect(forBetResponse.statusCode).toBe(200)
    expect(forBetResponse.body.bet.side).toBe('for')
    expect(forBetResponse.body.bet.projectedPayoutCredits).toBeGreaterThan(15)
    const forWinPayout = forBetResponse.body.bet.projectedPayoutCredits

    const forResolutionResponse = await request(app)
      .post('/api/v1/markets/openai-device-2026/resolve')
      .send({
        resolution: 'delivered',
        resolutionNotes: 'The device launched inside the window.',
      })
    expect(forResolutionResponse.statusCode).toBe(200)
    expect(forResolutionResponse.body.stats.wonBets).toBe(2)

    const losingBetResponse = await request(app)
      .post('/api/v1/auth/agents/bets')
      .send({
        apiKey: registration.apiKey,
        marketId: 'starship-mars-2026',
        stakeCredits: 10,
      })
    expect(losingBetResponse.statusCode).toBe(200)

    const lostResolutionResponse = await request(app)
      .post('/api/v1/markets/starship-mars-2026/resolve')
      .send({
        resolution: 'delivered',
        resolutionNotes: 'The mission shipped on schedule.',
      })
    expect(lostResolutionResponse.statusCode).toBe(200)
    expect(lostResolutionResponse.body.stats.wonBets).toBe(2)
    expect(lostResolutionResponse.body.stats.lostBets).toBe(1)

    const ownerAfterLossResponse = await request(app).get(
      `/api/v1/auth/owners/sessions/${ownerSession.sessionToken}`,
    )
    expect(ownerAfterLossResponse.statusCode).toBe(200)
    expect(ownerAfterLossResponse.body.agents[0]).toMatchObject({
      handle: 'hedgebot',
      promoCredits: 60,
      earnedCredits: Number((winningPayout + forWinPayout).toFixed(2)),
      availableCredits: Number((60 + winningPayout + forWinPayout).toFixed(2)),
    })
    expect(
      ownerAfterLossResponse.body.notifications.some(
        (notification: { type: string; marketId: string | null }) =>
          notification.type === 'bet_lost' &&
          notification.marketId === 'starship-mars-2026',
      ),
    ).toBe(true)
    expect(
      ownerAfterLossResponse.body.notifications.some(
        (notification: { type: string; marketId: string | null }) =>
          notification.type === 'bet_won' &&
          notification.marketId === 'openai-device-2026',
      ),
    ).toBe(true)

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
  }, 15000)

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
