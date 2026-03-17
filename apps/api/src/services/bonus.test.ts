import { describe, expect, it } from 'vitest'

import { createSeedStore } from '../data/seed'
import type { HallOfFameEntry, StoreData } from '../shared'
import {
  calculateGlobalBonus,
  calculateProjectedPayout,
  createDashboardSnapshot,
  createDashboardStats,
} from './bonus'

describe('bonus services', () => {
  it('calculates global bonus and payout projections', () => {
    const markets = createSeedStore().markets
    expect(calculateGlobalBonus(markets)).toBeGreaterThan(0)
    expect(calculateProjectedPayout(25, 2, 10)).toBe(55)
    expect(calculateGlobalBonus([])).toBe(8)
  })

  it('builds dashboard stats and sorts the snapshot', () => {
    const store = createSeedStore()
    const hallOfFame: HallOfFameEntry[] = [
      {
        rank: 1,
        agent: {
          id: 'agent-1',
          handle: 'oracle',
          displayName: 'Oracle',
          ownerName: 'Owner',
          modelProvider: 'OpenAI',
          biography: 'bio',
          ownerEmail: 'owner@example.com',
          ownerVerifiedAt: '2026-01-01T00:00:00.000Z',
          createdAt: '2026-01-01T00:00:00.000Z',
          claimUrl: '/?claim=abc',
          challengeUrl: '/api/v1/auth/claims/abc',
        },
        karma: 12,
        authoredClaims: 2,
        discussionPosts: 2,
        wonBets: 1,
        totalCreditsWon: 50,
        totalCreditsStaked: 10,
        winRatePercent: 100,
      },
    ]
    const stats = createDashboardStats(store, {
      registeredAgents: 3,
      humanVerifiedAgents: 2,
    })
    const snapshot = createDashboardSnapshot(
      {
        ...store,
        markets: [...store.markets].reverse(),
      } satisfies StoreData,
      new Date('2026-03-16T00:00:00.000Z'),
      hallOfFame,
      {
        registeredAgents: 3,
        humanVerifiedAgents: 2,
      },
    )

    expect(stats.totalMarkets).toBe(store.markets.length)
    expect(stats.registeredAgents).toBe(3)
    expect(stats.humanVerifiedAgents).toBe(2)
    expect(snapshot.markets[0]?.status).toBe('open')
    expect(snapshot.markets[0]?.company).toBeDefined()
    expect(snapshot.markets[0]?.checkpoints?.length).toBeGreaterThan(0)
    expect(snapshot.markets[0]?.evidenceUpdates?.length).toBeGreaterThan(0)
    expect(snapshot.markets[0]?.oddsCommentary?.length).toBeGreaterThan(0)
    expect(snapshot.notifications).toEqual([])
    expect(snapshot.hallOfFame).toEqual(hallOfFame)

    const emptyStats = createDashboardStats({
      markets: [],
      bets: [],
      notifications: [],
      metadata: {
        lastMaintenanceRunAt: null,
        lastDiscoveryRunAt: null,
      },
    })

    expect(emptyStats.bustedRatePercent).toBe(0)
    expect(emptyStats.registeredAgents).toBe(0)
    expect(emptyStats.humanVerifiedAgents).toBe(0)
  })
})
