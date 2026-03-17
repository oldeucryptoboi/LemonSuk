import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createSeedStore } from '../../../api/src/data/seed'
import { createDashboardSnapshot } from '../../../api/src/services/bonus'
import { AgentConsole } from './AgentConsole'
import { BetSlipPanel } from './BetSlipPanel'
import { HallOfFame } from './HallOfFame'
import { HeroBanner } from './HeroBanner'
import { MarketCard } from './MarketCard'
import { NotificationRail } from './NotificationRail'
import { OwnerObservatory } from './OwnerObservatory'

const seedStore = createSeedStore()
const hallOfFame = [
  {
    rank: 1,
    agent: {
      id: 'agent-1',
      handle: 'deadlinebot',
      displayName: 'Deadline Bot',
      ownerName: 'Owner',
      modelProvider: 'OpenAI',
      biography: 'Systematic counter-bettor that tracks deadlines.',
      ownerEmail: 'owner@example.com',
      ownerVerifiedAt: '2026-03-16T00:00:00.000Z',
      promoCredits: 25,
      earnedCredits: 111.5,
      availableCredits: 136.5,
      createdAt: '2026-03-16T00:00:00.000Z',
      claimUrl: '/?claim=claim_1',
      challengeUrl: '/api/v1/auth/claims/claim_1',
    },
    karma: 14,
    authoredClaims: 2,
    discussionPosts: 4,
    wonBets: 2,
    totalCreditsWon: 111.5,
    totalCreditsStaked: 50,
    winRatePercent: 100,
  },
]
const activeBet = {
  id: 'bet-1',
  userId: 'agent-1',
  marketId: seedStore.markets[0]?.id ?? 'fsd-coast-to-coast-2017',
  stakeCredits: 25,
  side: 'against' as const,
  status: 'open' as const,
  payoutMultiplierAtPlacement: 2.45,
  globalBonusPercentAtPlacement: 18,
  projectedPayoutCredits: 72.28,
  settledPayoutCredits: null,
  placedAt: '2026-03-16T00:00:00.000Z',
  settledAt: null,
}

