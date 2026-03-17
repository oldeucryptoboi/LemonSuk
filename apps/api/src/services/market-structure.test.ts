import { describe, expect, it } from 'vitest'

import { createSeedStore } from '../data/seed'
import {
  buildEvidenceUpdates,
  buildMarketCheckpoints,
  deriveCheckpointKind,
  deriveMarketCompany,
  deriveSeasonalLabel,
  enrichMarketForBoard,
} from './market-structure'

describe('market structure service', () => {
  it('derives company lanes, checkpoint kinds, evidence, and board overlays', () => {
    const store = createSeedStore()
    const teslaMarket = store.markets.find((market) => market.id === 'cybercab-volume-2026')!
    const xMarket = store.markets.find((market) => market.id === 'x-payments-2024')!
    const spacexMarket = store.markets.find((market) => market.id === 'starship-mars-2026')!
    const boringMarket = store.markets.find(
      (market) => market.id === 'boring-la-tunnel-2018',
    )!
    const solarCityMarket = store.markets.find(
      (market) => market.id === 'solarcity-solar-roof-2019',
    )!
    const hyperloopMarket = store.markets.find(
      (market) => market.id === 'hyperloop-approval-2017',
    )!
    const dogeMarket = store.markets.find((market) => market.id === 'doge-savings-2026')!

    expect(deriveMarketCompany(teslaMarket)).toBe('tesla')
    expect(deriveMarketCompany(xMarket)).toBe('x')
    expect(deriveMarketCompany(spacexMarket)).toBe('spacex')
    expect(deriveMarketCompany(boringMarket)).toBe('boring')
    expect(deriveMarketCompany(solarCityMarket)).toBe('solarcity')
    expect(deriveMarketCompany(hyperloopMarket)).toBe('hyperloop')
    expect(deriveMarketCompany(dogeMarket)).toBe('doge')
    expect(deriveCheckpointKind(teslaMarket)).toBe('year_end')
    expect(deriveSeasonalLabel(xMarket)).toBe('Q4 2024 / year-end')
    expect(buildEvidenceUpdates(xMarket)[0]?.title).toBe('AP Visa and X Money')

    const checkpoints = buildMarketCheckpoints(
      spacexMarket,
      new Date('2026-03-16T00:00:00.000Z'),
    )
    expect(checkpoints.some((checkpoint) => checkpoint.label.startsWith('Q2 2026'))).toBe(
      true,
    )
    expect(checkpoints.at(-1)?.state).toBe('upcoming')

    const enriched = enrichMarketForBoard(
      teslaMarket,
      {
        ...store,
        bets: [
          {
            id: 'bet-1',
            userId: 'agent-1',
            marketId: teslaMarket.id,
            stakeCredits: 80,
            side: 'against',
            status: 'open',
            payoutMultiplierAtPlacement: 1.8,
            globalBonusPercentAtPlacement: 18,
            projectedPayoutCredits: 170,
            settledPayoutCredits: null,
            placedAt: '2026-03-16T00:00:00.000Z',
            settledAt: null,
          },
        ],
      },
      new Date('2026-03-16T00:00:00.000Z'),
    )

    expect(enriched.company).toBe('tesla')
    expect(enriched.checkpoints?.length).toBeGreaterThan(0)
    expect(enriched.evidenceUpdates?.length).toBeGreaterThan(0)
    expect(enriched.oddsCommentary?.length).toBeGreaterThan(0)
  })

  it('handles quarter-end cards, delivered finals, and late-cycle checkpoint selection', () => {
    const yearEndMarket = {
      ...createSeedStore().markets.find((market) => market.id === 'cybercab-volume-2026')!,
      announcedOn: '2023-01-01T00:00:00.000Z',
      promisedDate: '2024-12-31T23:59:59.000Z',
    }
    const quarterEndMarket = {
      ...yearEndMarket,
      id: 'quarter-end-market',
      slug: 'quarter-end-market',
      promisedDate: '2024-09-30T23:59:59.000Z',
      resolution: 'delivered' as const,
      summary: 'Quarter-end delivery checkpoint.',
    }

    const yearEndCheckpoints = buildMarketCheckpoints(
      yearEndMarket,
      new Date('2024-08-01T00:00:00.000Z'),
    )
    const quarterEndCheckpoints = buildMarketCheckpoints(
      quarterEndMarket,
      new Date('2024-08-01T00:00:00.000Z'),
    )

    expect(deriveCheckpointKind(quarterEndMarket)).toBe('quarter_end')
    expect(deriveSeasonalLabel(quarterEndMarket)).toBe('Q3 2024 window')
    expect(yearEndCheckpoints.map((checkpoint) => checkpoint.label)).toContain(
      'Q3 2024 close',
    )
    expect(quarterEndCheckpoints.at(-1)?.label).toBe('Q3 2024 close')
    expect(quarterEndCheckpoints.at(-1)?.state).toBe('delivered')
  })

  it('skips too-close quarter checkpoints and keeps the latest past checkpoint when two future ones remain', () => {
    const baseMarket = createSeedStore().markets.find(
      (market) => market.id === 'cybercab-volume-2026',
    )!
    const nearQuarterBoundaryMarket = {
      ...baseMarket,
      id: 'near-quarter-boundary',
      slug: 'near-quarter-boundary',
      headline: 'Wildcard promise',
      subject: 'Wildcard promise',
      summary: 'Wildcard summary.',
      tags: ['mystery'],
      announcedOn: '2024-08-20T00:00:00.000Z',
      promisedDate: '2024-12-31T23:59:59.000Z',
    }
    const twoFutureCheckpointsMarket = {
      ...baseMarket,
      id: 'two-future-checkpoints',
      slug: 'two-future-checkpoints',
      announcedOn: '2023-01-01T00:00:00.000Z',
      promisedDate: '2024-12-31T23:59:59.000Z',
    }

    const skippedCheckpoints = buildMarketCheckpoints(
      nearQuarterBoundaryMarket,
      new Date('2024-06-01T00:00:00.000Z'),
    )
    const twoFutureCheckpoints = buildMarketCheckpoints(
      twoFutureCheckpointsMarket,
      new Date('2024-05-01T00:00:00.000Z'),
    )

    expect(deriveMarketCompany(nearQuarterBoundaryMarket)).toBe('tesla')
    expect(
      skippedCheckpoints.map((checkpoint) => checkpoint.label),
    ).not.toContain('Q3 2024 close')
    expect(twoFutureCheckpoints.map((checkpoint) => checkpoint.label)).toEqual([
      'Q1 2024 close',
      'Q2 2024 close',
      'Q3 2024 close',
      'Year-end 2024 close',
    ])
  })
})
