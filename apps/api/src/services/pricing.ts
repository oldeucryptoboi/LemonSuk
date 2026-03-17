import type { Market, StoreData } from '../shared'
import { storeSchema } from '../shared'
import { clamp } from './utils'

const dayMs = 1000 * 60 * 60 * 24

export type PricingSignals = {
  historicalMissRate: number
  timePressure: number
  demandPressure: number
  linkedMissPressure: number
  uncertaintyLift: number
}

function countOpenTickets(store: StoreData, marketId: string): number {
  return store.bets.filter(
    (bet) => bet.marketId === marketId && bet.status === 'open',
  ).length
}

function sumOpenInterest(store: StoreData, marketId: string): number {
  return store.bets
    .filter((bet) => bet.marketId === marketId && bet.status === 'open')
    .reduce((total, bet) => total + bet.stakeCredits, 0)
}

function calculateHistoricalMissRate(
  store: StoreData,
  market: Market,
): number {
  const comparable = store.markets.filter(
    (entry) =>
      entry.id !== market.id &&
      entry.resolution !== 'pending' &&
      (entry.subject === market.subject || entry.category === market.category),
  )

  if (comparable.length === 0) {
    return 0.5
  }

  return (
    comparable.filter((entry) => entry.resolution === 'missed').length /
    comparable.length
  )
}

function calculateTimePressure(market: Market, now: Date): number {
  const msRemaining = Date.parse(market.promisedDate) - now.getTime()
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / dayMs))

  return clamp(1 - daysRemaining / 540, 0, 1)
}

function calculateDemandPressure(store: StoreData, market: Market): number {
  const openInterestCredits = sumOpenInterest(store, market.id)
  const openTicketCount = countOpenTickets(store, market.id)

  return clamp(
    (openInterestCredits / 240) * 0.7 + (openTicketCount / 6) * 0.3,
    0,
    1,
  )
}

function calculateLinkedMissPressure(store: StoreData, market: Market): number {
  if (market.linkedMarketIds.length === 0) {
    return 0
  }

  const linkedMisses = market.linkedMarketIds.filter((linkedMarketId) =>
    store.markets.some(
      (entry) =>
        entry.id === linkedMarketId && entry.resolution === 'missed',
    ),
  ).length

  return linkedMisses / market.linkedMarketIds.length
}

export function calculatePricingSignals(
  market: Market,
  store: StoreData,
  now: Date,
): PricingSignals {
  return {
    historicalMissRate: calculateHistoricalMissRate(store, market),
    timePressure: calculateTimePressure(market, now),
    demandPressure: calculateDemandPressure(store, market),
    linkedMissPressure: calculateLinkedMissPressure(store, market),
    uncertaintyLift: clamp((100 - market.confidence) / 100, 0, 1),
  }
}

export function buildPricingCommentary(
  market: Market,
  store: StoreData,
  now: Date,
): string[] {
  const signals = calculatePricingSignals(market, store, now)
  const commentary: string[] = []

  if (signals.timePressure >= 0.68) {
    commentary.push(
      'Deadline pressure is high, so the live line is tightening into the closing stretch.',
    )
  }
  if (signals.historicalMissRate >= 0.6) {
    commentary.push(
      'Comparable Musk timelines in this lane have mostly missed, which compresses the payout.',
    )
  }
  if (signals.demandPressure >= 0.28) {
    commentary.push(
      'Counter-bet demand is building on this card, trimming the premium still left in the book.',
    )
  }
  if (signals.linkedMissPressure > 0) {
    commentary.push(
      'Related cards have already busted, and that miss history is dragging this market tighter too.',
    )
  }
  if (signals.uncertaintyLift >= 0.18) {
    commentary.push(
      'Source certainty is still imperfect here, so the engine keeps some uncertainty premium in the price.',
    )
  }

  if (commentary.length === 0) {
    commentary.push(
      'The line is still trading close to its seeded base because the board has little deadline or flow pressure on it yet.',
    )
  }

  return commentary
}

export function calculateLivePayoutMultiplier(
  market: Market,
  store: StoreData,
  now: Date,
): number {
  if (market.status !== 'open') {
    return market.payoutMultiplier
  }

  const {
    historicalMissRate,
    timePressure,
    demandPressure,
    linkedMissPressure,
    uncertaintyLift,
  } = calculatePricingSignals(market, store, now)

  const repriced =
    market.basePayoutMultiplier *
    (1 - historicalMissRate * 0.18) *
    (1 - timePressure * 0.24) *
    (1 - demandPressure * 0.16) *
    (1 - linkedMissPressure * 0.12) *
    (1 + uncertaintyLift * 0.14)

  return Number(clamp(Number(repriced.toFixed(2)), 1.12, 4.2).toFixed(2))
}

export function applyPricingEngine(
  store: StoreData,
  now: Date,
): { store: StoreData; changed: boolean } {
  const nowIso = now.toISOString()
  let changed = false

  const markets = store.markets.map((market) => {
    const nextMultiplier = calculateLivePayoutMultiplier(market, store, now)
    if (nextMultiplier === market.payoutMultiplier) {
      return market
    }

    changed = true

    return {
      ...market,
      payoutMultiplier: nextMultiplier,
      updatedAt: nowIso,
      lastCheckedAt: nowIso,
    }
  })

  if (!changed) {
    return { store, changed }
  }

  return {
    changed,
    store: storeSchema.parse({
      ...store,
      markets,
    }),
  }
}
