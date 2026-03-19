import { describe, expect, it } from 'vitest'

import { createSeedStore } from '../data/seed'
import { calculateGlobalBonus, calculateProjectedPayout } from './bonus'
import { placeAgainstBetForUser } from './betting'
import { runMaintenance } from './maintenance'
import { applyPricingEngine } from './pricing'

describe('placeAgainstBetForUser', () => {
  it('writes a bet in credits for an open market and snapshots the live pricing inputs', () => {
    const now = new Date('2026-03-16T00:00:00.000Z')
    const store = createSeedStore()
    const maintainedStore = runMaintenance(store, now).store
    const market = maintainedStore.markets.find(
      (entry) => entry.id === 'cybercab-volume-2026',
    )
    const globalBonus = calculateGlobalBonus(maintainedStore.markets)
    const originalBetCount = store.bets.length

    const result = placeAgainstBetForUser(
      store,
      'agent-1',
      'cybercab-volume-2026',
      90,
      now,
    )

    expect(result.bet.userId).toBe('agent-1')
    expect(result.bet.stakeCredits).toBe(90)
    expect(result.bet.settledPayoutCredits).toBeNull()
    expect(result.bet.payoutMultiplierAtPlacement).toBe(market?.payoutMultiplier)
    expect(result.bet.globalBonusPercentAtPlacement).toBe(globalBonus)
    expect(result.bet.projectedPayoutCredits).toBe(
      calculateProjectedPayout(
        90,
        market?.payoutMultiplier ?? 0,
        globalBonus,
      ),
    )
    expect(result.store.bets[0]?.id).toBe(result.bet.id)
    expect(result.store.bets).toHaveLength(originalBetCount + 1)
    expect(store.bets).toHaveLength(originalBetCount)
    expect(
      result.store.markets.find((entry) => entry.id === 'cybercab-volume-2026')
        ?.payoutMultiplier,
    ).toBeLessThan(result.bet.payoutMultiplierAtPlacement)
  })

  it('matches the pricing engine output after appending the new open ticket', () => {
    const now = new Date('2026-03-16T00:00:00.000Z')
    const store = createSeedStore()
    const maintainedStore = runMaintenance(store, now).store

    const result = placeAgainstBetForUser(
      store,
      'agent-1',
      'optimus-customizable-2026',
      90,
      now,
    )

    const expected = applyPricingEngine(
      {
        ...maintainedStore,
        bets: [result.bet, ...maintainedStore.bets],
      },
      now,
    )

    const actualMarket = result.store.markets.find(
      (entry) => entry.id === 'optimus-customizable-2026',
    )!
    const expectedMarket = expected.store.markets.find(
      (entry) => entry.id === 'optimus-customizable-2026',
    )!

    expect(actualMarket.payoutMultiplier).toBe(expectedMarket.payoutMultiplier)
    expect(actualMarket.currentOpenInterestCredits).toBe(
      expectedMarket.currentOpenInterestCredits,
    )
    expect(actualMarket.currentLiabilityCredits).toBe(
      expectedMarket.currentLiabilityCredits,
    )
    expect(actualMarket.maxStakeCredits).toBe(expectedMarket.maxStakeCredits)
    expect(actualMarket.maxLiabilityCredits).toBe(
      expectedMarket.maxLiabilityCredits,
    )
    expect(actualMarket.betWindowOpen).toBe(expectedMarket.betWindowOpen)
    expect(actualMarket.lineHistory?.[0]).toMatchObject({
      previousPayoutMultiplier: expectedMarket.previousPayoutMultiplier,
      nextPayoutMultiplier: actualMarket.payoutMultiplier,
      reason: 'bet',
      triggerBetId: result.bet.id,
    })
  })

  it('tightens the market further on sequential bets while each ticket keeps its own locked line', () => {
    const now = new Date('2026-03-16T00:00:00.000Z')
    const first = placeAgainstBetForUser(
      createSeedStore(),
      'agent-1',
      'optimus-customizable-2026',
      45,
      now,
    )
    const lineAfterFirst = first.store.markets.find(
      (market) => market.id === 'optimus-customizable-2026',
    )!.payoutMultiplier

    const second = placeAgainstBetForUser(
      first.store,
      'agent-2',
      'optimus-customizable-2026',
      45,
      new Date('2026-03-16T00:00:05.000Z'),
    )
    const lineAfterSecond = second.store.markets.find(
      (market) => market.id === 'optimus-customizable-2026',
    )!.payoutMultiplier

    expect(first.bet.payoutMultiplierAtPlacement).toBeGreaterThan(lineAfterFirst)
    expect(second.bet.payoutMultiplierAtPlacement).toBe(lineAfterFirst)
    expect(lineAfterSecond).toBeLessThan(lineAfterFirst)
  })

  it('rejects a closed market', () => {
    const now = new Date('2026-03-16T00:00:00.000Z')
    const store = createSeedStore()

    expect(() =>
      placeAgainstBetForUser(
        store,
        'agent-1',
        'robotaxi-million-2020',
        25,
        now,
      ),
    ).toThrow('This market is closed.')
  })

  it('allows placement when maintenance reopens a stale bet window before the deadline', () => {
    const now = new Date('2026-03-16T00:00:00.000Z')
    const store = createSeedStore()
    const gatedStore = {
      ...store,
      markets: store.markets.map((market) =>
        market.id === 'cybercab-volume-2026'
          ? {
              ...market,
              betWindowOpen: false,
            }
          : market,
      ),
    }

    const result = placeAgainstBetForUser(
      gatedStore,
      'agent-1',
      'cybercab-volume-2026',
      25,
      now,
    )

    expect(result.bet.marketId).toBe('cybercab-volume-2026')
    expect(
      result.store.markets.find((market) => market.id === 'cybercab-volume-2026')
        ?.betWindowOpen,
    ).toBe(true)
  })

  it('rejects an open market whose deadline has already passed at placement time', () => {
    const now = new Date('2026-03-16T00:00:00.000Z')
    const store = createSeedStore()
    const expiredStore = {
      ...store,
      markets: store.markets.map((market) =>
        market.id === 'cybercab-volume-2026'
          ? {
              ...market,
              promisedDate: '2026-03-01T23:59:59.000Z',
              status: 'open' as const,
              resolution: 'pending' as const,
              betWindowOpen: true,
            }
          : market,
      ),
    }

    expect(() =>
      placeAgainstBetForUser(
        expiredStore,
        'agent-1',
        'cybercab-volume-2026',
        25,
        now,
      ),
    ).toThrow('This market is closed.')
  })

  it('rejects a missing market id', () => {
    const now = new Date('2026-03-16T00:00:00.000Z')
    const store = createSeedStore()

    expect(() =>
      placeAgainstBetForUser(store, 'agent-1', 'missing-market', 25, now),
    ).toThrow('This market is closed.')
  })

  it('rejects a stake above the current market max', () => {
    const now = new Date('2026-03-16T00:00:00.000Z')

    expect(() =>
      placeAgainstBetForUser(
        createSeedStore(),
        'agent-1',
        'openai-device-2026',
        61,
        now,
      ),
    ).toThrow('Stake exceeds the current market max of 60 credits.')
  })

  it('rejects repeat tickets inside the same-market cooldown window', () => {
    const now = new Date('2026-03-16T00:00:00.000Z')
    const first = placeAgainstBetForUser(
      createSeedStore(),
      'agent-1',
      'openai-device-2026',
      15,
      now,
    )

    expect(() =>
      placeAgainstBetForUser(
        first.store,
        'agent-1',
        'openai-device-2026',
        15,
        new Date('2026-03-16T00:00:30.000Z'),
      ),
    ).toThrow('Wait 60 seconds before placing another ticket on this market.')
  })

  it('rejects agent exposure above the per-market cap', () => {
    const now = new Date('2026-03-16T00:00:00.000Z')
    const store = createSeedStore()
    const cappedStore = {
      ...store,
      bets: [
        {
          id: 'bet-existing-exposure',
          userId: 'agent-1',
          marketId: 'openai-device-2026',
          stakeCredits: 90,
          side: 'against' as const,
          status: 'open' as const,
          payoutMultiplierAtPlacement: 1.32,
          globalBonusPercentAtPlacement: 24,
          projectedPayoutCredits: 147.31,
          settledPayoutCredits: null,
          placedAt: '2026-03-15T23:00:00.000Z',
          settledAt: null,
        },
        ...store.bets,
      ],
    }

    expect(() =>
      placeAgainstBetForUser(
        cappedStore,
        'agent-1',
        'openai-device-2026',
        5,
        now,
      ),
    ).toThrow('Agent exposure exceeds the current market cap of 90 credits.')
  })

  it('rejects tickets that would push the book through the liability cap', () => {
    const now = new Date('2026-03-16T00:00:00.000Z')
    const store = createSeedStore()
    const crowdedStore = {
      ...store,
      bets: [
        {
          id: 'bet-existing-liability',
          userId: 'agent-2',
          marketId: 'openai-device-2026',
          stakeCredits: 55,
          side: 'against' as const,
          status: 'open' as const,
          payoutMultiplierAtPlacement: 1.63,
          globalBonusPercentAtPlacement: 24,
          projectedPayoutCredits: 222.55,
          settledPayoutCredits: null,
          placedAt: '2026-03-15T22:00:00.000Z',
          settledAt: null,
        },
        ...store.bets,
      ],
    }

    expect(() =>
      placeAgainstBetForUser(
        crowdedStore,
        'agent-1',
        'openai-device-2026',
        15,
        now,
      ),
    ).toThrow('This market is at its liability cap of 240 credits.')
  })

  it('surfaces suspension reasons during the settlement grace window', () => {
    const store = createSeedStore()

    expect(() =>
      placeAgainstBetForUser(
        store,
        'agent-1',
        'optimus-customizable-2026',
        15,
        new Date('2027-01-01T01:00:00.000Z'),
      ),
    ).toThrow('Settlement grace window is active while the book waits for delivery evidence.')
  })
})
