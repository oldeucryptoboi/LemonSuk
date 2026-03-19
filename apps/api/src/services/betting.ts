import { randomUUID } from 'node:crypto'

import { betSlipSchema, type BetSlip, type StoreData } from '../shared'
import { calculateGlobalBonus, calculateProjectedPayout } from './bonus'
import { runMaintenance } from './maintenance'
import {
  applyPricingEngine,
  calculateMarketExposure,
  resolveMarketRiskPolicy,
} from './pricing'

const repeatBetCooldownMs = 60_000

function formatCredits(value: number): string {
  return Number(value.toFixed(2)).toString()
}

function enforceBettingRiskRules(
  store: StoreData,
  userId: string,
  market: StoreData['markets'][number],
  stakeCredits: number,
  globalBonusPercent: number,
  now: Date,
): void {
  const policy = resolveMarketRiskPolicy(market)
  const marketMaxStake = market.maxStakeCredits ?? policy.maxStakeCredits
  const marketMaxLiability =
    market.maxLiabilityCredits ?? policy.maxLiabilityCredits
  const perAgentExposureCap =
    market.perAgentExposureCapCredits ?? policy.perAgentExposureCapCredits

  if (market.bettingSuspended) {
    throw new Error(
      market.suspensionReason ?? 'This market is suspended for new tickets.',
    )
  }

  if (stakeCredits > marketMaxStake) {
    throw new Error(
      `Stake exceeds the current market max of ${formatCredits(marketMaxStake)} credits.`,
    )
  }

  const agentOpenStake = store.bets
    .filter(
      (bet) =>
        bet.userId === userId &&
        bet.marketId === market.id &&
        bet.status === 'open',
    )
    .reduce((total, bet) => total + bet.stakeCredits, 0)

  if (agentOpenStake + stakeCredits > perAgentExposureCap) {
    throw new Error(
      `Agent exposure exceeds the current market cap of ${formatCredits(perAgentExposureCap)} credits.`,
    )
  }

  const recentSameMarketBet = store.bets.find(
    (bet) =>
      bet.userId === userId &&
      bet.marketId === market.id &&
      now.getTime() - Date.parse(bet.placedAt) < repeatBetCooldownMs,
  )
  if (recentSameMarketBet) {
    throw new Error('Wait 60 seconds before placing another ticket on this market.')
  }

  const exposure = calculateMarketExposure(store, market.id)
  const projectedPayoutCredits = calculateProjectedPayout(
    stakeCredits,
    market.payoutMultiplier,
    globalBonusPercent,
  )
  if (exposure.liabilityCredits + projectedPayoutCredits > marketMaxLiability) {
    throw new Error(
      `This market is at its liability cap of ${formatCredits(marketMaxLiability)} credits.`,
    )
  }
}

export function placeAgainstBetForUser(
  store: StoreData,
  userId: string,
  marketId: string,
  stakeCredits: number,
  now: Date,
): { store: StoreData; bet: BetSlip } {
  const maintainedStore = runMaintenance(store, now).store
  const market = maintainedStore.markets.find((entry) => entry.id === marketId)

  if (
    !market ||
    market.status !== 'open' ||
    (!market.betWindowOpen && !market.bettingSuspended)
  ) {
    throw new Error('This market is closed.')
  }

  const globalBonusPercent = calculateGlobalBonus(maintainedStore.markets)
  enforceBettingRiskRules(
    maintainedStore,
    userId,
    market,
    stakeCredits,
    globalBonusPercent,
    now,
  )
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

  const withBet = {
    ...maintainedStore,
    bets: [bet, ...maintainedStore.bets],
  }

  return {
    bet,
    store: applyPricingEngine(withBet, now, {
      reason: 'bet',
      triggerMarketId: marketId,
      triggerBetId: bet.id,
    }).store,
  }
}
