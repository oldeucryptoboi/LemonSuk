import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

describe('createAuthRouter fallback errors', () => {
  it('uses fallback messages when non-Error values are thrown', async () => {
    vi.resetModules()

    vi.doMock('../services/identity', () => ({
      authenticateAgentApiKey: vi.fn(async () => ({
        id: 'agent-1',
        handle: 'deadlinebot',
      })),
      claimOwnerByClaimToken: vi.fn(async () => {
        throw 'claim-owner'
      }),
      createCaptchaChallenge: vi.fn(async () => ({
        id: 'captcha-1',
        prompt: 'prompt',
        hint: 'hint',
        expiresAt: '2026-03-16T00:20:00.000Z',
      })),
      createOwnerLoginLink: vi.fn(async () => {
        throw 'login-link'
      }),
      readAgentProfileByIdFromClient: vi.fn(async () => ({
        id: 'agent-1',
        handle: 'deadlinebot',
      })),
      readCaptchaChallenge: vi.fn(async () => null),
      readClaimView: vi.fn(async () => null),
      readOwnerSession: vi.fn(async () => null),
      registerAgent: vi.fn(async () => {
        throw 'register'
      }),
      setupOwnerEmail: vi.fn(async () => {
        throw 'owner-email'
      }),
    }))
    vi.doMock('../services/store', () => ({
      withStoreTransaction: vi.fn(async (run) =>
        run(
          {
            markets: [],
            bets: [],
            notifications: [],
            metadata: {
              lastMaintenanceRunAt: null,
              lastDiscoveryRunAt: null,
            },
          },
          async (nextStore: unknown) => nextStore,
        ),
      ),
    }))
    vi.doMock('../services/betting', () => ({
      placeAgainstBetForUser: vi.fn(() => {
        throw 'closed'
      }),
    }))
    vi.doMock('./helpers', () => ({
      createOperationalSnapshot: vi.fn(async () => ({})),
      dispatchOwnerLoginLink: vi.fn(async () => undefined),
      publishCurrentOperationalSnapshot: vi.fn(async () => ({})),
      publishOperationalSnapshot: vi.fn(async () => true),
      readApiKey: (headerValue: unknown, bodyValue: string | undefined) => {
        if (typeof headerValue === 'string') {
          return headerValue
        }

        return bodyValue ?? null
      },
    }))

    const { createAuthRouter } = await import('./auth')
    const app = express()
    app.use(express.json())
    app.use('/api/v1/auth', createAuthRouter())

    expect(
      (
        await request(app)
          .post('/api/v1/auth/agents/register')
          .send({
            handle: 'deadlinebot',
            displayName: 'Deadline Bot',
            ownerName: 'Owner',
            modelProvider: 'OpenAI',
            biography:
              'Systematic agent that fades optimistic Musk timelines and writes counter-bets.',
            captchaChallengeId: 'captcha-1',
            captchaAnswer: 'solved',
          })
      ).body.message,
    ).toBe('Agent registration failed.')

    expect(
      (
        await request(app)
          .post('/api/v1/auth/agents/setup-owner-email')
          .send({
            apiKey: 'lsk_live_1234567890',
            ownerEmail: 'owner@example.com',
          })
      ).body.message,
    ).toBe('Could not set owner email.')

    expect(
      (
        await request(app)
          .post('/api/v1/auth/claims/claim_1/owner')
          .send({
            ownerEmail: 'owner@example.com',
          })
      ).body.message,
    ).toBe('Could not claim this agent.')

    expect(
      (
        await request(app)
          .post('/api/v1/auth/owners/login-link')
          .send({
            ownerEmail: 'owner@example.com',
          })
      ).body.message,
    ).toBe('Could not create login link.')

    expect(
      (
        await request(app)
          .post('/api/v1/auth/agents/bets')
          .send({
            apiKey: 'lsk_live_1234567890',
            marketId: 'market-1',
            stakeCredits: 10,
          })
      ).body.message,
    ).toBe('This market is closed.')
  })

  it('uses the anonymous rate-limit key fallback for agent bets', async () => {
    vi.resetModules()

    const capturedKeys: string[] = []

    vi.doMock('../middleware/rate-limit', () => ({
      createRateLimitMiddleware:
        (options: {
          key?: (request: {
            body?: { apiKey?: string }
            header: (name: string) => string | undefined
            ip?: string
          }) => string
        }) => {
          if (options.key) {
            capturedKeys.push(
              options.key({
                body: {},
                header: () => undefined,
                ip: undefined,
              }),
            )
          }

          return (
            _request: unknown,
            _response: unknown,
            next: (value?: unknown) => void,
          ) => {
            next()
          }
        },
    }))
    vi.doMock('../services/identity', () => ({
      authenticateAgentApiKey: vi.fn(async () => ({
        id: 'agent-1',
        handle: 'deadlinebot',
      })),
      claimOwnerByClaimToken: vi.fn(async () => ({
        sessionToken: 'owner_1',
        ownerEmail: 'owner@example.com',
        loginUrl: '/?owner_session=owner_1',
        expiresAt: '2026-03-18T00:00:00.000Z',
        agentHandles: ['deadlinebot'],
      })),
      createCaptchaChallenge: vi.fn(async () => ({
        id: 'captcha-1',
        prompt: 'prompt',
        hint: 'hint',
        expiresAt: '2026-03-16T00:20:00.000Z',
      })),
      createOwnerLoginLink: vi.fn(async () => ({
        sessionToken: 'owner_1',
        ownerEmail: 'owner@example.com',
        loginUrl: '/?owner_session=owner_1',
        expiresAt: '2026-03-18T00:00:00.000Z',
        agentHandles: ['deadlinebot'],
      })),
      readAgentProfileByIdFromClient: vi.fn(async () => ({
        id: 'agent-1',
        handle: 'deadlinebot',
      })),
      readCaptchaChallenge: vi.fn(async () => null),
      readClaimView: vi.fn(async () => null),
      readOwnerSession: vi.fn(async () => null),
      registerAgent: vi.fn(async () => ({
        agent: { id: 'agent-1' },
      })),
      setupOwnerEmail: vi.fn(async () => ({
        agent: { id: 'agent-1' },
      })),
    }))
    vi.doMock('../services/store', () => ({
      withStoreTransaction: vi.fn(async (run) =>
        run(
          {
            markets: [],
            bets: [],
            notifications: [],
            metadata: {
              lastMaintenanceRunAt: null,
              lastDiscoveryRunAt: null,
            },
          },
          async (nextStore: unknown) => nextStore,
        ),
      ),
    }))
    vi.doMock('../services/betting', () => ({
      placeAgainstBetForUser: vi.fn(() => {
        throw new Error('Boom.')
      }),
    }))
    vi.doMock('./helpers', () => ({
      createOperationalSnapshot: vi.fn(async () => ({})),
      dispatchOwnerLoginLink: vi.fn(async () => undefined),
      publishCurrentOperationalSnapshot: vi.fn(async () => ({})),
      publishOperationalSnapshot: vi.fn(async () => true),
      readApiKey: (headerValue: unknown, bodyValue: string | undefined) => {
        if (typeof headerValue === 'string') {
          return headerValue
        }

        return bodyValue ?? null
      },
    }))

    const { createAuthRouter } = await import('./auth')
    createAuthRouter()
    expect(capturedKeys).toContain('anonymous')
  })

  it('falls back to the merged authenticated agent and wallet state when the refreshed profile is missing', async () => {
    vi.resetModules()

    vi.doMock('../services/identity', () => ({
      authenticateAgentApiKey: vi.fn(async () => ({
        id: 'agent-1',
        handle: 'deadlinebot',
        displayName: 'Deadline Bot',
      })),
      claimOwnerByClaimToken: vi.fn(),
      createCaptchaChallenge: vi.fn(),
      createOwnerLoginLink: vi.fn(),
      readAgentProfileByIdFromClient: vi.fn(async () => null),
      readCaptchaChallenge: vi.fn(),
      readClaimView: vi.fn(),
      readOwnerSession: vi.fn(),
      registerAgent: vi.fn(),
      setupOwnerEmail: vi.fn(),
    }))
    vi.doMock('../services/store', () => ({
      withStoreTransaction: vi.fn(async (run) =>
        run(
          {
            markets: [],
            bets: [],
            notifications: [],
            metadata: {
              lastMaintenanceRunAt: null,
              lastDiscoveryRunAt: null,
            },
          },
          async (nextStore: unknown) => nextStore,
          { id: 'client-1' },
        ),
      ),
    }))
    vi.doMock('../services/maintenance', () => ({
      runMaintenance: vi.fn((store) => ({
        changed: false,
        store,
      })),
    }))
    vi.doMock('../services/betting', () => ({
      placeAgainstBetForUser: vi.fn((store) => ({
        bet: {
          id: 'bet-1',
          userId: 'agent-1',
          marketId: 'market-1',
          stakeCredits: 10,
          side: 'against',
          status: 'open',
          payoutMultiplierAtPlacement: 1.5,
          globalBonusPercentAtPlacement: 18,
          projectedPayoutCredits: 17.7,
          settledPayoutCredits: null,
          placedAt: '2026-03-16T00:00:00.000Z',
          settledAt: null,
        },
        store,
      })),
    }))
    vi.doMock('../services/wallet', () => ({
      debitAgentCredits: vi.fn(async () => ({
        promoCredits: 25,
        earnedCredits: 5,
        availableCredits: 30,
      })),
    }))
    vi.doMock('./helpers', () => ({
      createOperationalSnapshot: vi.fn(async () => ({
        stats: { totalMarkets: 0 },
      })),
      dispatchOwnerLoginLink: vi.fn(async () => undefined),
      publishCurrentOperationalSnapshot: vi.fn(async () => ({})),
      publishOperationalSnapshot: vi.fn(async () => true),
      readApiKey: (headerValue: unknown, bodyValue: string | undefined) => {
        if (typeof headerValue === 'string') {
          return headerValue
        }

        return bodyValue ?? null
      },
    }))

    const { createAuthRouter } = await import('./auth')
    const app = express()
    app.use(express.json())
    app.use('/api/v1/auth', createAuthRouter())

    const response = await request(app)
      .post('/api/v1/auth/agents/bets')
      .send({
        apiKey: 'lsk_live_1234567890',
        marketId: 'market-1',
        stakeCredits: 10,
      })

    expect(response.statusCode).toBe(200)
    expect(response.body.agent).toMatchObject({
      id: 'agent-1',
      handle: 'deadlinebot',
      displayName: 'Deadline Bot',
      promoCredits: 25,
      earnedCredits: 5,
      availableCredits: 30,
    })
  })
})
