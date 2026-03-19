import { randomUUID } from 'node:crypto'

import type {
  Market,
  MarketLineHistoryEntry,
  MarketLineMoveReason,
  MarketSettlementState,
  PredictionFamily,
  StoreData,
} from '../shared'
import { storeSchema } from '../shared'
import { clamp } from './utils'

const dayMs = 1000 * 60 * 60 * 24
const lineHistoryLimit = 12
const defaultLineFloor = 1.12
const defaultLineCeiling = 4.2

type MarketRiskPolicy = {
  family: PredictionFamily['slug']
  displayName: string
  maxStakeCredits: number
  maxLiabilityCredits: number
  perAgentExposureCapCredits: number
  settlementGraceHours: number
  suspensionThreshold: number
  historicalMissWeight: number
  timePressureWeight: number
  demandWeight: number
  linkedMissWeight: number
  uncertaintyWeight: number
  liabilityWeight: number
}

type MarketExposure = {
  openTicketCount: number
  openInterestCredits: number
  liabilityCredits: number
}

export type PricingSignals = {
  historicalMissRate: number
  timePressure: number
  demandPressure: number
  linkedMissPressure: number
  uncertaintyLift: number
  liabilityPressure: number
}

export type PricingEngineEvent = {
  reason?: Extract<MarketLineMoveReason, 'bet' | 'maintenance'>
  triggerMarketId?: string | null
  triggerBetId?: string | null
}

const familyPolicies: Record<PredictionFamily['slug'], MarketRiskPolicy> = {
  ai_launch: {
    family: 'ai_launch',
    displayName: 'AI launch',
    maxStakeCredits: 60,
    maxLiabilityCredits: 240,
    perAgentExposureCapCredits: 90,
    settlementGraceHours: 24,
    suspensionThreshold: 0.95,
    historicalMissWeight: 0.12,
    timePressureWeight: 0.18,
    demandWeight: 0.22,
    linkedMissWeight: 0.08,
    uncertaintyWeight: 0.2,
    liabilityWeight: 0.26,
  },
  product_ship_date: {
    family: 'product_ship_date',
    displayName: 'Product ship date',
    maxStakeCredits: 100,
    maxLiabilityCredits: 360,
    perAgentExposureCapCredits: 150,
    settlementGraceHours: 72,
    suspensionThreshold: 0.96,
    historicalMissWeight: 0.18,
    timePressureWeight: 0.24,
    demandWeight: 0.16,
    linkedMissWeight: 0.12,
    uncertaintyWeight: 0.14,
    liabilityWeight: 0.2,
  },
  earnings_guidance: {
    family: 'earnings_guidance',
    displayName: 'Earnings / guidance',
    maxStakeCredits: 55,
    maxLiabilityCredits: 220,
    perAgentExposureCapCredits: 80,
    settlementGraceHours: 12,
    suspensionThreshold: 0.94,
    historicalMissWeight: 0.1,
    timePressureWeight: 0.16,
    demandWeight: 0.28,
    linkedMissWeight: 0.06,
    uncertaintyWeight: 0.1,
    liabilityWeight: 0.3,
  },
  policy_promise: {
    family: 'policy_promise',
    displayName: 'Policy promise',
    maxStakeCredits: 70,
    maxLiabilityCredits: 280,
    perAgentExposureCapCredits: 105,
    settlementGraceHours: 24,
    suspensionThreshold: 0.95,
    historicalMissWeight: 0.14,
    timePressureWeight: 0.2,
    demandWeight: 0.2,
    linkedMissWeight: 0.12,
    uncertaintyWeight: 0.18,
    liabilityWeight: 0.24,
  },
  ceo_claim: {
    family: 'ceo_claim',
    displayName: 'CEO / creator claim',
    maxStakeCredits: 65,
    maxLiabilityCredits: 250,
    perAgentExposureCapCredits: 95,
    settlementGraceHours: 24,
    suspensionThreshold: 0.95,
    historicalMissWeight: 0.16,
    timePressureWeight: 0.2,
    demandWeight: 0.2,
    linkedMissWeight: 0.08,
    uncertaintyWeight: 0.16,
    liabilityWeight: 0.24,
  },
}

