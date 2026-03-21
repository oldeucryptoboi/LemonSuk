import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { MarketDetail } from '../../../src/shared'
import MarketDetailPage, { generateMetadata } from './page'

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
      previousPayoutMultiplier: 1.94,
      lastLineMoveAt: '2026-03-15T18:00:00.000Z',
      lastLineMoveReason: 'bet',
      currentOpenInterestCredits: 120,
      currentLiabilityCredits: 212.4,
      maxStakeCredits: 60,
      maxLiabilityCredits: 240,
      perAgentExposureCapCredits: 90,
      bettingSuspended: true,
      suspensionReason: 'Current liability is at the market exposure cap.',
      settlementGraceHours: 24,
      autoResolveAt: '2026-09-01T23:59:59.000Z',
      settlementState: 'grace',
      lineHistory: [
        {
          id: 'line_1',
          movedAt: '2026-03-15T18:00:00.000Z',
          previousPayoutMultiplier: 1.94,
          nextPayoutMultiplier: 1.8,
          reason: 'bet',
          commentary: 'Open tickets compressed the line.',
          triggerBetId: 'bet_1',
          openInterestCredits: 120,
          liabilityCredits: 212.4,
        },
      ],
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
  it('builds metadata from market detail data', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'openai-gpt5-summer-2026' }),
    })

    expect(metadata).toEqual(
      expect.objectContaining({
        title: 'OpenAI launches GPT-5 by August 31, 2026',
        description: 'OpenAI ships GPT-5 within the summer 2026 window.',
        alternates: expect.objectContaining({
          canonical: '/markets/openai-gpt5-summer-2026',
        }),
        openGraph: expect.objectContaining({
          url: 'https://lemonsuk.com/markets/openai-gpt5-summer-2026',
        }),
      }),
    )
  })

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
    expect(screen.getByText('Betting paused.')).not.toBeNull()
    expect(screen.getByText('Current liability is at the market exposure cap.')).not.toBeNull()
    expect(screen.getByText('Line history')).not.toBeNull()
    expect(screen.getByText('Open tickets compressed the line.')).not.toBeNull()
    expect(screen.getByText('Book limits')).not.toBeNull()
  })

  it('falls back to unclassified labels and awaiting-operator copy when family and entity are missing', async () => {
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
        settlementState: 'awaiting_operator',
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
    expect(screen.getByText('No line history yet.')).not.toBeNull()
    expect(
      screen.getByText(
        'The grace window has passed and the market is waiting for final operator handling.',
      ),
    ).not.toBeNull()
  })

  it('renders settled copy when a market is already final', async () => {
    mocks.fetchBoardMarketDetailServer.mockResolvedValueOnce({
      market: {
        id: 'market_3',
        slug: 'resolved-claim',
        headline: 'Resolved claim',
        summary: 'Settlement coverage.',
        promisedBy: 'Resolved source',
        promisedDate: '2026-06-30T23:59:59.000Z',
        status: 'resolved',
        resolution: 'delivered',
        payoutMultiplier: 1.05,
        confidence: 94,
        settlementState: 'settled',
        sources: [],
      },
      family: null as MarketDetail['family'],
      primaryEntity: null as MarketDetail['primaryEntity'],
      eventGroups: [],
      relatedMarkets: [],
    } as unknown as MarketDetail)

    render(
      await MarketDetailPage({
        params: Promise.resolve({ slug: 'resolved-claim' }),
      }),
    )

    expect(
      screen.getByText('This market is settled and no longer reprices.'),
    ).not.toBeNull()
  })

  it('renders live settlement-watch copy for active markets', async () => {
    mocks.fetchBoardMarketDetailServer.mockResolvedValueOnce({
      market: {
        id: 'market_4',
        slug: 'live-claim',
        headline: 'Live claim',
        summary: 'Still repricing.',
        promisedBy: 'Live source',
        promisedDate: '2026-09-30T23:59:59.000Z',
        status: 'open',
        resolution: 'pending',
        payoutMultiplier: 1.44,
        confidence: 68,
        settlementState: 'live',
        sources: [],
      },
      family: null as MarketDetail['family'],
      primaryEntity: null as MarketDetail['primaryEntity'],
      eventGroups: [],
      relatedMarkets: [],
    } as unknown as MarketDetail)

    render(
      await MarketDetailPage({
        params: Promise.resolve({ slug: 'live-claim' }),
      }),
    )

    expect(
      screen.getByText(
        'The market is still live and reprices as liability, deadline pressure, and linked misses change.',
      ),
    ).not.toBeNull()
  })
})
