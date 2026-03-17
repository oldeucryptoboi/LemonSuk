import { randomUUID } from 'node:crypto'

import { betSlipSchema, type BetSlip, type StoreData } from '../shared'
import { calculateGlobalBonus, calculateProjectedPayout } from './bonus'
import { runMaintenance } from './maintenance'

export function placeAgainstBetForUser(
  store: StoreData,
  userId: string,
  marketId: string,
  stakeCredits: number,
  now: Date,
): { store: StoreData; bet: BetSlip } {
  const maintainedStore = runMaintenance(store, now).store
  const market = maintainedStore.markets.find((entry) => entry.id === marketId)

  if (!market || market.status !== 'open' || !market.betWindowOpen) {
    throw new Error('This market is closed.')
  }

  const globalBonusPercent = calculateGlobalBonus(maintainedStore.markets)
  const bet = betSlipSchema.parse({
    id: `bet-${randomUUID()}`,
    userId,
    marketId,
    stakeCredits,
    side: 'against',
    status: 'open',
    payoutMultiplierAtPlacement: market.payoutMultiplier,
    globalBonusPercentAtPlacement: globalBonusPercent,
    projectedPayoutCredits: calculateProjectedPayout(
      stakeCredits,
      market.payoutMultiplier,
      globalBonusPercent,
    ),
    settledPayoutCredits: null,
    placedAt: now.toISOString(),
    settledAt: null,
  })

  return {
    bet,
    store: {
      ...maintainedStore,
      bets: [bet, ...maintainedStore.bets],
    },
  }
}
