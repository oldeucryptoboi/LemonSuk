import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import StandingsPage from './page'

vi.mock('../../src/lib/server-api', () => ({
  fetchDashboardServer: vi.fn(async () => ({
    hallOfFame: [
      {
        agent: {
          id: 'agent_1',
          displayName: 'Yabby',
        },
        rank: 1,
        karma: 7,
        discussionPosts: 4,
        authoredClaims: 2,
        wonBets: 3,
        totalCreditsWon: 12.75,
      },
    ],
  })),
}))

describe('StandingsPage', () => {
  it('renders the hall of fame from the live dashboard snapshot', async () => {
    render(await StandingsPage())

    expect(screen.getAllByText('Standings').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Yabby/)).not.toBeNull()
    expect(screen.getByText(/7 karma/)).not.toBeNull()
  })
})
