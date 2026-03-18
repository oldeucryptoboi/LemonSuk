import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { BoardEventGroupSummary, BoardFamilySummary } from '../../src/shared'
import GroupsPage from './page'

const mocks = vi.hoisted(() => ({
  fetchBoardFamiliesServer: vi.fn(async () =>
    [
      {
        family: {
          id: 'family_ai_launch',
          slug: 'ai_launch',
        displayName: 'AI launches',
        description: 'AI launch markets.',
      },
      totalMarkets: 2,
      openMarkets: 1,
        activeGroups: 2,
        primaryEntities: [],
        heroMarket: null,
      },
    ] as unknown as BoardFamilySummary[],
  ),
  fetchBoardGroupsServer: vi.fn(async () =>
    [
      {
        group: {
          id: 'group_openai_release_radar',
          slug: 'openai-release-radar',
        title: 'OpenAI release radar',
        description: null,
      },
      totalMarkets: 1,
      openMarkets: 1,
        family: null,
        primaryEntity: null,
        heroMarket: null,
      },
    ] as unknown as BoardEventGroupSummary[],
  ),
}))

vi.mock('../../src/lib/server-api', () => ({
  fetchBoardFamiliesServer: mocks.fetchBoardFamiliesServer,
  fetchBoardGroupsServer: mocks.fetchBoardGroupsServer,
}))

describe('GroupsPage', () => {
  it('renders family and group summaries', async () => {
    render(await GroupsPage())

    expect(screen.getByText('Reviewed groups')).not.toBeNull()
    expect(screen.getByText(/AI launches/)).not.toBeNull()
    expect(screen.getByText('OpenAI release radar')).not.toBeNull()
    expect(screen.getByText('2 active groups')).not.toBeNull()
    expect(
      screen.getByText('Reviewed board collecting accepted markets in one lane.'),
    ).not.toBeNull()
  })

  it('renders the singular active-group copy and family-labeled groups', async () => {
    mocks.fetchBoardFamiliesServer.mockResolvedValueOnce(
      [
        {
          family: {
            id: 'family_ceo_claim',
            slug: 'ceo_claim',
            displayName: 'CEO claims',
            description: 'Direct executive claims.',
          },
          totalMarkets: 1,
          openMarkets: 1,
          activeGroups: 1,
          primaryEntities: [],
          heroMarket: null,
        },
      ] as unknown as BoardFamilySummary[],
    )
    mocks.fetchBoardGroupsServer.mockResolvedValueOnce(
      [
        {
          group: {
            id: 'group_musk_deadlines',
            slug: 'musk-deadlines',
            title: 'Musk deadlines',
            description: 'Flagship Musk board.',
          },
          totalMarkets: 1,
          openMarkets: 1,
          family: {
            id: 'family_ceo_claim',
            slug: 'ceo_claim',
            displayName: 'CEO claims',
          },
          primaryEntity: null,
          heroMarket: null,
        },
      ] as unknown as BoardEventGroupSummary[],
    )

    render(await GroupsPage())

    expect(screen.getByText('1 active group')).not.toBeNull()
    expect(screen.getAllByText('CEO claims').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Flagship Musk board.')).not.toBeNull()
  })
})
