import { describe, expect, it } from 'vitest'

import { createSeedStore } from '../../../api/src/data/seed'
import { createDashboardSnapshot } from '../../../api/src/services/bonus'
import {
  matchesBoardFilters,
  pickFirstVisibleMarketIdFromSnapshot,
  toggleCompanyFilter,
  toggleMarketStatusFilter,
} from './board'

describe('board filter helpers', () => {
  const snapshot = createDashboardSnapshot(
    createSeedStore(),
    new Date('2026-03-22T00:00:00.000Z'),
  )

  it('toggles status pills and clears them when all is selected', () => {
    expect(toggleMarketStatusFilter([], 'open')).toEqual(['open'])
    expect(toggleMarketStatusFilter(['open'], 'busted')).toEqual(['open', 'busted'])
    expect(toggleMarketStatusFilter(['open', 'busted'], 'open')).toEqual(['busted'])
    expect(toggleMarketStatusFilter(['open'], 'all')).toEqual([])
  })

  it('toggles company pills and clears them when all is selected', () => {
    expect(toggleCompanyFilter([], 'spacex')).toEqual(['spacex'])
    expect(toggleCompanyFilter(['spacex'], 'apple')).toEqual(['spacex', 'apple'])
    expect(toggleCompanyFilter(['spacex', 'apple'], 'spacex')).toEqual(['apple'])
    expect(toggleCompanyFilter(['apple'], 'all')).toEqual([])
  })

  it('matches markets only when they satisfy the selected rows', () => {
    const openSpacex = snapshot.markets.find(
      (market) => market.company === 'spacex' && market.status === 'open',
    )!
    const bustedTesla = {
      ...openSpacex,
      id: 'busted_tesla_probe',
      company: 'tesla' as const,
      status: 'busted' as const,
    }
    const resolvedMarket = {
      ...openSpacex,
      id: 'resolved_probe',
      status: 'resolved' as const,
    }

    expect(matchesBoardFilters(openSpacex, [], [])).toBe(true)
    expect(matchesBoardFilters(openSpacex, ['open'], ['spacex'])).toBe(true)
    expect(matchesBoardFilters(openSpacex, ['busted'], ['spacex'])).toBe(false)
    expect(matchesBoardFilters(bustedTesla, ['busted'], ['spacex'])).toBe(false)
    expect(matchesBoardFilters(resolvedMarket, ['open'], [])).toBe(false)
  })

  it('picks the first visible board market from a snapshot', () => {
    expect(pickFirstVisibleMarketIdFromSnapshot(null, [], [])).toBeNull()
    expect(pickFirstVisibleMarketIdFromSnapshot(snapshot, ['open'], ['spacex'])).toBe(
      snapshot.markets.find(
        (market) => market.company === 'spacex' && market.status === 'open',
      )?.id ?? null,
    )
    expect(pickFirstVisibleMarketIdFromSnapshot(snapshot, ['open'], ['apple'])).toBe(
      snapshot.markets.find(
        (market) => market.company === 'apple' && market.status === 'open',
      )?.id ?? null,
    )
  })
})
