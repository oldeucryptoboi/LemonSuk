import type { DashboardSnapshot } from '../shared'
import { isBoardMarket, type CompanyFilter } from './markets'

export type MarketFilter = 'all' | 'open' | 'busted'

export function pickFirstVisibleMarketIdFromSnapshot(
  snapshot: DashboardSnapshot | null,
  nextStatus: MarketFilter,
  nextCompany: CompanyFilter,
): string | null {
  const nextMarkets =
    snapshot?.markets.filter((market) => {
      if (!isBoardMarket(market)) {
        return false
      }

      if (nextCompany !== 'all' && market.company !== nextCompany) {
        return false
      }

      if (nextStatus === 'all') {
        return true
      }

      return market.status === nextStatus
    }) ?? []

  return nextMarkets[0]?.id ?? null
}
