import type { BetSlip, Market, Notification, StoreData } from '../shared'
import { storeSchema } from '../shared'
import { cleanupExpiredIdentityState } from './identity'
import { withStoreTransaction } from './store'
import {
  applyPricingEngine,
  calculateAutoResolveAt,
  calculateSettlementState,
  resolveMarketRiskPolicy,
} from './pricing'

const bustedNote =
  'Deadline expired without a validated delivery signal in the current market book.'

type MarketSettlement = 'won' | 'lost'
type ManualResolution = 'missed' | 'delivered'

function settlementOutcomeForMarket(
  market: Market,
  side: BetSlip['side'],
): MarketSettlement | null {
  if (market.resolution === 'missed' || market.status === 'busted') {
    return side === 'against' ? 'won' : 'lost'
  }

  if (market.resolution === 'delivered' || market.status === 'resolved') {
    return side === 'for' ? 'won' : 'lost'
  }

  return null
}

function settleBet(bet: BetSlip, market: Market, nowIso: string): BetSlip {
  const outcome = settlementOutcomeForMarket(market, bet.side)!

  return {
    ...bet,
    status: outcome,
    settledAt: nowIso,
    settledPayoutCredits:
      outcome === 'won' ? bet.projectedPayoutCredits : 0,
  }
}

function createNotification(
  bet: BetSlip,
  market: Market,
  nowIso: string,
): Notification {
  const outcome = settlementOutcomeForMarket(market, bet.side)
  const sideLabel = bet.side === 'for' ? 'support ticket' : 'counter-bet'

  if (outcome === 'won') {
    return {
      id: `notification-${bet.id}-${market.status}`,
      userId: bet.userId,
      marketId: market.id,
      betId: bet.id,
      type: 'bet_won',
      title: 'Ticket cashed',
      body:
        bet.side === 'for'
          ? `Your ${sideLabel} on “${market.headline}” won because the promise resolved as delivered.`
          : `Your ${sideLabel} on “${market.headline}” won because the card is now busted.`,
      createdAt: nowIso,
      readAt: null,
    }
  }

  return {
    id: `notification-${bet.id}-${market.status}`,
    userId: bet.userId,
    marketId: market.id,
    betId: bet.id,
    type: 'bet_lost',
    title: 'Ticket busted',
    body:
      bet.side === 'for'
        ? `Your ${sideLabel} on “${market.headline}” lost because the card is now busted.`
        : `Your ${sideLabel} on “${market.headline}” lost because the promise resolved as delivered.`,
    createdAt: nowIso,
    readAt: null,
  }
}

function closeMarketAsMissed(market: Market, nowIso: string): Market {
  return {
    ...market,
    status: 'busted',
    resolution: 'missed',
    resolutionNotes: market.resolutionNotes ?? bustedNote,
    settlementState: 'settled',
    bustedAt: nowIso,
    betWindowOpen: false,
    bettingSuspended: false,
    suspensionReason: null,
    updatedAt: nowIso,
    lastCheckedAt: nowIso,
  }
}

export function resolveMarket(
  store: StoreData,
  marketId: string,
  resolution: ManualResolution,
  resolutionNotes: string,
  resolvedAt: Date,
): { store: StoreData; market: Market } {
  const resolvedAtIso = resolvedAt.toISOString()
  let resolvedMarket: Market | null = null

  const markets = store.markets.map((market) => {
    if (market.id !== marketId) {
      return market
    }

    if (market.status !== 'open' || market.resolution !== 'pending') {
      throw new Error('This market is already settled.')
    }

    resolvedMarket =
      resolution === 'missed'
        ? {
            ...closeMarketAsMissed(market, resolvedAtIso),
            resolutionNotes,
          }
        : {
            ...market,
            status: 'resolved',
            resolution: 'delivered',
            resolutionNotes,
            settlementState: 'settled',
            betWindowOpen: false,
            bettingSuspended: false,
            suspensionReason: null,
            bustedAt: null,
            updatedAt: resolvedAtIso,
            lastCheckedAt: resolvedAtIso,
          }

    return resolvedMarket
  })

  if (!resolvedMarket) {
    throw new Error('Market not found.')
  }

  return {
    market: resolvedMarket,
    store: storeSchema.parse({
      ...store,
      markets,
    }),
  }
}

export function runMaintenance(
  store: StoreData,
  now: Date,
): { store: StoreData; changed: boolean } {
  const nowIso = now.toISOString()
  let changed = false

  const transitionedMarkets = store.markets.map((market) => {
    const policy = resolveMarketRiskPolicy(market)
    const promisedDatePassed = Date.parse(market.promisedDate) <= now.getTime()
    const autoResolveAt = calculateAutoResolveAt(market, policy)
    const deadlinePassed = autoResolveAt.getTime() <= now.getTime()

    if (market.status === 'open' && deadlinePassed) {
      changed = true
      return closeMarketAsMissed(market, nowIso)
    }

    const nextBetWindowOpen = market.status === 'open' && !promisedDatePassed
    const nextSettlementState = calculateSettlementState(market, now, policy)
    if (
      market.betWindowOpen !== nextBetWindowOpen ||
      market.autoResolveAt !== autoResolveAt.toISOString() ||
      market.settlementState !== nextSettlementState
    ) {
      changed = true

      return {
        ...market,
        betWindowOpen: nextBetWindowOpen,
        autoResolveAt: autoResolveAt.toISOString(),
        settlementGraceHours: policy.settlementGraceHours,
        settlementState: nextSettlementState,
        lastCheckedAt: nowIso,
      }
    }

    return market
  })

  const priced = applyPricingEngine(
    storeSchema.parse({
      ...store,
      markets: transitionedMarkets,
    }),
    now,
    { reason: 'maintenance' },
  )
  changed = changed || priced.changed

  const marketsById = new Map(
    priced.store.markets.map((market) => [market.id, market]),
  )
  const notifications = [...priced.store.notifications]
  const bets = priced.store.bets.map((bet) => {
    if (bet.status !== 'open') {
      return bet
    }

    const market = marketsById.get(bet.marketId)
    if (!market || !settlementOutcomeForMarket(market, bet.side)) {
      return bet
    }

    changed = true
    const settledBet = settleBet(bet, market, nowIso)

    if (!notifications.some((notification) => notification.betId === bet.id)) {
      notifications.push(createNotification(settledBet, market, nowIso))
    }

    return settledBet
  })

  const postSettlementStore = storeSchema.parse({
    ...priced.store,
    bets,
    notifications,
    metadata: {
      ...priced.store.metadata,
      lastMaintenanceRunAt: priced.store.metadata.lastMaintenanceRunAt,
    },
  })

  const finalized = applyPricingEngine(postSettlementStore, now, {
    reason: 'maintenance',
  })
  changed = changed || finalized.changed

  const nextStore = storeSchema.parse({
    ...finalized.store,
    metadata: {
      ...finalized.store.metadata,
      lastMaintenanceRunAt: changed
        ? nowIso
        : finalized.store.metadata.lastMaintenanceRunAt,
    },
  })

  return { store: nextStore, changed }
}

export async function loadMaintainedStore(
  now: Date = new Date(),
): Promise<StoreData> {
  await cleanupExpiredIdentityState()

  return withStoreTransaction(async (current, persist) => {
    const result = runMaintenance(current, now)

    if (result.changed) {
      return persist(result.store)
    }

    return current
  })
}
