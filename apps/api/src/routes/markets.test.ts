import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

describe('createMarketRouter', () => {
  it('uses an explicit resolvedAt timestamp when resolving a market', async () => {
    vi.resetModules()

    const persistedStore = {
      markets: [],
      bets: [],
      notifications: [],
      metadata: {
        lastMaintenanceRunAt: null,
        lastDiscoveryRunAt: null,
      },
    }

    vi.doMock('../services/store', () => ({
      withStoreTransaction: vi.fn(async (run) =>
        run(persistedStore, async () => persistedStore),
      ),
    }))
    vi.doMock('../services/maintenance', () => ({
      resolveMarket: vi.fn(() => ({
        store: persistedStore,
        market: {
          id: 'market-1',
        },
      })),
      runMaintenance: vi.fn(() => ({
        store: persistedStore,
        changed: true,
      })),
    }))
    vi.doMock('./helpers', () => ({
      createOperationalSnapshot: vi.fn(
        async (_store: unknown, now: Date) => ({
          now: now.toISOString(),
          hallOfFameCount: 0,
        }),
      ),
      publishOperationalSnapshot: vi.fn(async () => true),
    }))

    const { createMarketRouter } = await import('./markets')
    const app = express()
    app.use(express.json())
    app.use('/api/v1', createMarketRouter())

    const response = await request(app)
      .post('/api/v1/markets/market-1/resolve')
      .send({
        resolution: 'delivered',
        resolutionNotes: 'Shipped on time.',
        resolvedAt: '2026-12-31T23:59:59.000Z',
      })

    expect(response.statusCode).toBe(200)
    expect(response.body.now).toBe('2026-12-31T23:59:59.000Z')
    expect(response.body.hallOfFameCount).toBe(0)
  })

  it('uses the fallback message when a non-Error value is thrown', async () => {
    vi.resetModules()

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
    vi.doMock('../services/maintenance', () => ({
      resolveMarket: vi.fn(() => {
        throw 'resolve-failed'
      }),
      runMaintenance: vi.fn(),
    }))
    vi.doMock('./helpers', () => ({
      createOperationalSnapshot: vi.fn(async () => ({})),
      publishOperationalSnapshot: vi.fn(async () => true),
    }))

    const { createMarketRouter } = await import('./markets')
    const app = express()
    app.use(express.json())
    app.use('/api/v1', createMarketRouter())

    const response = await request(app)
      .post('/api/v1/markets/market-1/resolve')
      .send({
        resolution: 'missed',
        resolutionNotes: 'Missed the date.',
      })

    expect(response.statusCode).toBe(400)
    expect(response.body.message).toBe('Could not resolve market.')
  })
})
