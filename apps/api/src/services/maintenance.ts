import type { BetSlip, Market, Notification, StoreData } from '../shared'
import { storeSchema } from '../shared'
import { withStoreTransaction } from './store'
import { applyPricingEngine } from './pricing'

const bustedNote =
  'Deadline expired without a validated delivery signal in the current market book.'

type MarketSettlement = 'won' | 'lost'
type ManualResolution = 'missed' | 'delivered'

function settlementOutcomeForMarket(market: Market): MarketSettlement | null {
  if (market.resolution === 'missed' || market.status === 'busted') {
    return 'won'
  }

  if (market.resolution === 'delivered' || market.status === 'resolved') {
    return 'lost'
  }

  return null
}

function settleBet(bet: BetSlip, market: Market, nowIso: string): BetSlip {
  const outcome = settlementOutcomeForMarket(market)!

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
  const outcome = settlementOutcomeForMarket(market)

  if (outcome === 'won') {
    return {
      id: `notification-${bet.id}-${market.status}`,
      userId: bet.userId,
      marketId: market.id,
      betId: bet.id,
      type: 'bet_won',
      title: 'Ticket cashed',
      body: `Your counter-bet on “${market.headline}” won because the card is now busted.`,
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
    body: `Your counter-bet on “${market.headline}” lost because the promise resolved as delivered.`,
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
    bustedAt: nowIso,
    betWindowOpen: false,
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
            betWindowOpen: false,
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
    const deadlinePassed = Date.parse(market.promisedDate) <= now.getTime()

    if (market.status === 'open' && deadlinePassed) {
      changed = true
      return closeMarketAsMissed(market, nowIso)
    }

    const nextBetWindowOpen = market.status === 'open' && !deadlinePassed
    if (market.betWindowOpen !== nextBetWindowOpen) {
      changed = true

      return {
        ...market,
        betWindowOpen: nextBetWindowOpen,
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
    if (!market || !settlementOutcomeForMarket(market)) {
      return bet
    }

    changed = true
    const settledBet = settleBet(bet, market, nowIso)

    if (!notifications.some((notification) => notification.betId === bet.id)) {
      notifications.push(createNotification(settledBet, market, nowIso))
    }

    return settledBet
  })

  const nextStore = storeSchema.parse({
    ...priced.store,
    bets,
    notifications,
    metadata: {
      ...priced.store.metadata,
      lastMaintenanceRunAt: changed
        ? nowIso
        : priced.store.metadata.lastMaintenanceRunAt,
    },
  })

  return { store: nextStore, changed }
}

export async function loadMaintainedStore(
  now: Date = new Date(),
): Promise<StoreData> {
  return withStoreTransaction(async (current, persist) => {
    const result = runMaintenance(current, now)

    if (result.changed) {
      return persist(result.store)
    }

    return current
  })
}
