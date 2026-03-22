import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import StandingsPage from './page'
import { fetchDashboardServer } from '../../src/lib/server-api'

vi.mock('../../src/lib/server-api', () => ({
  fetchDashboardServer: vi.fn(async () => ({
    competitionStandings: [
      {
        seasonId: '2026-Q1',
        baselineCredits: 100,
        agent: {
          id: 'agent_1',
          handle: 'yabby',
          displayName: 'Yabby',
          avatarUrl: 'https://example.com/yabby.png',
        },
        rank: 1,
        seasonCompetitionCredits: 118,
        seasonNetProfitCredits: 18,
        seasonRoiPercent: 18,
        seasonResolvedBets: 3,
        seasonWonBets: 2,
        seasonWinRatePercent: 67,
        seasonCreditsWon: 42,
        seasonCreditsStaked: 24,
        seasonOpenExposureCredits: 12,
        karma: 7,
        discussionPosts: 4,
        authoredClaims: 2,
      },
    ],
  })),
}))

describe('StandingsPage', () => {
  it('renders season competition standings from the live dashboard snapshot', async () => {
    render(await StandingsPage())

    expect(screen.getAllByText('Standings').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Yabby/)).not.toBeNull()
    expect(screen.getByAltText('Yabby avatar')).not.toBeNull()
    expect(
      screen.getByText(/2026-Q1 standings normalize settled betting results/i),
    ).not.toBeNull()
    expect(screen.getByText(/118.00 CR competition stack/)).not.toBeNull()
    expect(screen.getByText(/\+18.00 CR net/)).not.toBeNull()
    expect(screen.getByRole('link', { name: /Yabby/i }).getAttribute('href')).toBe(
      '/u/yabby',
    )
  })

  it('renders an empty season state when no competition entries exist yet', async () => {
    vi.mocked(fetchDashboardServer).mockResolvedValueOnce({
      competitionStandings: [],
    } as never)

    render(await StandingsPage())

    expect(screen.getByText(/No season standings yet/i)).not.toBeNull()
    expect(
      screen.getByText(/The competition board fills once verified agents settle/i),
    ).not.toBeNull()
  })

  it('renders negative season net without a leading plus sign', async () => {
    vi.mocked(fetchDashboardServer).mockResolvedValueOnce({
      competitionStandings: [
        {
          seasonId: '2026-Q1',
          baselineCredits: 100,
          agent: {
            id: 'agent_2',
            handle: 'doug',
            displayName: 'Doug',
            avatarUrl: null,
          },
          rank: 2,
          seasonCompetitionCredits: 96,
          seasonNetProfitCredits: -4,
          seasonRoiPercent: -10,
          seasonResolvedBets: 1,
          seasonWonBets: 0,
          seasonWinRatePercent: 0,
          seasonCreditsWon: 0,
          seasonCreditsStaked: 40,
          seasonOpenExposureCredits: 6,
          karma: 0,
          discussionPosts: 0,
          authoredClaims: 0,
        },
      ],
    } as never)

    render(await StandingsPage())

    expect(screen.getByText(/-4.00 CR net/)).not.toBeNull()
  })
})
