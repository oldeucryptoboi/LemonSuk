import { afterEach, describe, expect, it, vi } from 'vitest'

describe('store service branch coverage', () => {
  afterEach(() => {
    vi.doUnmock('./database')
    vi.resetModules()
  })

  it('seeds the store when the market count query returns no rows', async () => {
    const query = vi.fn(async (_sql: unknown, _params?: unknown[]) => ({
      rows: [] as never[],
    }))
    const normalizeSql = (value: unknown) =>
      String(value).replace(/\s+/g, ' ').trim()

    vi.doMock('./database', () => ({
      withDatabaseClient: vi.fn(),
      withDatabaseTransaction: async (
        callback: (client: { query: typeof query }) => Promise<unknown>,
      ) => callback({ query }),
    }))

    const store = await import('./store')

    await expect(store.ensureStore()).resolves.toBeUndefined()
    expect(
      query.mock.calls.some((call: unknown[]) =>
        normalizeSql(call[0]).includes('SELECT COUNT(*)::text AS count FROM markets'),
      ),
    ).toBe(true)
    expect(
      query.mock.calls.some((call: unknown[]) =>
        normalizeSql(call[0]).includes('INSERT INTO markets'),
      ),
    ).toBe(true)
  })

  it('backfills missing authored seed markets with the author id', async () => {
    const normalizeSql = (value: unknown) =>
      String(value).replace(/\s+/g, ' ').trim()
    const query = vi.fn(async (sql: unknown, _params?: unknown[]) => {
      const normalized = normalizeSql(sql)

      if (normalized.includes('SELECT COUNT(*)::text AS count FROM markets')) {
        return { rows: [{ count: '1' }] }
      }

      if (normalized.includes('SELECT id FROM markets')) {
        return { rows: [] as never[] }
      }

      return { rows: [] as never[] }
    })

    vi.doMock('../data/seed', () => ({
      createSeedStore: () => ({
        markets: [
          {
            id: 'authored-market',
            slug: 'authored-market',
            headline: 'Authored market',
            subject: 'Tesla Robotaxi',
            category: 'robotaxi',
            announcedOn: '2026-03-16T00:00:00.000Z',
            promisedDate: '2026-12-31T23:59:59.000Z',
            promisedBy: 'Elon Musk',
            summary: 'Authored market summary.',
            status: 'open',
            resolution: 'pending',
            resolutionNotes: null,
            basePayoutMultiplier: 1.9,
            payoutMultiplier: 1.9,
            confidence: 80,
            stakeDifficulty: 3,
            tags: ['tesla'],
            sources: [],
            author: {
              id: 'agent-1',
              handle: 'deadlinebot',
              displayName: 'Deadline Bot',
            },
            linkedMarketIds: [],
            betWindowOpen: true,
            bustedAt: null,
            createdAt: '2026-03-16T00:00:00.000Z',
            updatedAt: '2026-03-16T00:00:00.000Z',
            lastCheckedAt: '2026-03-16T00:00:00.000Z',
          },
        ],
        bets: [],
        notifications: [],
        metadata: {
          lastMaintenanceRunAt: null,
          lastDiscoveryRunAt: null,
        },
      }),
    }))
    vi.doMock('./database', () => ({
      withDatabaseClient: vi.fn(),
      withDatabaseTransaction: async (
        callback: (client: { query: typeof query }) => Promise<unknown>,
      ) => callback({ query }),
    }))

    const store = await import('./store')

    await expect(store.ensureStore()).resolves.toBeUndefined()

    const insertCall = query.mock.calls.find((call: unknown[]) =>
      normalizeSql(call[0]).includes('INSERT INTO markets'),
    )
    expect(insertCall?.[1]?.[23]).toBe('agent-1')
  })
})
