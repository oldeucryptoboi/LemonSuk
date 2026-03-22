import type { DashboardSnapshot, Market } from '../shared'
import { isBoardMarket, marketCompany, type CompanyFilter } from './markets'

export type MarketStatusFilter = 'open' | 'busted'
export type MarketFilter = 'all' | MarketStatusFilter
export type ActiveCompanyFilter = Exclude<CompanyFilter, 'all'>

export function toggleMarketStatusFilter(
  current: readonly MarketStatusFilter[],
  next: MarketFilter,
): MarketStatusFilter[] {
  if (next === 'all') {
    return []
  }

  if (current.includes(next)) {
    return current.filter((entry) => entry !== next)
  }

  return [...current, next]
}

export function toggleCompanyFilter(
  current: readonly ActiveCompanyFilter[],
  next: CompanyFilter,
): ActiveCompanyFilter[] {
  if (next === 'all') {
    return []
  }

  if (current.includes(next)) {
    return current.filter((entry) => entry !== next)
  }

  return [...current, next]
}

export function matchesBoardFilters(
  market: Market,
  selectedStatuses: readonly MarketStatusFilter[],
  selectedCompanies: readonly ActiveCompanyFilter[],
): boolean {
  if (!isBoardMarket(market)) {
    return false
  }

  if (
    selectedCompanies.length > 0 &&
    !selectedCompanies.includes(marketCompany(market))
  ) {
    return false
  }

  if (selectedStatuses.length === 0) {
    return true
  }

  return market.status === 'open' || market.status === 'busted'
    ? selectedStatuses.includes(market.status)
    : false
}

export function pickFirstVisibleMarketIdFromSnapshot(
  snapshot: DashboardSnapshot | null,
  nextStatuses: readonly MarketStatusFilter[],
  nextCompanies: readonly ActiveCompanyFilter[],
): string | null {
  const nextMarkets =
    snapshot?.markets.filter((market) =>
      matchesBoardFilters(market, nextStatuses, nextCompanies),
    ) ?? []

  return nextMarkets[0]?.id ?? null
}
