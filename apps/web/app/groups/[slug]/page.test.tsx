import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { EventGroupDetail } from '../../../src/shared'
import GroupDetailPage from './page'

const mocks = vi.hoisted(() => ({
  fetchBoardGroupDetailServer: vi.fn(
    async () =>
      ({
        summary: {
          group: {
            id: 'group_openai_release_radar',
            slug: 'openai-release-radar',
            title: 'OpenAI release radar',
            description: 'OpenAI launches.',
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
          heroMarket: {
            headline: 'OpenAI launches GPT-5 by August 31, 2026',
            promisedDate: '2026-08-31T23:59:59.000Z',
          },
          openMarkets: 1,
          totalMarkets: 2,
        },
        markets: [
          {
            id: 'market_1',
            slug: 'openai-gpt5-summer-2026',
            headline: 'OpenAI launches GPT-5 by August 31, 2026',
            summary: 'OpenAI ships GPT-5 in the summer 2026 window.',
            promisedBy: 'OpenAI',
            promisedDate: '2026-08-31T23:59:59.000Z',
            status: 'open',
          },
        ],
      }) as unknown as EventGroupDetail,
  ),
}))

vi.mock('../../../src/lib/server-api', () => ({
  fetchBoardGroupDetailServer: mocks.fetchBoardGroupDetailServer,
}))

describe('GroupDetailPage', () => {
  it('renders a read-only event group view', async () => {
    render(await GroupDetailPage({ params: Promise.resolve({ slug: 'openai-release-radar' }) }))

    expect(screen.getByText('OpenAI release radar')).not.toBeNull()
    expect(
      screen.getAllByText('OpenAI launches GPT-5 by August 31, 2026').length,
    ).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Closes 2026-08-31')).not.toBeNull()
  })

  it('falls back when the group has no description or hero market', async () => {
    mocks.fetchBoardGroupDetailServer.mockResolvedValueOnce(
      {
        summary: {
          group: {
            id: 'group_cross_entity_watch',
            slug: 'cross-entity-watch',
            title: 'Cross-entity watch',
            description: null,
          },
          family: null,
          primaryEntity: null,
          heroMarket: null,
          openMarkets: 0,
          totalMarkets: 1,
        },
        markets: [
          {
            id: 'market_2',
            slug: 'cross-entity-claim',
            headline: 'Cross-entity claim by December 31, 2026',
            summary: 'Fallback market summary.',
            promisedBy: 'Mixed board',
            promisedDate: '2026-12-31T23:59:59.000Z',
            status: 'pending',
          },
        ],
      } as unknown as EventGroupDetail,
    )

    render(await GroupDetailPage({ params: Promise.resolve({ slug: 'cross-entity-watch' }) }))

    expect(
      screen.getByText('Reviewed entity board collecting accepted markets in one lane.'),
    ).not.toBeNull()
    expect(screen.getByText('Cross-entity board')).not.toBeNull()
    expect(screen.getByText('No hero market selected')).not.toBeNull()
    expect(screen.getByText('The board has no featured market yet.')).not.toBeNull()
  })
})
