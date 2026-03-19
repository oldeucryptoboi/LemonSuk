import { describe, expect, it } from 'vitest'

import type { StoreData } from '../shared'
import { resolveMarket, runMaintenance } from './maintenance'
import { setupApiContext } from '../../../../test/helpers/api-context'
import { solveCaptchaPrompt as solveCaptcha } from '../../../../test/helpers/captcha'

const baseStore: StoreData = {
  markets: [
    {
      id: 'market-1',
      slug: 'market-1',
      headline: 'Test market',
      subject: 'Tesla Robotaxi',
      category: 'robotaxi',
      announcedOn: '2024-01-01T00:00:00.000Z',
      promisedDate: '2024-02-01T00:00:00.000Z',
      promisedBy: 'Elon Musk',
      summary: 'Promise',
      status: 'open',
      resolution: 'pending',
      resolutionNotes: null,
      basePayoutMultiplier: 2,
      payoutMultiplier: 2,
      confidence: 80,
      stakeDifficulty: 3,
      tags: [],
      sources: [],
      author: null,
      linkedMarketIds: [],
      betWindowOpen: true,
      bustedAt: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      lastCheckedAt: '2024-01-01T00:00:00.000Z',
    },
  ],
  bets: [
    {
      id: 'bet-1',
      userId: 'demo-user',
      marketId: 'market-1',
      stakeCredits: 10,
      side: 'against',
      status: 'open',
      payoutMultiplierAtPlacement: 2,
      globalBonusPercentAtPlacement: 10,
      projectedPayoutCredits: 22,
      settledPayoutCredits: null,
      placedAt: '2024-01-01T00:00:00.000Z',
      settledAt: null,
    },
  ],
  notifications: [],
  metadata: {
    lastMaintenanceRunAt: null,
    lastDiscoveryRunAt: null,
  },
}