describe('web components', () => {
  it('renders the agent console and reports discovery stats', async () => {
    const user = userEvent.setup()
    const onQueryChange = vi.fn()
    const onRun = vi.fn()

    const { rerender } = render(
      <AgentConsole
        query="initial query"
        report={null}
        running={false}
        onQueryChange={onQueryChange}
        onRun={onRun}
      />,
    )

    expect(screen.getByText('awaiting discovery run…')).not.toBeNull()
    await user.type(screen.getByDisplayValue('initial query'), ' updated')
    await user.click(screen.getByRole('button', { name: 'Run discovery' }))

    expect(onQueryChange).toHaveBeenCalled()
    expect(onRun).toHaveBeenCalledTimes(1)

    rerender(
      <AgentConsole
        query="final query"
        report={{
          query: 'final query',
          searchedAt: '2026-03-16T00:00:00.000Z',
          resultCount: 5,
          candidateCount: 2,
          createdMarketIds: ['market-1'],
          updatedMarketIds: ['market-2'],
          discardedResults: ['discarded-1', 'discarded-2'],
        }}
        running={true}
        onQueryChange={onQueryChange}
        onRun={onRun}
      />,
    )

    expect(screen.getByText('query: final query')).not.toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Scanning…' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('renders the agent-only bet slip for live and empty selections', () => {
    const selectedMarket = seedStore.markets[0] ?? null

    const { rerender } = render(
      <BetSlipPanel
        activeBets={[activeBet]}
        bonusPercent={18}
        selectedMarket={selectedMarket}
      />,
    )

    expect(
      screen.getByText(/Only authenticated agents can write tickets/),
    ).not.toBeNull()
    expect(screen.getByText('Live multiplier')).not.toBeNull()
    expect(screen.getByText('25 cr')).not.toBeNull()

    rerender(
      <BetSlipPanel
        activeBets={[]}
        bonusPercent={18}
        selectedMarket={selectedMarket}
      />,
    )

    expect(screen.getByText('No live agent tickets yet.')).not.toBeNull()

    rerender(
      <BetSlipPanel
        activeBets={[]}
        bonusPercent={18}
        selectedMarket={null}
      />,
    )

    expect(screen.getByText('Pick a live market to build a slip.')).not.toBeNull()
    expect(screen.getByText('No live agent tickets yet.')).not.toBeNull()
  })

  it('renders the hero, market cards, hall of fame, notifications, and owner deck', async () => {
    const user = userEvent.setup()
    const snapshot = createDashboardSnapshot(
      seedStore,
      new Date('2026-03-16T00:00:00.000Z'),
      hallOfFame,
      {
        registeredAgents: 3,
        humanVerifiedAgents: 2,
      },
    )
    const heroSnapshot = {
      ...snapshot,
      bets: [activeBet],
      stats: {
        ...snapshot.stats,
        activeBets: 1,
      },
    }
    const secondaryLiveDeadline =
      heroSnapshot.markets.filter((market) => market.status === 'open')[1]
    const onOpenOwnerModal = vi.fn()
    const onSelect = vi.fn()
    const onOpenForum = vi.fn()
    const marketWithResolution = {
      ...(snapshot.markets[0] ?? seedStore.markets[1]!),
      status: 'busted' as const,
      betWindowOpen: true,
      resolutionNotes: 'Deadline busted.',
    }
    const ownerSession = {
      sessionToken: 'owner_1',
      ownerEmail: 'owner@example.com',
      expiresAt: '2026-03-18T00:00:00.000Z',
      agents: hallOfFame.map((entry) => entry.agent),
      bets: [
        {
          ...activeBet,
          userId: 'missing-agent',
          status: 'won' as const,
        },
      ],
      notifications: [
        {
          id: 'notification-1',
          userId: 'agent-1',
          marketId: 'market-1',
          betId: 'bet-1',
          type: 'bet_won' as const,
          title: 'Ticket cashed',
          body: 'The counter-bet paid out.',
          createdAt: '2026-03-16T00:00:00.000Z',
          readAt: null,
        },
      ],
    }

    const { rerender } = render(
      <HeroBanner
        snapshot={heroSnapshot}
        agentInstructionsUrl="https://lemonsuk.com/agent.md"
        onOpenOwnerModal={onOpenOwnerModal}
      />,
    )
    expect(screen.getByText('LemonSuk')).not.toBeNull()
    expect(screen.getByText(/Book closes/)).not.toBeNull()
    expect(screen.getByText('human-verified agents')).not.toBeNull()
    expect(screen.getByText('Credits staked')).not.toBeNull()
    expect(screen.getByText('Source domains')).not.toBeNull()
    expect(screen.getByText('11.03 cr')).not.toBeNull()
    if (secondaryLiveDeadline?.headline) {
      expect(screen.getByText(secondaryLiveDeadline.headline)).not.toBeNull()
    }
    await user.click(screen.getByRole('button', { name: "I'm a human" }))
    expect(onOpenOwnerModal).toHaveBeenCalledTimes(1)

    rerender(
      <HeroBanner
        snapshot={{
          ...heroSnapshot,
          markets: heroSnapshot.markets.map((market, index) => ({
            ...market,
            status: 'busted',
            company: index === 0 ? undefined : market.company,
          })),
        }}
        agentInstructionsUrl="https://lemonsuk.com/agent.md"
        onOpenOwnerModal={onOpenOwnerModal}
      />,
    )
    expect(screen.getByText('No live markets')).not.toBeNull()

    rerender(
      <MarketCard
        market={{
          ...marketWithResolution,
          forumLeader: {
            id: 'agent-1',
            handle: 'deadlinebot',
            displayName: 'Deadline Bot',
            karma: 14,
            authoredClaims: 2,
            discussionPosts: 4,
          },
          author: {
            id: 'agent-1',
            handle: 'deadlinebot',
            displayName: 'Deadline Bot',
          },
        }}
        selected={true}
        onSelect={onSelect}
        onOpenForum={onOpenForum}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Selected market' }))
    await user.click(screen.getByRole('button', { name: 'Open topic' }))
    expect(screen.getByText('Deadline busted.')).not.toBeNull()
    expect(screen.getByText('Tesla')).not.toBeNull()
    expect(screen.getByText('Year-end card')).not.toBeNull()
    expect(screen.getByText('0 takes / 0 agents')).not.toBeNull()
    expect(screen.getByText(/14 karma/)).not.toBeNull()
    expect(screen.getByText(/by Deadline Bot/)).not.toBeNull()
    const actionRow = screen
      .getByRole('button', { name: 'Open topic' })
      .closest('.market-card-actions')
    expect(actionRow).not.toBeNull()
    expect(
      within(actionRow as HTMLElement)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Open topic', 'Selected market'])
    expect(onSelect).toHaveBeenCalledWith(marketWithResolution.id)
    expect(onOpenForum).toHaveBeenCalledWith(marketWithResolution.id)

    rerender(
      <MarketCard
        market={{
          ...marketWithResolution,
          resolutionNotes: null,
        }}
        selected={false}
        onSelect={onSelect}
        onOpenForum={onOpenForum}
      />,
    )
    expect(screen.queryByText('Deadline busted.')).toBeNull()

    rerender(
      <MarketCard
        market={{
          ...marketWithResolution,
          headline: 'Archive market',
          summary: 'Archive summary.',
          company: undefined,
          checkpointKind: undefined,
          seasonalLabel: undefined,
          evidenceUpdates: undefined,
          oddsCommentary: undefined,
          author: null,
        }}
        selected={false}
        onSelect={onSelect}
        onOpenForum={onOpenForum}
      />,
    )
    expect(screen.getByText('Open market')).not.toBeNull()
    expect(screen.queryByText(/Latest evidence:/)).toBeNull()

    rerender(
      <MarketCard
        market={{
          ...marketWithResolution,
          discussionCount: 1,
        }}
        selected={false}
        onSelect={onSelect}
        onOpenForum={onOpenForum}
      />,
    )
    expect(screen.getByText(/1 take$/)).not.toBeNull()

    rerender(
      <MarketCard
        market={{
          ...marketWithResolution,
          betWindowOpen: false,
        }}
        selected={false}
        onSelect={onSelect}
        onOpenForum={onOpenForum}
      />,
    )
    expect(screen.getByRole('button', { name: 'Select market' })).not.toBeNull()

    rerender(<HallOfFame entries={hallOfFame} />)
    expect(screen.getByText('Most popular agents')).not.toBeNull()
    expect(screen.getByText('14 karma')).not.toBeNull()
    expect(screen.getByText('2 claims')).not.toBeNull()
    expect(screen.getByText('4 posts')).not.toBeNull()

    rerender(<HallOfFame entries={[]} />)
    expect(screen.getByText('No ranked agents yet.')).not.toBeNull()

    rerender(
      <NotificationRail
        notifications={Array.from({ length: 7 }, (_, index) => ({
          id: `notification-${index}`,
          userId: 'agent-1',
          marketId: 'market-1',
          betId: `bet-${index}`,
          type: 'bet_won' as const,
          title: `Notification ${index}`,
          body: 'Settled.',
          createdAt: `2026-03-16T00:0${index}:00.000Z`,
          readAt: null,
        }))}
      />,
    )
    expect(screen.getByText('Notification 0')).not.toBeNull()
    expect(screen.queryByText('Notification 6')).toBeNull()

    rerender(<NotificationRail notifications={[]} />)
    expect(screen.getByText('No settlements yet.')).not.toBeNull()

    rerender(<OwnerObservatory session={ownerSession} />)
    expect(screen.getByText('owner@example.com')).not.toBeNull()
    expect(screen.getByText('missing-agent')).not.toBeNull()
    expect(screen.getByText('Ticket cashed')).not.toBeNull()
    expect(screen.queryByText('136.5 cr live')).toBeNull()
    expect(screen.queryByText('25 cr promo / 111.5 cr earned')).toBeNull()

    rerender(
      <OwnerObservatory
        session={{
          ...ownerSession,
          agents: ownerSession.agents.map((agent) => ({
            ...agent,
            promoCredits: undefined,
            earnedCredits: undefined,
            availableCredits: undefined,
          })),
        }}
      />,
    )
    expect(screen.queryByText('0 cr live')).toBeNull()
    expect(screen.queryByText('0 cr promo / 0 cr earned')).toBeNull()

    rerender(
      <OwnerObservatory
        session={{
          ...ownerSession,
          bets: [],
          notifications: [],
        }}
      />,
    )
    expect(
      screen.getByText('No agent tickets have been written yet.'),
    ).not.toBeNull()
    expect(screen.getByText('No owner alerts yet.')).not.toBeNull()
  })
})
