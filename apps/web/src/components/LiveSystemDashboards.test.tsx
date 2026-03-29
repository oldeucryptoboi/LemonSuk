import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { createSeedStore } from '../../../api/src/data/seed'
import { createDashboardSnapshot } from '../../../api/src/services/bonus'
import { createAgentProfile } from '../../../../test/helpers/agents'
import { supportMarketId } from '../shared'
import { LiveSystemDashboards } from './LiveSystemDashboards'

const seedStore = createSeedStore()

describe('LiveSystemDashboards', () => {
  it('renders ticket flow, repricing, evidence, and pulse panels from the live snapshot', () => {
    const agent = createAgentProfile({
      id: 'agent-1',
      handle: 'deadlinebot',
      displayName: 'Deadline Bot',
    })
    const competitionAgent = createAgentProfile({
      id: 'agent-2',
      handle: 'linewatch',
      displayName: 'Line Watch',
    })
    const snapshot = createDashboardSnapshot(
      {
        ...seedStore,
        bets: [
          {
            id: 'bet-1',
            userId: 'agent-1',
            marketId: 'optimus-customizable-2026',
            stakeCredits: 25,
            side: 'against',
            status: 'open',
            payoutMultiplierAtPlacement: 2.45,
            globalBonusPercentAtPlacement: 18,
            projectedPayoutCredits: 72.28,
            settledPayoutCredits: null,
            placedAt: '2026-03-16T00:00:00.000Z',
            settledAt: null,
          },
          {
            id: 'bet-2',
            userId: 'ghost-agent',
            marketId: 'unknown-market',
            stakeCredits: 9,
            side: 'for',
            status: 'open',
            payoutMultiplierAtPlacement: 1.15,
            globalBonusPercentAtPlacement: 18,
            projectedPayoutCredits: 10.35,
            settledPayoutCredits: null,
            placedAt: '2026-03-15T23:59:00.000Z',
            settledAt: null,
          },
        ],
      },
      new Date('2026-03-16T00:10:00.000Z'),
      [
        {
          rank: 1,
          agent,
          karma: 14,
          authoredClaims: 2,
          discussionPosts: 4,
          wonBets: 2,
          totalCreditsWon: 111.5,
          totalCreditsStaked: 50,
          winRatePercent: 100,
        },
      ],
      undefined,
      [
        {
          rank: 1,
          seasonId: '2026-q1',
          baselineCredits: 100,
          agent: competitionAgent,
          seasonCompetitionCredits: 142.5,
          seasonNetProfitCredits: 42.5,
          seasonRoiPercent: 42.5,
          seasonResolvedBets: 3,
          seasonWonBets: 2,
          seasonWinRatePercent: 66.7,
          seasonCreditsWon: 88.4,
          seasonCreditsStaked: 45.9,
          seasonOpenExposureCredits: 10,
          karma: 9,
          authoredClaims: 1,
          discussionPosts: 2,
        },
      ],
    )
    const secondaryRepricedMarket = snapshot.markets.find(
      (market) =>
        market.id !== 'optimus-customizable-2026' &&
        market.id !== supportMarketId,
    )

    const liveSnapshot = {
      ...snapshot,
      markets: snapshot.markets.map((market) =>
        market.id === 'optimus-customizable-2026'
          ? {
              ...market,
              lastLineMoveAt: '2026-03-15T22:00:00.000Z',
              lastLineMoveReason: 'bet' as const,
              previousPayoutMultiplier: 2.1,
              payoutMultiplier: 1.82,
              evidenceUpdates: [
                {
                  id: 'evidence_1',
                  title: 'Factory floor update',
                  detail: 'The latest build still needs manual intervention.',
                  publishedAt: '2026-03-16T00:05:00.000Z',
                  url: 'https://example.com/optimus',
                },
              ],
            }
          : market.id === secondaryRepricedMarket?.id
            ? {
                ...market,
                lastLineMoveAt: '2026-03-15T21:00:00.000Z',
                lastLineMoveReason: 'settlement' as const,
                previousPayoutMultiplier: undefined,
                payoutMultiplier: 1.35,
              }
          : market,
      ),
    }

    render(<LiveSystemDashboards snapshot={liveSnapshot} />)

    expect(screen.getByText('Watch the board breathe')).not.toBeNull()
    expect(screen.getByText('System pulse')).not.toBeNull()
    expect(screen.getByText('Ticket flow')).not.toBeNull()
    expect(screen.getByText('@deadlinebot · against · 25 cr')).not.toBeNull()
    expect(screen.getByText('Agent · for · 9 cr')).not.toBeNull()
    expect(screen.getByText('unknown-market')).not.toBeNull()
    expect(
      screen.getAllByText(
        'Optimus becomes a fully software-customizable robot by December 31, 2026',
      ),
    ).toHaveLength(3)
    expect(screen.getByText('Repricing wire')).not.toBeNull()
    expect(screen.getByText('Bet pressure · 1.82x (-0.28x)')).not.toBeNull()
    expect(screen.getByText('Repriced · 1.35x')).not.toBeNull()
    expect(screen.getByText('Evidence wire')).not.toBeNull()
    expect(screen.getByText('Factory floor update')).not.toBeNull()
  })

  it('renders empty-state copy when the live board has no tickets, reprices, or evidence updates', () => {
    const snapshot = createDashboardSnapshot(
      {
        ...seedStore,
        bets: [],
      },
      new Date('2026-03-16T00:10:00.000Z'),
    )
    const quietSnapshot = {
      ...snapshot,
      markets: snapshot.markets.map((market, index) => ({
        ...market,
        lastLineMoveAt: null,
        lastLineMoveReason: null,
        previousPayoutMultiplier: undefined,
        evidenceUpdates: index === 0 ? undefined : [],
      })),
    }

    render(<LiveSystemDashboards snapshot={quietSnapshot} />)

    expect(screen.getByText('No live tickets have been written yet.')).not.toBeNull()
    expect(screen.getByText('No reprices recorded yet.')).not.toBeNull()
    expect(screen.getByText('No evidence updates published yet.')).not.toBeNull()
  })
})
