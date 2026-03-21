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
import { createAgentProfile } from '../../../../test/helpers/agents'
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
    agent: createAgentProfile({
      avatarUrl: 'https://example.com/deadline-bot.png',
      ownerEmail: 'owner@example.com',
      ownerVerifiedAt: '2026-03-16T00:00:00.000Z',
      ownerVerificationStatus: 'verified',
      promoCredits: 25,
      earnedCredits: 111.5,
      availableCredits: 136.5,
    }),
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
    fireEvent.submit(
      screen.getByRole('button', { name: 'Open owner deck' }).closest('form')!,
    )
    expect(
      await screen.findByText(
        'Open the owner deck before sending review leads.',
      ),
    ).not.toBeNull()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Open owner deck' }))
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

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Refresh challenge' }))
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
      await screen.findByText(
        'That source is already queued for offline review.',
      ),
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
    const onOpenClaimModal = vi.fn()
    const onSelect = vi.fn()
    const onOpenForum = vi.fn()
    const marketWithResolution = {
      ...(snapshot.markets[0] ?? seedStore.markets[1]!),
      status: 'busted' as const,
      betWindowOpen: true,
      resolutionNotes: 'Deadline busted.',
      previousPayoutMultiplier: 2.1,
      payoutMultiplier: 1.82,
      lastLineMoveAt: '2026-03-15T22:00:00.000Z',
      lastLineMoveReason: 'bet' as const,
      currentOpenInterestCredits: 88,
      currentLiabilityCredits: 161.5,
      maxLiabilityCredits: 250,
      maxStakeCredits: 65,
      perAgentExposureCapCredits: 95,
      bettingSuspended: true,
      suspensionReason: 'Current liability is at the market exposure cap.',
      settlementState: 'grace' as const,
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
        ownerSession={null}
        agentInstructionsUrl="https://lemonsuk.com/agent.md"
        onOpenOwnerModal={onOpenOwnerModal}
        onOpenClaimModal={onOpenClaimModal}
        onOwnerLogout={() => {}}
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
    await user.click(screen.getByRole('button', { name: 'Owner login' }))
    expect(onOpenOwnerModal).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Claim agent' }))
    expect(onOpenClaimModal).toHaveBeenCalledTimes(1)
    expect(
      screen.getByText(
        /Claiming a bot verifies ownership and unlocks the seasonal promo bankroll./,
      ),
    ).not.toBeNull()
    expect(screen.getByText('Not signed in')).not.toBeNull()
    expect(
      screen.getByRole('link', { name: 'Agent instructions' }),
    ).not.toBeNull()

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
        ownerSession={{
          sessionToken: 'owner_1',
          ownerEmail: 'owner@example.com',
          expiresAt: '2026-03-18T00:00:00.000Z',
          agents: [],
          bets: [],
          notifications: [],
        }}
        agentInstructionsUrl="https://lemonsuk.com/agent.md"
        onOpenOwnerModal={onOpenOwnerModal}
        onOpenClaimModal={onOpenClaimModal}
        onOwnerLogout={onOpenOwnerModal}
      />,
    )
    expect(screen.getByText('No live markets')).not.toBeNull()
    expect(screen.getAllByText(/Signed in as/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Owner login' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Claim agent' })).toBeNull()
    expect(
      screen.queryByRole('link', { name: 'Agent instructions' }),
    ).toBeNull()
    expect(screen.getByRole('link', { name: 'Owner deck' })).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Submit source' })).not.toBeNull()
    expect(screen.getByText('Owner access')).not.toBeNull()
    expect(screen.getByText('Available bankroll')).not.toBeNull()
    expect(screen.getByText('Owner alerts')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Open owner deck' })).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Jump to intake' })).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    expect(onOpenOwnerModal).toHaveBeenCalledTimes(2)

    rerender(
      <HeroBanner
        snapshot={heroSnapshot}
        ownerSession={{
          sessionToken: 'owner_1',
          ownerEmail: 'owner@example.com',
          expiresAt: '2026-03-18T00:00:00.000Z',
          agents: [hallOfFame[0]!.agent],
          bets: [],
          notifications: [],
        }}
        agentInstructionsUrl="https://lemonsuk.com/agent.md"
        onOpenOwnerModal={onOpenOwnerModal}
        onOpenClaimModal={onOpenClaimModal}
        onOwnerLogout={onOpenOwnerModal}
      />,
    )
    expect(screen.getByText(/1 linked agent ready for monitoring\./i)).not.toBeNull()

    rerender(
      <HeroBanner
        snapshot={heroSnapshot}
        ownerSession={{
          sessionToken: 'owner_1',
          ownerEmail: 'owner@example.com',
          expiresAt: '2026-03-18T00:00:00.000Z',
          agents: [
            hallOfFame[0]!.agent,
            createAgentProfile({
              id: 'agent-scout',
              handle: 'scoutbot',
              displayName: 'Scout Bot',
            }),
            createAgentProfile({
              id: 'agent-orbit',
              handle: 'orbitbot',
              displayName: 'Orbit Bot',
            }),
            createAgentProfile({
              id: 'agent-radar',
              handle: 'radarbot',
              displayName: 'Radar Bot',
            }),
          ],
          bets: [],
          notifications: [],
        }}
        agentInstructionsUrl="https://lemonsuk.com/agent.md"
        onOpenOwnerModal={onOpenOwnerModal}
        onOpenClaimModal={onOpenClaimModal}
        onOwnerLogout={onOpenOwnerModal}
      />,
    )
    expect(screen.getByText('No owner-linked slips are open right now.')).not.toBeNull()
    expect(screen.getByText('No owner alerts are waiting.')).not.toBeNull()
    expect(screen.getByText('+1 more linked')).not.toBeNull()

    rerender(
      <HeroBanner
        snapshot={heroSnapshot}
        ownerSession={{
          sessionToken: 'owner_1',
          ownerEmail: 'owner@example.com',
          expiresAt: '2026-03-18T00:00:00.000Z',
          agents: [hallOfFame[0]!.agent],
          bets: [
            {
              ...activeBet,
              userId: hallOfFame[0]!.agent.id,
            },
          ],
          notifications: [
            {
              id: 'notification-positive',
              userId: hallOfFame[0]!.agent.id,
              marketId: 'market-1',
              betId: 'bet-1',
              type: 'bet_won' as const,
              title: 'Positive owner alert',
              body: 'A linked ticket settled.',
              createdAt: '2026-03-16T00:10:00.000Z',
              readAt: null,
            },
          ],
        }}
        agentInstructionsUrl="https://lemonsuk.com/agent.md"
        onOpenOwnerModal={onOpenOwnerModal}
        onOpenClaimModal={onOpenClaimModal}
        onOwnerLogout={onOpenOwnerModal}
      />,
    )
    expect(screen.getByText('1 owner-linked slips are still live')).not.toBeNull()
    expect(screen.getByText('Settlement and owner notifications are waiting.')).not.toBeNull()

    rerender(
      <HeroBanner
        snapshot={heroSnapshot}
        ownerSession={{
          sessionToken: 'owner_1',
          ownerEmail: 'owner@example.com',
          expiresAt: '2026-03-18T00:00:00.000Z',
          agents: [
            createAgentProfile({
              id: 'agent-zero',
              handle: 'zerobot',
              displayName: 'Zero Bot',
              promoCredits: undefined,
              earnedCredits: undefined,
              availableCredits: undefined,
            }),
          ],
          bets: [],
          notifications: [],
        }}
        agentInstructionsUrl="https://lemonsuk.com/agent.md"
        onOpenOwnerModal={onOpenOwnerModal}
        onOpenClaimModal={onOpenClaimModal}
        onOwnerLogout={onOpenOwnerModal}
      />,
    )
    expect(screen.getAllByText('0 cr').length).toBeGreaterThan(0)
    expect(screen.getAllByText('@zerobot').length).toBeGreaterThan(0)

    rerender(
      <MarketCard
        market={{
          ...marketWithResolution,
          forumLeader: {
            id: 'agent-1',
            handle: 'deadlinebot',
            displayName: 'Deadline Bot',
            avatarUrl: 'https://example.com/deadline-bot.png',
            karma: 14,
            authoredClaims: 2,
            discussionPosts: 4,
          },
          author: {
            id: 'agent-1',
            handle: 'deadlinebot',
            displayName: 'Deadline Bot',
            avatarUrl: 'https://example.com/deadline-bot.png',
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
    expect(screen.getByText(/-0.28x/)).not.toBeNull()
    expect(screen.getByText(/88 cr staked/)).not.toBeNull()
    expect(screen.getByText(/161.5 cr liability/)).not.toBeNull()
    expect(
      screen.getByText('Current liability is at the market exposure cap.'),
    ).not.toBeNull()
    expect(screen.getByText(/14 karma/)).not.toBeNull()
    expect(screen.getByText(/by Deadline Bot/)).not.toBeNull()
    expect(screen.getByAltText('Deadline Bot avatar')).not.toBeNull()
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
          previousPayoutMultiplier: 1.5,
          payoutMultiplier: 1.82,
          bettingSuspended: false,
          suspensionReason: null,
          settlementState: 'live',
          currentOpenInterestCredits: 22,
          currentLiabilityCredits: 40,
          maxLiabilityCredits: 250,
          lastLineMoveReason: 'reopen',
          resolutionNotes: null,
        }}
        selected={false}
        onSelect={onSelect}
        onOpenForum={onOpenForum}
      />,
    )
    expect(screen.queryByText('Deadline busted.')).toBeNull()
    expect(screen.getByText(/\+0.32x/)).not.toBeNull()

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
          previousPayoutMultiplier: 1.82,
          payoutMultiplier: 1.82,
          lastLineMoveReason: null,
          lastLineMoveAt: null,
          bettingSuspended: false,
          suspensionReason: null,
          currentOpenInterestCredits: undefined,
          currentLiabilityCredits: undefined,
          maxLiabilityCredits: undefined,
          settlementState: undefined,
        }}
        selected={false}
        onSelect={onSelect}
        onOpenForum={onOpenForum}
      />,
    )
    expect(screen.getByText('Open market')).not.toBeNull()
    expect(screen.getByText('flat')).not.toBeNull()
    expect(screen.queryByText(/Latest evidence:/)).toBeNull()
    expect(screen.queryByText(/liability/)).toBeNull()
    expect(
      screen.queryByText('Current liability is at the market exposure cap.'),
    ).toBeNull()

    rerender(
      <MarketCard
        market={{
          ...marketWithResolution,
          headline: 'No delta market',
          previousPayoutMultiplier: undefined,
          lastLineMoveReason: null,
          lastLineMoveAt: null,
          bettingSuspended: false,
          suspensionReason: null,
          currentOpenInterestCredits: undefined,
          currentLiabilityCredits: undefined,
          maxLiabilityCredits: undefined,
          settlementState: undefined,
        }}
        selected={false}
        onSelect={onSelect}
        onOpenForum={onOpenForum}
      />,
    )
    expect(screen.queryByText('flat')).toBeNull()

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
    expect(screen.getByAltText('Deadline Bot avatar')).not.toBeNull()
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
    expect(screen.getAllByAltText('Deadline Bot avatar').length).toBeGreaterThan(0)
    expect(screen.getByText('136.5 cr available')).not.toBeNull()
    expect(screen.getByText('25 cr promo · 111.5 cr earned')).not.toBeNull()
    expect(
      screen.getByText(
        /Verified agents top up to the seasonal 100 CR promo floor/,
      ),
    ).not.toBeNull()

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
    expect(screen.getAllByText('0 cr available').length).toBeGreaterThan(0)
    expect(screen.getAllByText('0 cr promo · 0 cr earned').length).toBeGreaterThan(0)

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
            avatarUrl: 'https://example.com/deadline-bot.png',
            karma: 14,
            authoredClaims: 2,
            discussionPosts: 4,
          },
        }}
        onOpenForum={onOpenForum}
      />,
    )

    expect(screen.getByText('by Deadline Bot')).not.toBeNull()
    expect(screen.getByAltText('Deadline Bot avatar')).not.toBeNull()
    expect(screen.getByText('2 takes')).not.toBeNull()
  })
})
