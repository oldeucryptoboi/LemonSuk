import { describe, expect, it } from 'vitest'

import { createSeedStore } from '../data/seed'
import { setupApiContext } from '../../../../test/helpers/api-context'

describe('store service', () => {
  it('seeds, reads, persists, and tolerates missing metadata rows', async () => {
    const context = await setupApiContext()

    await context.store.ensureStore()
    const seeded = await context.store.readStore()

    expect(seeded.markets).toHaveLength(createSeedStore().markets.length)
    expect(seeded.bets).toHaveLength(0)
    expect(seeded.markets[0]?.sources.length).toBeGreaterThan(0)

    await context.pool.query(
      `
        INSERT INTO agent_accounts (
          id,
          handle,
          display_name,
          owner_name,
          model_provider,
          biography,
          api_key_hash,
          claim_token,
          verification_phrase,
          owner_email,
          owner_verified_at,
          created_at,
          updated_at
        )
        VALUES (
          'agent-1',
          'deadlinebot',
          'Deadline Bot',
          'Owner',
          'OpenAI',
          'Tracks missed deadlines.',
          'hash',
          'claim_1',
          'busted-oracle-42',
          NULL,
          NULL,
          '2026-03-16T00:00:00.000Z',
          '2026-03-16T00:00:00.000Z'
        )
      `,
    )

    await context.store.withStoreTransaction(async (store, persist) => {
      const persistedBet = {
        id: 'bet-1',
        userId: 'agent-1',
        marketId: store.markets[0]?.id ?? 'fsd-coast-to-coast-2017',
        stakeCredits: 20,
        side: 'against' as const,
        status: 'won' as const,
        payoutMultiplierAtPlacement: 2.45,
        globalBonusPercentAtPlacement: 18,
        projectedPayoutCredits: 57.82,
        settledPayoutCredits: 57.82,
        placedAt: '2026-03-16T00:30:00.000Z',
        settledAt: '2026-03-16T01:00:00.000Z',
      }
      const nextStore = {
        ...store,
        markets: store.markets.map((market, index) =>
          index === 0
            ? {
                ...market,
                author: {
                  id: 'agent-1',
                  handle: 'deadlinebot',
                  displayName: 'Deadline Bot',
                  avatarUrl: null,
                },
                sources: [],
                lineHistory: [
                  {
                    id: 'line-test-1',
                    movedAt: '2026-03-16T00:45:00.000Z',
                    previousPayoutMultiplier: 2.45,
                    nextPayoutMultiplier: 2.1,
                    reason: 'bet' as const,
                    commentary: 'Risk tightened after a live ticket.',
                    triggerBetId: 'bet-1',
                    openInterestCredits: 20,
                    liabilityCredits: 57.82,
                  },
                ],
              }
            : market,
        ),
        bets: [persistedBet],
        notifications: [
          {
            id: 'notification-test',
            userId: 'agent-1',
            marketId: store.markets[0]?.id ?? null,
            betId: persistedBet.id,
            type: 'system' as const,
            title: 'Store updated',
            body: 'Manual persistence check.',
            createdAt: '2026-03-16T00:00:00.000Z',
            readAt: '2026-03-16T02:00:00.000Z',
          },
        ],
        metadata: {
          ...store.metadata,
          lastDiscoveryRunAt: '2026-03-16T00:00:00.000Z',
        },
      }

      const persisted = await persist(nextStore)
      expect(persisted.notifications).toHaveLength(1)
      expect(persisted.metadata.lastDiscoveryRunAt).toBe(
        '2026-03-16T00:00:00.000Z',
      )
    })

    const reloaded = await context.store.readStore()
    const updatedMarket = reloaded.markets.find(
      (market) => market.id === seeded.markets[0]?.id,
    )
    expect(reloaded.notifications[0]?.title).toBe('Store updated')
    expect(reloaded.notifications[0]?.readAt).toBe('2026-03-16T02:00:00.000Z')
    expect(reloaded.metadata.lastDiscoveryRunAt).toBe(
      '2026-03-16T00:00:00.000Z',
    )
    expect(updatedMarket?.sources).toEqual([])
    expect(updatedMarket?.author?.handle).toBe('deadlinebot')
    expect(updatedMarket?.lineHistory?.[0]).toMatchObject({
      id: 'line-test-1',
      reason: 'bet',
      triggerBetId: 'bet-1',
    })
    expect(reloaded.bets[0]?.settledAt).toBe('2026-03-16T01:00:00.000Z')

    await context.pool.query('DELETE FROM app_metadata')

    const withoutMetadata = await context.store.readStore()
    expect(withoutMetadata.metadata.lastMaintenanceRunAt).toBeNull()
    expect(withoutMetadata.metadata.lastDiscoveryRunAt).toBeNull()

    await context.store.ensureStore()
    const afterSecondEnsure = await context.store.readStore()
    expect(afterSecondEnsure.markets).toHaveLength(
      withoutMetadata.markets.length,
    )

    await context.pool.query(
      `
        DELETE FROM markets
        WHERE id = 'x-payments-2024'
      `,
    )

    await context.store.ensureStore()
    const backfilled = await context.store.readStore()
    expect(
      backfilled.markets.some((market) => market.id === 'x-payments-2024'),
    ).toBe(true)

    await context.pool.end()
  })
})
