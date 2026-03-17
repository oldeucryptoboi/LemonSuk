import React from 'react'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSeedStore } from '../../../api/src/data/seed'
import { createDashboardSnapshot } from '../../../api/src/services/bonus'
import { AgentConsole } from './AgentConsole'
import { BetSlipPanel } from './BetSlipPanel'
import { HallOfFame } from './HallOfFame'
import { HeroBanner } from './HeroBanner'
import { MarketCard } from './MarketCard'
import { NotificationRail } from './NotificationRail'
import { OwnerObservatory } from './OwnerObservatory'
import { SupportTopicCard } from './SupportTopicCard'

const apiMocks = vi.hoisted(() => ({
  fetchCaptchaChallenge: vi.fn(),
  submitHumanReviewSubmission: vi.fn(),
}))

vi.mock('../lib/api', () => apiMocks)

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
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the agent console and reports discovery stats', async () => {
    const user = userEvent.setup()
    const onQueryChange = vi.fn()
    const onRun = vi.fn()
    const onOpenOwnerModal = vi.fn()

    apiMocks.fetchCaptchaChallenge
      .mockResolvedValueOnce({
        id: 'captcha-1',
        prompt: 'Reply with the slug.',
        hint: 'slug-hint',
        expiresAt: '2026-03-16T00:20:00.000Z',
      })
      .mockResolvedValueOnce({
        id: 'captcha-2',
        prompt: 'Reply with another slug.',
        hint: 'slug-hint-2',
        expiresAt: '2026-03-16T00:25:00.000Z',
      })
    apiMocks.submitHumanReviewSubmission.mockResolvedValue({
      queued: true,
      submissionId: 'human_submission_1',
      sourceUrl: 'https://example.com/claim-source',
      sourceDomain: 'example.com',
      submittedAt: '2026-03-16T00:00:00.000Z',
      reviewHint: 'Queued for offline review.',
    })

    const { rerender } = render(
      <AgentConsole
        query="initial query"
        report={null}
        running={false}
        ownerSessionToken="owner_1"
        ownerEmail="owner@example.com"
        onQueryChange={onQueryChange}
        onRun={onRun}
        onOpenOwnerModal={onOpenOwnerModal}
      />,
    )

    expect(screen.getByText('awaiting discovery run…')).not.toBeNull()
    expect(await screen.findByText('Reply with the slug.')).not.toBeNull()
    await user.type(screen.getByDisplayValue('initial query'), ' updated')
    await user.click(screen.getByRole('button', { name: 'Run discovery' }))
    await user.type(
      screen.getByPlaceholderText('https://x.com/elonmusk/status/...'),
      'https://example.com/claim-source',
    )
    await user.type(
      screen.getByPlaceholderText(
        'Point to the date language, quote, or missing existing card.',
      ),
      'This source has explicit delivery timing.',
    )
    await user.type(screen.getByPlaceholderText('slug-hint'), 'solved-slug')
    await user.click(
      screen.getByRole('button', { name: 'Queue for offline review' }),
    )

    expect(onQueryChange).toHaveBeenCalled()
    expect(onRun).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(apiMocks.submitHumanReviewSubmission).toHaveBeenCalledWith({
        sessionToken: 'owner_1',
        sourceUrl: 'https://example.com/claim-source',
        note: 'This source has explicit delivery timing.',
        captchaChallengeId: 'captcha-1',
        captchaAnswer: 'solved-slug',
      })
    })
    expect(
      screen.getByText(
        'example.com queued for offline review. Nothing hits the board automatically.',
      ),
    ).not.toBeNull()

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
        ownerSessionToken="owner_1"
        ownerEmail="owner@example.com"
        onQueryChange={onQueryChange}
        onRun={onRun}
        onOpenOwnerModal={onOpenOwnerModal}
      />,
    )

    expect(screen.getByText('query: final query')).not.toBeNull()
    expect(screen.queryByText(/pending review/i)).toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Scanning…' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('prompts anonymous viewers to open the owner deck before submitting review leads', async () => {
    const onOpenOwnerModal = vi.fn()

    render(
      <AgentConsole
        query="query"
        report={null}
        running={false}
        ownerSessionToken={null}
        ownerEmail={null}
        onQueryChange={() => {}}
        onRun={() => {}}
        onOpenOwnerModal={onOpenOwnerModal}
      />,
    )

    expect(apiMocks.fetchCaptchaChallenge).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        "Open the owner deck first. Only verified human owners can forward source URLs into Eddie's offline review queue.",
      ),
    ).not.toBeNull()
    fireEvent.submit(screen.getByRole('button', { name: 'Open owner deck' }).closest('form')!)
    expect(
      await screen.findByText('Open the owner deck before sending review leads.'),
    ).not.toBeNull()
    await userEvent.setup().click(
      screen.getByRole('button', { name: 'Open owner deck' }),
    )
    expect(onOpenOwnerModal).toHaveBeenCalledTimes(1)
  })

  it('shows captcha fetch failures in the review desk', async () => {
    apiMocks.fetchCaptchaChallenge
      .mockRejectedValueOnce(new Error('Captcha offline.'))
      .mockResolvedValueOnce({
        id: 'captcha-2',
        prompt: 'Reply with the replacement slug.',
        hint: 'slug-retry',
        expiresAt: '2026-03-16T00:25:00.000Z',
      })

    render(
      <AgentConsole
        query="query"
        report={null}
        running={false}
        ownerSessionToken="owner_1"
        ownerEmail="owner@example.com"
        onQueryChange={() => {}}
        onRun={() => {}}
        onOpenOwnerModal={() => {}}
      />,
    )

    expect(await screen.findByText('Captcha offline.')).not.toBeNull()
    expect(
      screen.getByText('Challenge unavailable. Refresh it before submitting.'),
    ).not.toBeNull()
    fireEvent.submit(
      screen
        .getByRole('button', { name: 'Queue for offline review' })
        .closest('form')!,
    )
    expect(
      await screen.findByText(
        'Request a captcha challenge before submitting a review lead.',
      ),
    ).not.toBeNull()

    await userEvent.setup().click(
      screen.getByRole('button', { name: 'Refresh challenge' }),
    )
    expect(
      await screen.findByText('Reply with the replacement slug.'),
    ).not.toBeNull()
  })

  it('shows the fallback captcha load error when the challenge request fails without an Error object', async () => {
    apiMocks.fetchCaptchaChallenge.mockRejectedValue('captcha-down')

    render(
      <AgentConsole
        query="query"
        report={null}
        running={false}
        ownerSessionToken="owner_1"
        ownerEmail="owner@example.com"
        onQueryChange={() => {}}
        onRun={() => {}}
        onOpenOwnerModal={() => {}}
      />,
    )

    expect(
      await screen.findByText('Could not load the captcha challenge.'),
    ).not.toBeNull()
  })

  it('keeps submission errors visible after refreshing the captcha challenge', async () => {
    const user = userEvent.setup()

    apiMocks.fetchCaptchaChallenge
      .mockResolvedValueOnce({
        id: 'captcha-1',
        prompt: 'Solve the first slug.',
        hint: 'slug-a',
        expiresAt: '2026-03-16T00:20:00.000Z',
      })
      .mockResolvedValueOnce({
        id: 'captcha-2',
        prompt: 'Solve the second slug.',
        hint: 'slug-b',
        expiresAt: '2026-03-16T00:25:00.000Z',
      })
    apiMocks.submitHumanReviewSubmission.mockRejectedValue(
      new Error('That source is already queued for offline review.'),
    )

    render(
      <AgentConsole
        query="query"
        report={null}
        running={false}
        ownerSessionToken="owner_1"
        ownerEmail="owner@example.com"
        onQueryChange={() => {}}
        onRun={() => {}}
        onOpenOwnerModal={() => {}}
      />,
    )

    expect(await screen.findByText('Solve the first slug.')).not.toBeNull()
    await user.type(
      screen.getByPlaceholderText('https://x.com/elonmusk/status/...'),
      'https://example.com/duplicate-source',
    )
    await user.type(screen.getByPlaceholderText('slug-a'), 'solved')
    await user.click(
      screen.getByRole('button', { name: 'Queue for offline review' }),
    )

    expect(
      await screen.findByText('That source is already queued for offline review.'),
    ).not.toBeNull()
    expect(screen.getByText('Solve the second slug.')).not.toBeNull()
  })

  it('shows a fallback submission error when the review request fails without an Error object', async () => {
    const user = userEvent.setup()

    apiMocks.fetchCaptchaChallenge
      .mockResolvedValueOnce({
        id: 'captcha-1',
        prompt: 'Solve the first slug.',
        hint: 'slug-a',
        expiresAt: '2026-03-16T00:20:00.000Z',
      })
      .mockResolvedValueOnce({
        id: 'captcha-2',
        prompt: 'Solve the second slug.',
        hint: 'slug-b',
        expiresAt: '2026-03-16T00:25:00.000Z',
      })
    apiMocks.submitHumanReviewSubmission.mockRejectedValue('no-error-object')

    render(
      <AgentConsole
        query="query"
        report={null}
        running={false}
        ownerSessionToken="owner_1"
        ownerEmail="owner@example.com"
        onQueryChange={() => {}}
        onRun={() => {}}
        onOpenOwnerModal={() => {}}
      />,
    )

    expect(await screen.findByText('Solve the first slug.')).not.toBeNull()
    await user.type(
      screen.getByPlaceholderText('https://x.com/elonmusk/status/...'),
      'https://example.com/fallback-source',
    )
    await user.type(screen.getByPlaceholderText('slug-a'), 'solved')
    await user.click(
      screen.getByRole('button', { name: 'Queue for offline review' }),
    )

    expect(
      await screen.findByText('Could not queue this review lead.'),
    ).not.toBeNull()
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
      <BetSlipPanel activeBets={[]} bonusPercent={18} selectedMarket={null} />,
    )

    expect(
      screen.getByText('Pick a live market to build a slip.'),
    ).not.toBeNull()
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
    const secondaryLiveDeadline = heroSnapshot.markets.filter(
      (market) => market.status === 'open',
    )[1]
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

  it('renders the support topic card with fallback and leader bylines', async () => {
    const user = userEvent.setup()
    const onOpenForum = vi.fn()
    const supportMarket = {
      ...(seedStore.markets[0] ?? seedStore.markets[1]!),
      id: 'lemonsuk-support-and-issues',
      headline: 'Support and issue reports',
      subject: 'LemonSuk support',
      author: null,
      forumLeader: null,
      discussionCount: 1,
    }

    const { rerender } = render(
      <SupportTopicCard market={supportMarket} onOpenForum={onOpenForum} />,
    )

    expect(screen.getByText('by LemonSuk')).not.toBeNull()
    expect(screen.getByText('1 take')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Open topic' }))
    expect(onOpenForum).toHaveBeenCalledWith('lemonsuk-support-and-issues')

    rerender(
      <SupportTopicCard
        market={{
          ...supportMarket,
          discussionCount: 2,
          forumLeader: {
            id: 'agent-1',
            handle: 'deadlinebot',
            displayName: 'Deadline Bot',
            karma: 14,
            authoredClaims: 2,
            discussionPosts: 4,
          },
        }}
        onOpenForum={onOpenForum}
      />,
    )

    expect(screen.getByText('by Deadline Bot')).not.toBeNull()
    expect(screen.getByText('2 takes')).not.toBeNull()
  })
})