describe('runMaintenance', () => {
  it('busts expired markets and settles counter-bets as wins', () => {
    const now = new Date('2024-03-01T00:00:00.000Z')
    const result = runMaintenance(baseStore, now)

    expect(result.changed).toBe(true)
    expect(result.store.markets[0]?.status).toBe('busted')
    expect(result.store.bets[0]?.status).toBe('won')
    expect(result.store.bets[0]?.settledPayoutCredits).toBe(22)
    expect(result.store.notifications[0]?.type).toBe('bet_won')
  })

  it('resolves delivered markets and settles counter-bets as losses', () => {
    const resolved = resolveMarket(
      baseStore,
      'market-1',
      'delivered',
      'The feature shipped on time.',
      new Date('2024-01-31T00:00:00.000Z'),
    )
    const result = runMaintenance(
      resolved.store,
      new Date('2024-01-31T00:00:00.000Z'),
    )

    expect(result.store.markets[0]?.status).toBe('resolved')
    expect(result.store.bets[0]?.status).toBe('lost')
    expect(result.store.bets[0]?.settledPayoutCredits).toBe(0)
    expect(result.store.notifications[0]?.type).toBe('bet_lost')
  })

  it('resolves missed markets before the deadline and keeps the payout as a win', () => {
    const resolved = resolveMarket(
      baseStore,
      'market-1',
      'missed',
      'The launch was officially delayed.',
      new Date('2024-01-15T00:00:00.000Z'),
    )
    const result = runMaintenance(
      resolved.store,
      new Date('2024-01-15T00:00:00.000Z'),
    )

    expect(result.store.markets[0]?.status).toBe('busted')
    expect(result.store.markets[0]?.resolutionNotes).toBe(
      'The launch was officially delayed.',
    )
    expect(result.store.bets[0]?.status).toBe('won')
  })

  it('updates bet windows, avoids duplicate notifications, and can leave the store unchanged', async () => {
    const now = new Date('2024-01-15T00:00:00.000Z')
    const result = runMaintenance(
      {
        ...baseStore,
        markets: [
          {
            ...baseStore.markets[0]!,
            promisedDate: '2024-01-10T00:00:00.000Z',
            betWindowOpen: true,
          },
          {
            ...baseStore.markets[0]!,
            id: 'market-2',
            slug: 'market-2',
            promisedDate: '2024-02-01T00:00:00.000Z',
            betWindowOpen: false,
          },
        ],
        bets: [
          {
            ...baseStore.bets[0]!,
            marketId: 'market-1',
            status: 'open',
          },
          {
            ...baseStore.bets[0]!,
            id: 'bet-2',
            marketId: 'market-2',
            status: 'won',
          },
        ],
        notifications: [
          {
            id: 'notification-bet-1-busted',
            userId: 'demo-user',
            marketId: 'market-1',
            betId: 'bet-1',
            type: 'bet_won',
            title: 'Ticket cashed',
            body: 'Existing notification.',
            createdAt: '2024-01-11T00:00:00.000Z',
            readAt: null,
          },
        ],
      },
      now,
    )

    expect(result.changed).toBe(true)
    expect(result.store.markets.find((market) => market.id === 'market-2')?.betWindowOpen).toBe(
      true,
    )
    expect(result.store.notifications).toHaveLength(1)

    const repriced = runMaintenance(baseStore, new Date('2024-01-15T00:00:00.000Z'))
    const unchanged = runMaintenance(
      repriced.store,
      new Date('2024-01-15T00:00:00.000Z'),
    )
    expect(unchanged.changed).toBe(false)
  })

  it('does not resettle an already-settled bet or duplicate notifications on rerun', () => {
    const firstRun = runMaintenance(baseStore, new Date('2024-03-01T00:00:00.000Z'))
    const secondRun = runMaintenance(
      firstRun.store,
      new Date('2024-03-02T00:00:00.000Z'),
    )

    expect(firstRun.store.bets[0]?.status).toBe('won')
    expect(secondRun.changed).toBe(false)
    expect(secondRun.store.bets[0]).toEqual(firstRun.store.bets[0])
    expect(secondRun.store.notifications).toEqual(firstRun.store.notifications)
  })

  it('leaves bets open when their market is missing or still pending', () => {
    const result = runMaintenance(
      {
        ...baseStore,
        markets: [
          {
            ...baseStore.markets[0]!,
            promisedDate: '2024-04-01T00:00:00.000Z',
            lastCheckedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        bets: [
          {
            ...baseStore.bets[0]!,
            marketId: 'missing-market',
          },
          {
            ...baseStore.bets[0]!,
            id: 'bet-2',
            marketId: 'market-1',
          },
        ],
        notifications: [],
      },
      new Date('2024-01-15T00:00:00.000Z'),
    )

    expect(result.changed).toBe(true)
    expect(result.store.bets.map((bet) => bet.status)).toEqual(['open', 'open'])
    expect(result.store.notifications).toHaveLength(0)
  })

  it('throws when resolving a missing or already-settled market', () => {
    expect(() =>
      resolveMarket(
        baseStore,
        'missing',
        'missed',
        'No delivery signal.',
        new Date('2024-01-31T00:00:00.000Z'),
      ),
    ).toThrow('Market not found.')

    const settled = runMaintenance(
      baseStore,
      new Date('2024-03-01T00:00:00.000Z'),
    ).store

    expect(() =>
      resolveMarket(
        settled,
        'market-1',
        'delivered',
        'Shipped later.',
        new Date('2024-03-01T00:00:00.000Z'),
      ),
    ).toThrow('This market is already settled.')
  })

  it('persists changed and unchanged maintenance loads', async () => {
    const context = await setupApiContext()

    const changed = await context.maintenance.loadMaintainedStore(
      new Date('2027-01-02T00:00:00.000Z'),
    )
    const unchanged = await context.maintenance.loadMaintainedStore(
      new Date('2020-01-01T00:00:00.000Z'),
    )
    const unchangedAgain = await context.maintenance.loadMaintainedStore(
      new Date('2020-01-01T00:00:00.000Z'),
    )

    expect(changed.metadata.lastMaintenanceRunAt).not.toBeNull()
    expect(unchanged.markets.length).toBeGreaterThan(0)
    expect(unchangedAgain.metadata.lastMaintenanceRunAt).toBe(
      unchanged.metadata.lastMaintenanceRunAt,
    )

    await context.pool.end()
  })

  it('purges stale auth records through the maintenance load path', async () => {
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent({
      handle: 'maintenance_cleanup_bot',
      displayName: 'Maintenance Cleanup Bot',
      ownerName: 'Human Owner',
      modelProvider: 'OpenAI',
      biography:
        'Systematic counter-bettor that tracks deadlines and fades optimistic timelines.',
      captchaChallengeId: challenge.id,
      captchaAnswer: solveCaptcha(challenge.prompt),
    })

    await context.pool.query(
      `
        UPDATE agent_accounts
        SET created_at = '2026-03-15T00:00:00.000Z',
            updated_at = '2026-03-15T00:00:00.000Z'
        WHERE id = $1
      `,
      [registration.agent.id],
    )
    await context.pool.query(
      `
        INSERT INTO owner_sessions (
          token,
          owner_email,
          created_at,
          expires_at,
          last_seen_at
        )
        VALUES (
          'owner_session_cleanup_maintenance',
          'cleanup@example.com',
          '2026-03-15T00:00:00.000Z',
          '2026-03-15T00:00:00.000Z',
          '2026-03-15T00:00:00.000Z'
        )
      `,
    )

    await context.maintenance.loadMaintainedStore(
      new Date('2026-03-19T00:00:00.000Z'),
    )

    expect(
      await context.pool.query(
        `SELECT COUNT(*)::int AS count FROM agent_accounts WHERE id = $1`,
        [registration.agent.id],
      ),
    ).toMatchObject({ rows: [{ count: 0 }] })
    expect(
      await context.pool.query(
        `SELECT COUNT(*)::int AS count FROM owner_sessions WHERE token = 'owner_session_cleanup_maintenance'`,
      ),
    ).toMatchObject({ rows: [{ count: 0 }] })

    await context.pool.end()
  })
})