function normalizeCredits(value: number): number {
  return Number(value.toFixed(2))
}

function marketHaystack(market: Market): string {
  return [
    market.headline,
    market.subject,
    market.summary,
    market.promisedBy,
    ...market.tags,
  ]
    .join(' ')
    .toLowerCase()
}

export function inferPricingFamilySlug(
  market: Market,
): PredictionFamily['slug'] {
  const haystack = marketHaystack(market)

  if (
    market.category === 'ai' ||
    market.company === 'xai' ||
    haystack.includes('openai') ||
    haystack.includes('chatgpt') ||
    haystack.includes('anthropic') ||
    haystack.includes('claude') ||
    haystack.includes('meta ai')
  ) {
    return 'ai_launch'
  }

  if (market.category === 'government' || market.company === 'doge') {
    return 'policy_promise'
  }

  if (
    haystack.includes('guidance') ||
    haystack.includes('earnings') ||
    haystack.includes('delivery target')
  ) {
    return 'earnings_guidance'
  }

  if (
    market.category === 'social' ||
    market.company === 'x' ||
    haystack.includes('ceo') ||
    haystack.includes('creator') ||
    haystack.includes('musk says')
  ) {
    return 'ceo_claim'
  }

  return 'product_ship_date'
}

export function resolveMarketRiskPolicy(market: Market): MarketRiskPolicy {
  return familyPolicies[inferPricingFamilySlug(market)]
}

export function calculateMarketExposure(
  store: StoreData,
  marketId: string,
): MarketExposure {
  const openBets = store.bets.filter(
    (bet) => bet.marketId === marketId && bet.status === 'open',
  )

  return {
    openTicketCount: openBets.length,
    openInterestCredits: normalizeCredits(
      openBets.reduce((total, bet) => total + bet.stakeCredits, 0),
    ),
    liabilityCredits: normalizeCredits(
      openBets.reduce(
        (total, bet) => total + bet.projectedPayoutCredits,
        0,
      ),
    ),
  }
}

