import { describe, expect, it } from 'vitest'

import { createSeedStore } from '../data/seed'
import type { CandidateMarket } from '../shared'
import { reconcileCandidates } from './reconcile'

const searchedAt = '2026-03-16T00:00:00.000Z'

describe('reconcileCandidates', () => {
  it('updates matching markets and merges tags and sources', () => {
    const store = createSeedStore()
    const candidate: CandidateMarket = {
      headline:
        'Dedicated Tesla Robotaxi is unveiled on August 8, 2024 with more details',
      subject: 'Tesla Robotaxi',
      category: 'robotaxi',
      announcedOn: '2024-04-01T00:00:00.000Z',
      promisedDate: '2024-08-20T00:00:00.000Z',
      summary:
        'This replacement summary is intentionally much longer than the seeded robotaxi card so the reconciler should prefer it over the original summary text.',
      confidence: 99,
      stakeDifficulty: 5,
      basePayoutMultiplier: 2.6,
      payoutMultiplier: 2.6,
      tags: ['robotaxi', 'x'],
      source: {
        id: 'source-new',
        label: 'New source',
        url: 'https://x.com/elonmusk/status/1',
        sourceType: 'x',
        domain: 'x.com',
        publishedAt: '2024-04-01T00:00:00.000Z',
        note: 'new',
      },
      author: null,
    }

    const result = reconcileCandidates(store, [candidate], searchedAt)
    const updated = result.store.markets.find(
      (market) => market.id === 'robotaxi-unveil-2024',
    )

    expect(result.updatedMarketIds).toEqual(['robotaxi-unveil-2024'])
    expect(updated?.confidence).toBe(99)
    expect(updated?.tags).toContain('x')
    expect(updated?.sources.some((entry) => entry.url === candidate.source.url)).toBe(
      true,
    )
    expect(updated?.headline).toBe(
      'Dedicated Tesla Robotaxi is unveiled on August 8, 2024 with more details',
    )
    expect(updated?.summary).toBe(
      'This replacement summary is intentionally much longer than the seeded robotaxi card so the reconciler should prefer it over the original summary text.',
    )
    expect(updated?.announcedOn).toBe('2024-04-01T00:00:00.000Z')
  })

  it('keeps richer existing fields when the new candidate is weaker', () => {
    const store = createSeedStore()
    const candidate: CandidateMarket = {
      headline: 'Short robotaxi headline',
      subject: 'Tesla Robotaxi',
      category: 'robotaxi',
      announcedOn: '2025-04-01T00:00:00.000Z',
      promisedDate: '2024-08-12T00:00:00.000Z',
      summary: 'short summary',
      confidence: 40,
      stakeDifficulty: 2,
      basePayoutMultiplier: 1.2,
      payoutMultiplier: 1.2,
      tags: ['robotaxi'],
      source: {
        id: 'source-older',
        label: 'Older source',
        url: 'https://example.com/older',
        sourceType: 'blog',
        domain: 'example.com',
        publishedAt: null,
        note: 'older',
      },
      author: null,
    }

    const result = reconcileCandidates(store, [candidate], searchedAt)
    const updated = result.store.markets.find(
      (market) => market.id === 'robotaxi-unveil-2024',
    )

    expect(updated?.headline).toBe('Dedicated Tesla Robotaxi is unveiled on August 8, 2024')
    expect(updated?.summary).toContain('Musk posted')
    expect(updated?.announcedOn).toBe('2024-04-05T00:00:00.000Z')
  })

  it('creates a new market when there is no match', () => {
    const store = createSeedStore()
    const candidate: CandidateMarket = {
      headline: 'FSD reaches Mars by January 1, 2028',
      subject: 'Tesla Full Self-Driving',
      category: 'autonomy',
      announcedOn: '2026-02-01T00:00:00.000Z',
      promisedDate: '2028-01-01T00:00:00.000Z',
      summary: 'brand new promise',
      confidence: 70,
      stakeDifficulty: 3,
      basePayoutMultiplier: 1.9,
      payoutMultiplier: 1.9,
      tags: ['fsd', 'mars'],
      source: {
        id: 'source-2',
        label: 'Mars',
        url: 'https://example.com/mars',
        sourceType: 'blog',
        domain: 'example.com',
        publishedAt: null,
        note: 'note',
      },
      author: null,
    }

    const result = reconcileCandidates(store, [candidate], searchedAt)

    expect(result.createdMarketIds).toHaveLength(1)
    expect(
      result.store.markets.some((market) => market.headline === candidate.headline),
    ).toBe(true)
    expect(result.store.metadata.lastDiscoveryRunAt).toBe(searchedAt)
  })
})
