import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { MarketDetail } from '../../../src/shared'
import MarketDetailPage from './page'

const mocks = vi.hoisted(() => ({
  fetchBoardMarketDetailServer: vi.fn(async () => ({
    market: {
      id: 'market_1',
      slug: 'openai-gpt5-summer-2026',
      headline: 'OpenAI launches GPT-5 by August 31, 2026',
      summary: 'OpenAI ships GPT-5 within the summer 2026 window.',
      promisedBy: 'Sam Altman',
      promisedDate: '2026-08-31T23:59:59.000Z',
      status: 'open',
      resolution: 'deadline',
      payoutMultiplier: 1.8,
      confidence: 76,
      sources: [
        {
          id: 'source_1',
          label: 'Bloomberg',
          url: 'https://example.com/gpt5',
          kind: 'news',
        },
      ],
    },
    family: {
      id: 'family_ai_launch',
      slug: 'ai_launch',
      displayName: 'AI launches',
    },
    primaryEntity: {
      id: 'entity_openai',
      slug: 'openai',
      displayName: 'OpenAI',
    },
    eventGroups: [
      {
        group: {
          id: 'group_openai_release_radar',
          slug: 'openai-release-radar',
          title: 'OpenAI release radar',
        },
      },
    ],
    relatedMarkets: [
      {
        id: 'market_2',
        slug: 'meta-lab-showcase-2026',
        headline: 'Meta AI announces a new flagship model by July 31, 2026',
      },
    ],
  }) as unknown as MarketDetail),
}))

vi.mock('../../../src/lib/server-api', () => ({
  fetchBoardMarketDetailServer: mocks.fetchBoardMarketDetailServer,
}))

describe('MarketDetailPage', () => {
  it('renders market detail with related groups and markets', async () => {
    render(
      await MarketDetailPage({
        params: Promise.resolve({ slug: 'openai-gpt5-summer-2026' }),
      }),
    )

    expect(screen.getByText('OpenAI launches GPT-5 by August 31, 2026')).not.toBeNull()
    expect(screen.getByText('OpenAI release radar')).not.toBeNull()
    expect(
      screen.getByText('Meta AI announces a new flagship model by July 31, 2026'),
    ).not.toBeNull()
  })

  it('falls back to unclassified labels when family and entity are missing', async () => {
    mocks.fetchBoardMarketDetailServer.mockResolvedValueOnce({
      market: {
        id: 'market_2',
        slug: 'unknown-claim',
        headline: 'Unknown claim by June 30, 2026',
        summary: 'Fallback rendering coverage.',
        promisedBy: 'Unknown source',
        promisedDate: '2026-06-30T23:59:59.000Z',
        status: 'open',
        resolution: 'deadline',
        payoutMultiplier: 1.2,
        confidence: 61,
        sources: [],
      },
      family: null as MarketDetail['family'],
      primaryEntity: null as MarketDetail['primaryEntity'],
      eventGroups: [],
      relatedMarkets: [],
    } as unknown as MarketDetail)

    render(
      await MarketDetailPage({
        params: Promise.resolve({ slug: 'unknown-claim' }),
      }),
    )

    expect(screen.getByText('Unclassified')).not.toBeNull()
    expect(screen.getAllByText('Unknown source').length).toBeGreaterThanOrEqual(1)
  })
})