function calculateHistoricalMissRate(
  store: StoreData,
  market: Market,
): number {
  const family = inferPricingFamilySlug(market)
  const comparable = store.markets.filter(
    (entry) =>
      entry.id !== market.id &&
      entry.resolution !== 'pending' &&
      (entry.subject === market.subject ||
        entry.category === market.category ||
        inferPricingFamilySlug(entry) === family),
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

function calculateDemandPressure(
  exposure: MarketExposure,
  policy: MarketRiskPolicy,
): number {
  return clamp(
    (exposure.openInterestCredits / policy.maxStakeCredits) * 0.7 +
      (exposure.openTicketCount / 6) * 0.3,
    0,
    1,
  )
}

function calculateLinkedMissPressure(
  store: StoreData,
  market: Market,
): number {
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

function calculateLiabilityPressure(
  exposure: MarketExposure,
  policy: MarketRiskPolicy,
): number {
  return clamp(exposure.liabilityCredits / policy.maxLiabilityCredits, 0, 1.25)
}

export function calculateAutoResolveAt(
  market: Market,
  policy: MarketRiskPolicy = resolveMarketRiskPolicy(market),
): Date {
  const graceHours = market.settlementGraceHours ?? policy.settlementGraceHours
  return new Date(
    Date.parse(market.promisedDate) + graceHours * 60 * 60 * 1000,
  )
}

export function calculateSettlementState(
  market: Market,
  now: Date,
  policy: MarketRiskPolicy = resolveMarketRiskPolicy(market),
): MarketSettlementState {
  if (market.status !== 'open' || market.resolution !== 'pending') {
    return 'settled'
  }

  const promisedAt = Date.parse(market.promisedDate)
  const autoResolveAt = calculateAutoResolveAt(market, policy).getTime()

  if (now.getTime() < promisedAt) {
    return 'live'
  }

  if (now.getTime() < autoResolveAt) {
    return 'grace'
  }

  return 'awaiting_operator'
}

export function calculatePricingSignals(
  market: Market,
  store: StoreData,
  now: Date,
): PricingSignals {
  const policy = resolveMarketRiskPolicy(market)
  const exposure = calculateMarketExposure(store, market.id)

  return {
    historicalMissRate: calculateHistoricalMissRate(store, market),
    timePressure: calculateTimePressure(market, now),
    demandPressure: calculateDemandPressure(exposure, policy),
    linkedMissPressure: calculateLinkedMissPressure(store, market),
    uncertaintyLift: clamp((100 - market.confidence) / 100, 0, 1),
    liabilityPressure: calculateLiabilityPressure(exposure, policy),
  }
}

export function buildPricingCommentary(
  market: Market,
  store: StoreData,
  now: Date,
): string[] {
  const policy = resolveMarketRiskPolicy(market)
  const exposure = calculateMarketExposure(store, market.id)
  const settlementState = calculateSettlementState(market, now, policy)
  const signals = calculatePricingSignals(market, store, now)
  const commentary: string[] = []

  if (settlementState === 'grace') {
    commentary.push(
      `This ${policy.displayName.toLowerCase()} market is in its settlement grace window, so betting is paused while the book waits for delivery evidence.`,
    )
  }
  if (signals.liabilityPressure >= policy.suspensionThreshold) {
    commentary.push(
      `House exposure is near the cap on this ${policy.displayName.toLowerCase()} market, so the book is tightening and may suspend new tickets.`,
    )
  }
  if (signals.timePressure >= 0.68) {
    commentary.push(
      `Deadline pressure is high for this ${policy.displayName.toLowerCase()} market, so the live line is tightening into the close.`,
    )
  }
  if (signals.historicalMissRate >= 0.6) {
    commentary.push(
      `Comparable ${policy.displayName.toLowerCase()} markets have mostly missed, which compresses the current payout.`,
    )
  }
  if (signals.demandPressure >= 0.28) {
    commentary.push(
      `Open tickets are stacking up with ${normalizeCredits(exposure.openInterestCredits)} CR staked, trimming the premium left in the book.`,
    )
  }
  if (signals.linkedMissPressure > 0) {
    commentary.push(
      'Linked cards have already missed, and that related history is dragging this line tighter too.',
    )
  }
  if (signals.uncertaintyLift >= 0.18) {
    commentary.push(
      'Source certainty is still imperfect here, so the engine keeps some uncertainty premium in the line.',
    )
  }

  if (commentary.length === 0) {
    commentary.push(
      `The line is still trading close to its seeded base because this ${policy.displayName.toLowerCase()} market has limited deadline or exposure pressure on it yet.`,
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

  const policy = resolveMarketRiskPolicy(market)
  const {
    historicalMissRate,
    timePressure,
    demandPressure,
    linkedMissPressure,
    uncertaintyLift,
    liabilityPressure,
  } = calculatePricingSignals(market, store, now)

  const repriced =
    market.basePayoutMultiplier *
    (1 - historicalMissRate * policy.historicalMissWeight) *
    (1 - timePressure * policy.timePressureWeight) *
    (1 - demandPressure * policy.demandWeight) *
    (1 - linkedMissPressure * policy.linkedMissWeight) *
    (1 + uncertaintyLift * policy.uncertaintyWeight) *
    (1 - clamp(liabilityPressure, 0, 1) * policy.liabilityWeight)

  return Number(
    clamp(Number(repriced.toFixed(2)), defaultLineFloor, defaultLineCeiling).toFixed(
      2,
    ),
  )
}

function appendLineHistoryEntry(
  market: Market,
  entry: MarketLineHistoryEntry,
): MarketLineHistoryEntry[] {
  const history = market.lineHistory ?? []
  return [entry, ...history].slice(0, lineHistoryLimit)
}

function createLineHistoryEntry(
  market: Market,
  nextMultiplier: number,
  reason: MarketLineMoveReason,
  commentary: string,
  exposure: MarketExposure,
  now: Date,
  triggerBetId: string | null,
): MarketLineHistoryEntry {
  return {
    id: `line_${randomUUID().replace(/-/g, '')}`,
    movedAt: now.toISOString(),
    previousPayoutMultiplier: market.payoutMultiplier,
    nextPayoutMultiplier: nextMultiplier,
    reason,
    commentary,
    triggerBetId,
    openInterestCredits: exposure.openInterestCredits,
    liabilityCredits: exposure.liabilityCredits,
  }
}

function deriveSuspensionReason(
  market: Market,
  policy: MarketRiskPolicy,
  settlementState: MarketSettlementState,
  liabilityPressure: number,
): string | null {
  if (market.status !== 'open' || market.resolution !== 'pending') {
    return null
  }

  if (settlementState === 'grace') {
    return 'Settlement grace window is active while the book waits for delivery evidence.'
  }

  if (settlementState === 'awaiting_operator') {
    return 'Deadline and grace window have both passed. This card is awaiting final auto-bust processing.'
  }

  if (liabilityPressure >= policy.suspensionThreshold) {
    return 'Current liability is at the market exposure cap. New tickets are paused until risk falls.'
  }

  return null
}

export function applyPricingEngine(
  store: StoreData,
  now: Date,
  event: PricingEngineEvent = {},
): { store: StoreData; changed: boolean } {
  const nowIso = now.toISOString()
  let changed = false

  const markets = store.markets.map((market) => {
    const policy = resolveMarketRiskPolicy(market)
    const exposure = calculateMarketExposure(store, market.id)
    const nextMultiplier = calculateLivePayoutMultiplier(market, store, now)
    const settlementState = calculateSettlementState(market, now, policy)
    const liabilityPressure = calculateLiabilityPressure(exposure, policy)
    const suspensionReason = deriveSuspensionReason(
      market,
      policy,
      settlementState,
      liabilityPressure,
    )
    const bettingSuspended = Boolean(suspensionReason)
    const nextBetWindowOpen =
      market.status === 'open' &&
      settlementState === 'live' &&
      !bettingSuspended
    const commentary = buildPricingCommentary(market, store, now)
    const autoResolveAt = calculateAutoResolveAt(market, policy).toISOString()
    const lineMoveReason: MarketLineMoveReason =
      settlementState !== 'live' || bettingSuspended !== Boolean(market.bettingSuspended)
        ? bettingSuspended
          ? 'suspension'
          : 'reopen'
        : event.reason === 'bet' && event.triggerMarketId === market.id
          ? 'bet'
          : 'maintenance'
    const lineMoved =
      nextMultiplier !== market.payoutMultiplier ||
      bettingSuspended !== Boolean(market.bettingSuspended) ||
      suspensionReason !== (market.suspensionReason ?? null)

    const nextLineHistory = lineMoved
      ? appendLineHistoryEntry(
          market,
          createLineHistoryEntry(
            market,
            nextMultiplier,
            lineMoveReason,
            commentary[0],
            exposure,
            now,
            event.triggerMarketId === market.id
              ? (event.triggerBetId ?? null)
              : null,
          ),
        )
      : (market.lineHistory ?? [])

    const nextMarket: Market = {
      ...market,
      payoutMultiplier: nextMultiplier,
      previousPayoutMultiplier: lineMoved
        ? market.payoutMultiplier
        : (market.previousPayoutMultiplier ?? null),
      lastLineMoveAt: lineMoved ? nowIso : (market.lastLineMoveAt ?? null),
      lastLineMoveReason: lineMoved
        ? lineMoveReason
        : (market.lastLineMoveReason ?? null),
      lineHistory: nextLineHistory,
      currentOpenInterestCredits: exposure.openInterestCredits,
      currentLiabilityCredits: exposure.liabilityCredits,
      maxStakeCredits: policy.maxStakeCredits,
      maxLiabilityCredits: policy.maxLiabilityCredits,
      perAgentExposureCapCredits: policy.perAgentExposureCapCredits,
      bettingSuspended,
      suspensionReason,
      settlementGraceHours: policy.settlementGraceHours,
      autoResolveAt,
      settlementState,
      betWindowOpen: nextBetWindowOpen,
      oddsCommentary: commentary,
      updatedAt: lineMoved ? nowIso : market.updatedAt,
      lastCheckedAt: market.lastCheckedAt,
    }

    if (JSON.stringify(nextMarket) !== JSON.stringify(market)) {
      changed = true
      return {
        ...nextMarket,
        lastCheckedAt: nowIso,
      }
    }

    return market
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
