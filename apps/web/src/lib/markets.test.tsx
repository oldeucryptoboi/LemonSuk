import { describe, expect, it } from 'vitest'

import { createSeedStore } from '../../../api/src/data/seed'
import { createDashboardSnapshot } from '../../../api/src/services/bonus'
import {
  checkpointKindLabel,
  companyLabel,
  createCompanyTabs,
  createSeasonalSurfaces,
  marketCompany,
} from './markets'

describe('web market helpers', () => {
  it('creates company tabs, checkpoint labels, and seasonal surfaces', () => {
    const snapshot = createDashboardSnapshot(
      createSeedStore(),
      new Date('2026-03-16T00:00:00.000Z'),
    )

    const tabs = createCompanyTabs(snapshot.markets)
    const surfaces = createSeasonalSurfaces(
      snapshot.markets,
      '2026-03-16T00:00:00.000Z',
    )

    expect(companyLabel('xai')).toBe('xAI')
    expect(companyLabel('solarcity')).toBe('SolarCity')
    expect(companyLabel('doge')).toBe('DOGE')
    expect(
      marketCompany({
        ...snapshot.markets[0]!,
        company: undefined,
      }),
    ).toBe('tesla')
    expect(checkpointKindLabel('quarter_end')).toBe('Quarter close')
    expect(checkpointKindLabel('interim')).toBe('Interim card')
    expect(checkpointKindLabel(undefined)).toBe('Open market')
    expect(checkpointKindLabel('year_end')).toBe('Year-end card')
    expect(tabs.find((entry) => entry.value === 'tesla')?.count).toBeGreaterThan(0)
    expect(tabs.find((entry) => entry.value === 'spacex')?.count).toBe(2)
    expect(tabs.find((entry) => entry.value === 'boring')?.count).toBe(1)
    expect(tabs.find((entry) => entry.value === 'solarcity')?.count).toBe(1)
    expect(tabs.find((entry) => entry.value === 'hyperloop')?.count).toBe(1)
    expect(tabs.find((entry) => entry.value === 'doge')?.count).toBe(1)
    expect(surfaces.find((surface) => surface.key === 'q2-close')?.count).toBeGreaterThan(
      0,
    )
    expect(
      surfaces.find((surface) => surface.key === 'year-end-graveyard')?.count,
    ).toBeGreaterThan(0)
  })
})
