import type {
  BetSlip,
  DashboardSnapshot,
  DashboardStats,
  HallOfFameEntry,
  Market,
  StoreData,
} from '../shared'
import { dashboardSnapshotSchema, dashboardStatsSchema } from '../shared'
import { enrichMarketForBoard } from './market-structure'
import { clamp, sortByDateDescending } from './utils'

type AgentDirectoryStats = {
  registeredAgents: number
  humanVerifiedAgents: number
}

export function calculateGlobalBonus(markets: Market[]): number {
  const bustedMarkets = markets.filter(
    (market) => market.status === 'busted',
  ).length
  const openMarkets = markets.filter(
    (market) => market.status === 'open',
  ).length
  const ratioBoost =
    markets.length === 0 ? 0 : (bustedMarkets / markets.length) * 18
  const streakBoost = bustedMarkets > openMarkets ? 6 : 0

  return Math.round(clamp(8 + ratioBoost + streakBoost, 8, 36))
}

export function calculateProjectedPayout(
  stakeCredits: number,
  payoutMultiplier: number,
  bonusPercent: number,
): number {
  return Number(
    (stakeCredits * payoutMultiplier * (1 + bonusPercent / 100)).toFixed(2),
  )
}

export function createDashboardStats(
  store: StoreData,
  agentDirectoryStats: AgentDirectoryStats = {
    registeredAgents: 0,
    humanVerifiedAgents: 0,
  },
): DashboardStats {
  const totalMarkets = store.markets.length
  const openMarkets = store.markets.filter(
    (market) => market.status === 'open',
  ).length
  const bustedMarkets = store.markets.filter(
    (market) => market.status === 'busted',
  ).length
  const resolvedMarkets = store.markets.filter(
    (market) => market.status === 'resolved',
  ).length
  const activeBets = store.bets.filter((bet) => bet.status === 'open').length
  const wonBets = store.bets.filter((bet) => bet.status === 'won').length
  const lostBets = store.bets.filter((bet) => bet.status === 'lost').length
  const globalBonusPercent = calculateGlobalBonus(store.markets)
  const bustedRatePercent =
    totalMarkets === 0 ? 0 : Math.round((bustedMarkets / totalMarkets) * 100)

  return dashboardStatsSchema.parse({
    totalMarkets,
    openMarkets,
    bustedMarkets,
    resolvedMarkets,
    activeBets,
    wonBets,
    lostBets,
    globalBonusPercent,
    bustedRatePercent,
    registeredAgents: agentDirectoryStats.registeredAgents,
    humanVerifiedAgents: agentDirectoryStats.humanVerifiedAgents,
  })
}

function sortMarkets(markets: Market[]): Market[] {
  const open = markets
    .filter((market) => market.status === 'open')
    .sort(
      (left, right) =>
        Date.parse(left.promisedDate) - Date.parse(right.promisedDate),
    )
  const busted = sortByDateDescending(
    markets.filter((market) => market.status === 'busted'),
    (market) => market.promisedDate,
  )
  const resolved = sortByDateDescending(
    markets.filter((market) => market.status === 'resolved'),
    (market) => market.promisedDate,
  )

  return [...open, ...busted, ...resolved]
}

function sortBets(bets: BetSlip[]): BetSlip[] {
  return sortByDateDescending(bets, (bet) => bet.placedAt)
}

export function createDashboardSnapshot(
  store: StoreData,
  now: Date,
  hallOfFame: HallOfFameEntry[] = [],
  agentDirectoryStats: AgentDirectoryStats = {
    registeredAgents: 0,
    humanVerifiedAgents: 0,
  },
): DashboardSnapshot {
  const markets = sortMarkets(store.markets).map((market) =>
    enrichMarketForBoard(market, store, now),
  )

  return dashboardSnapshotSchema.parse({
    now: now.toISOString(),
    stats: createDashboardStats(store, agentDirectoryStats),
    markets,
    bets: sortBets(store.bets),
    notifications: sortByDateDescending(
      store.notifications,
      (notification) => notification.createdAt,
    ),
    hallOfFame,
    metadata: store.metadata,
  })
}
