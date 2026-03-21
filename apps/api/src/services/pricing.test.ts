import { describe, expect, it } from 'vitest'

import type { StoreData } from '../shared'
import { createSeedStore } from '../data/seed'
import {
  applyPricingEngine,
  calculateMarketExposure,
  calculateLivePayoutMultiplier,
  calculateSettlementState,
  inferPricingFamilySlug,
  resolveMarketRiskPolicy,
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

  it('applies family-specific limits and grace windows to the live board', () => {
    const repriced = applyPricingEngine(
      createSeedStore(),
      new Date('2026-03-16T00:00:00.000Z'),
    ).store
    const aiMarket = repriced.markets.find((entry) => entry.id === 'openai-device-2026')!
    const productMarket = repriced.markets.find(
      (entry) => entry.id === 'optimus-customizable-2026',
    )!

    expect(inferPricingFamilySlug(aiMarket)).toBe('ai_launch')
    expect(inferPricingFamilySlug(productMarket)).toBe('product_ship_date')
    expect(aiMarket.maxStakeCredits).toBe(resolveMarketRiskPolicy(aiMarket).maxStakeCredits)
    expect(productMarket.maxStakeCredits).toBe(
      resolveMarketRiskPolicy(productMarket).maxStakeCredits,
    )
    expect(aiMarket.maxStakeCredits).toBeLessThan(productMarket.maxStakeCredits!)
    expect(aiMarket.settlementGraceHours).toBe(
      resolveMarketRiskPolicy(aiMarket).settlementGraceHours,
    )
    expect(productMarket.settlementGraceHours).toBe(
      resolveMarketRiskPolicy(productMarket).settlementGraceHours,
    )
    expect(
      inferPricingFamilySlug({
        ...productMarket,
        headline: 'Tesla holds its 2026 earnings guidance',
        summary: 'The board is tracking a clear earnings guidance claim.',
        company: 'tesla',
      }),
    ).toBe('earnings_guidance')
    expect(
      inferPricingFamilySlug({
        ...productMarket,
        headline: 'A CEO claim market',
        summary: 'The creator says the launch lands this quarter.',
        category: 'social',
        company: 'x',
      }),
    ).toBe('ceo_claim')
  })

  it('tracks liability, suspends near-cap markets, and records line history', () => {
    const store = createPricingStore()
    const market = store.markets.find((entry) => entry.id === 'cybercab-volume-2026')!
    const policy = resolveMarketRiskPolicy(market)
    const exposure = calculateMarketExposure(store, market.id)
    const liabilityHeavyStore: StoreData = {
      ...store,
      bets: [
        ...store.bets,
        {
          id: 'bet-cap-heavy',
          userId: 'agent-3',
          marketId: market.id,
          stakeCredits: 40,
          side: 'against',
          status: 'open',
          payoutMultiplierAtPlacement: market.payoutMultiplier,
          globalBonusPercentAtPlacement: 18,
          projectedPayoutCredits: Math.max(
            1,
            policy.maxLiabilityCredits - exposure.liabilityCredits + 12,
          ),
          settledPayoutCredits: null,
          placedAt: '2026-06-03T00:00:00.000Z',
          settledAt: null,
        },
      ],
    }

    const repriced = applyPricingEngine(
      liabilityHeavyStore,
      new Date('2026-12-30T00:00:00.000Z'),
      {
        reason: 'bet',
        triggerMarketId: market.id,
        triggerBetId: 'bet-cap-heavy',
      },
    ).store
    const repricedMarket = repriced.markets.find((entry) => entry.id === market.id)!

    expect(repricedMarket.currentLiabilityCredits).toBeGreaterThanOrEqual(
      policy.maxLiabilityCredits,
    )
    expect(repricedMarket.bettingSuspended).toBe(true)
    expect(repricedMarket.suspensionReason).toContain('exposure cap')
    expect(repricedMarket.lineHistory?.[0]).toMatchObject({
      reason: 'suspension',
      triggerBetId: 'bet-cap-heavy',
    })
  })

  it('records a bet-driven line move without a trigger bet id when only the market is known', () => {
    const store = createSeedStore()
    const market = store.markets.find(
      (entry) => entry.id === 'optimus-customizable-2026',
    )!

    const repriced = applyPricingEngine(
      store,
      new Date('2026-12-30T00:00:00.000Z'),
      {
        reason: 'bet',
        triggerMarketId: market.id,
      },
    ).store

    expect(repriced.markets.find((entry) => entry.id === market.id)?.lineHistory?.[0])
      .toMatchObject({
        reason: 'bet',
        triggerBetId: null,
      })
  })

  it('moves markets into grace after the deadline and out again after settlement', () => {
    const store = createSeedStore()
    const market = store.markets.find((entry) => entry.id === 'optimus-customizable-2026')!
    const policy = resolveMarketRiskPolicy(market)
    const inGrace = new Date(Date.parse(market.promisedDate) + 60 * 60 * 1000)

    expect(calculateSettlementState(market, inGrace, policy)).toBe('grace')

    const repriced = applyPricingEngine(store, inGrace).store
    const repricedMarket = repriced.markets.find((entry) => entry.id === market.id)!

    expect(repricedMarket.settlementState).toBe('grace')
    expect(repricedMarket.betWindowOpen).toBe(false)
    expect(repricedMarket.bettingSuspended).toBe(true)
    expect(repricedMarket.suspensionReason).toContain('grace window')
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

  it('tracks worst-case liability and widens the against line when for-side exposure dominates a binary market', () => {
    const store = createSeedStore()
    const binaryStore: StoreData = {
      ...store,
      markets: store.markets.map((market) =>
        market.id === 'openai-device-2026'
          ? {
              ...market,
              betMode: 'binary',
            }
          : market,
      ),
      bets: [
        ...store.bets,
        {
          id: 'bet-for-pressure',
          userId: 'agent-1',
          marketId: 'openai-device-2026',
          stakeCredits: 20,
          side: 'for',
          status: 'open',
          payoutMultiplierAtPlacement: 2.55,
          globalBonusPercentAtPlacement: 24,
          projectedPayoutCredits: 63.24,
          settledPayoutCredits: null,
          placedAt: '2026-03-16T00:00:00.000Z',
          settledAt: null,
        },
      ],
    }
    const market = binaryStore.markets.find((entry) => entry.id === 'openai-device-2026')!
    const exposure = calculateMarketExposure(binaryStore, market.id)
    const repriced = applyPricingEngine(
      binaryStore,
      new Date('2026-03-16T00:00:00.000Z'),
      {
        reason: 'bet',
        triggerMarketId: market.id,
        triggerBetId: 'bet-for-pressure',
      },
    ).store
    const repricedMarket = repriced.markets.find((entry) => entry.id === market.id)!

    expect(exposure.liabilityCredits).toBe(63.24)
    expect(exposure.liabilityCreditsBySide.for).toBe(63.24)
    expect(exposure.liabilityCreditsBySide.against).toBe(0)
    expect(repricedMarket.payoutMultiplier).toBeGreaterThan(market.payoutMultiplier)
  })
})
