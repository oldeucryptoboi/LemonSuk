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
    render(await GroupsPage({}))

    expect(screen.getByText('Reviewed groups')).not.toBeNull()
    expect(screen.getByText(/AI launches/)).not.toBeNull()
    expect(screen.getByText('OpenAI release radar')).not.toBeNull()
    expect(screen.getByText('2 active groups')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Board' }).getAttribute('href')).toBe(
      '/#board-surface-top',
    )
    expect(
      screen.getByRole('link', { name: 'Standings' }).getAttribute('href'),
    ).toBe('/standings#route-surface-top')
    expect(
      screen.getByText('Reviewed board collecting accepted markets in one lane.'),
    ).not.toBeNull()
    expect(
      screen.getAllByText('AI launches')[0]?.closest('a')?.getAttribute('href'),
    ).not.toBe('/groups')
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

    render(await GroupsPage({}))

    expect(screen.getByText('1 active group')).not.toBeNull()
    expect(screen.getAllByText('CEO claims').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Flagship Musk board.')).not.toBeNull()
  })

  it('filters entity boards when a family slug is selected', async () => {
    mocks.fetchBoardFamiliesServer.mockResolvedValueOnce(
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
            id: 'group_openai_release_radar',
            slug: 'openai-release-radar',
            title: 'OpenAI release radar',
            description: null,
          },
          totalMarkets: 1,
          openMarkets: 1,
          family: {
            id: 'family_ai_launch',
            slug: 'ai_launch',
            displayName: 'AI launches',
          },
          primaryEntity: null,
          heroMarket: null,
        },
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

    render(await GroupsPage({ searchParams: { family: 'ai_launch' } }))

    expect(screen.getByText(/AI launches groups on the board right now/i)).not.toBeNull()
    expect(
      screen.getByRole('link', { name: /Show all families/i }).getAttribute('href'),
    ).toBe('/groups')
    expect(screen.getByText('OpenAI release radar')).not.toBeNull()
    expect(screen.queryByText('Musk deadlines')).toBeNull()
    expect(
      screen.getAllByText('AI launches')[0]?.closest('a')?.getAttribute('href'),
    ).toBe('/groups')
  })

  it('hides zero-market families and shows the empty filtered-state card', async () => {
    mocks.fetchBoardFamiliesServer.mockResolvedValueOnce(
      [
        {
          family: {
            id: 'family_policy_promise',
            slug: 'policy_promise',
            displayName: 'Policy promises',
            description: 'Government promises.',
          },
          totalMarkets: 0,
          openMarkets: 0,
          activeGroups: 0,
          primaryEntities: [],
          heroMarket: null,
        },
        {
          family: {
            id: 'family_ai_launch',
            slug: 'ai_launch',
            displayName: 'AI launches',
            description: 'AI launch markets.',
          },
          totalMarkets: 2,
          openMarkets: 1,
          activeGroups: 1,
          primaryEntities: [],
          heroMarket: null,
        },
      ] as unknown as BoardFamilySummary[],
    )
    mocks.fetchBoardGroupsServer.mockResolvedValueOnce(
      [] as unknown as BoardEventGroupSummary[],
    )

    render(await GroupsPage({ searchParams: { family: 'ai_launch' } }))

    expect(screen.queryByText('Policy promises')).toBeNull()
    expect(screen.getByText('No AI launches groups yet')).not.toBeNull()
    expect(
      screen.getByText(
        'This family is active on the board taxonomy, but there are no reviewed entity boards in it yet.',
      ),
    ).not.toBeNull()
  })

  it('filters out zero-market groups and shows the unfiltered empty-state copy', async () => {
    mocks.fetchBoardFamiliesServer.mockResolvedValueOnce(
      [
        {
          family: {
            id: 'family_ai_launch',
            slug: 'ai_launch',
            displayName: 'AI launches',
            description: 'AI launch markets.',
          },
          totalMarkets: 1,
          openMarkets: 0,
          activeGroups: 0,
          primaryEntities: [],
          heroMarket: null,
        },
      ] as unknown as BoardFamilySummary[],
    )
    mocks.fetchBoardGroupsServer.mockResolvedValueOnce(
      [
        {
          group: {
            id: 'group_hidden',
            slug: 'hidden-group',
            title: 'Hidden group',
            description: 'Should be filtered out.',
          },
          totalMarkets: 0,
          openMarkets: 0,
          family: {
            id: 'family_ai_launch',
            slug: 'ai_launch',
            displayName: 'AI launches',
          },
          primaryEntity: null,
          heroMarket: null,
        },
      ] as unknown as BoardEventGroupSummary[],
    )

    render(await GroupsPage({ searchParams: { family: 'missing_family' } }))

    expect(screen.queryByText('Hidden group')).toBeNull()
    expect(screen.getByText('No reviewed groups yet')).not.toBeNull()
    expect(
      screen.getByText(
        'Accepted groups will show up here once the review desk promotes them onto the board.',
      ),
    ).not.toBeNull()
  })
})
