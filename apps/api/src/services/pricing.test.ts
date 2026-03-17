import { describe, expect, it } from 'vitest'

import type { StoreData } from '../shared'
import { createSeedStore } from '../data/seed'
import {
  applyPricingEngine,
  calculateLivePayoutMultiplier,
} from './pricing'

function createPricingStore(): StoreData {
  const seeded = createSeedStore()

  return {
    ...seeded,
    markets: seeded.markets.map((market) =>
      market.id === 'cybercab-volume-2026'
        ? {
            ...market,
            payoutMultiplier: market.basePayoutMultiplier,
          }
        : market.id === 'robotaxi-unveil-2024'
          ? {
              ...market,
              status: 'busted',
              resolution: 'missed',
              betWindowOpen: false,
            }
          : market,
    ),
    bets: [
      ...seeded.bets,
      {
        id: 'bet-book-pressure-1',
        userId: 'agent-1',
        marketId: 'cybercab-volume-2026',
        stakeCredits: 120,
        side: 'against',
        status: 'open',
        payoutMultiplierAtPlacement: 1.85,
        globalBonusPercentAtPlacement: 18,
        projectedPayoutCredits: 261.96,
        settledPayoutCredits: null,
        placedAt: '2026-06-01T00:00:00.000Z',
        settledAt: null,
      },
      {
        id: 'bet-book-pressure-2',
        userId: 'agent-2',
        marketId: 'cybercab-volume-2026',
        stakeCredits: 60,
        side: 'against',
        status: 'open',
        payoutMultiplierAtPlacement: 1.85,
        globalBonusPercentAtPlacement: 18,
        projectedPayoutCredits: 130.98,
        settledPayoutCredits: null,
        placedAt: '2026-06-02T00:00:00.000Z',
        settledAt: null,
      },
    ],
  }
}

describe('pricing engine', () => {
  it('reprices open markets using history, time pressure, and live open interest', () => {
    const store = createPricingStore()
    const market = store.markets.find((entry) => entry.id === 'cybercab-volume-2026')!

    const liveMultiplier = calculateLivePayoutMultiplier(
      market,
      store,
      new Date('2026-12-30T00:00:00.000Z'),
    )

    expect(liveMultiplier).toBeLessThan(market.basePayoutMultiplier)
    expect(liveMultiplier).toBeGreaterThanOrEqual(1.12)
  })

  it('leaves a store untouched when no market price changes are needed', () => {
    const repriced = applyPricingEngine(
      createPricingStore(),
      new Date('2026-12-30T00:00:00.000Z'),
    )
    const unchanged = applyPricingEngine(
      repriced.store,
      new Date('2026-12-30T00:00:00.000Z'),
    )

    expect(repriced.changed).toBe(true)
    expect(unchanged.changed).toBe(false)
  })
})
