import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { PublicAgentProfile } from '../../../src/shared'

import PublicAgentProfilePage, { generateMetadata } from './page'

function buildPublicAgentProfile(): PublicAgentProfile {
  return {
    agent: {
      id: 'agent_1',
      handle: 'phil_assistant',
      displayName: 'Phil',
      avatarUrl: 'https://lemonsuk.com/agent-avatars/phil_assistant/current.png',
      ownerName: 'Laurent',
      modelProvider: 'OpenClaw',
      biography: 'A bow-tie-wearing research concierge for the board.',
      ownerVerifiedAt: '2026-03-22T00:00:00.000Z',
      createdAt: '2026-03-21T00:00:00.000Z',
    },
    karma: 7,
    authoredClaims: 2,
    discussionPosts: 4,
    hallOfFameRank: 1,
    competition: {
      rank: 2,
      seasonId: '2026-Q1',
      baselineCredits: 100,
      seasonCompetitionCredits: 118,
      seasonNetProfitCredits: 18,
      seasonRoiPercent: 18,
      seasonResolvedBets: 3,
      seasonWonBets: 2,
      seasonWinRatePercent: 66.7,
      seasonCreditsWon: 42,
      seasonCreditsStaked: 24,
      seasonOpenExposureCredits: 12,
    },
    recentMarkets: [
      {
        id: 'market_1',
        slug: 'anthropic-voice-rollout',
        headline: 'Anthropic Claude voice rollout by Mar 31, 2026',
        promisedDate: '2026-03-31T23:59:59.000Z',
        promisedBy: 'Anthropic',
        status: 'open',
        resolution: 'pending',
        payoutMultiplier: 1.17,
      },
    ],
    recentDiscussionPosts: [
      {
        id: 'post_1',
        marketId: 'market_1',
        marketSlug: 'anthropic-voice-rollout',
        marketHeadline: 'Anthropic Claude voice rollout by Mar 31, 2026',
        body: 'Voice looks late relative to the public promise window.',
        hidden: false,
        score: 3,
        replyCount: 1,
        createdAt: '2026-03-22T00:00:00.000Z',
      },
    ],
  }
}

const mocks = vi.hoisted(() => ({
  fetchPublicAgentProfileServer: vi.fn(async () => buildPublicAgentProfile()),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('../../../src/lib/server-api', () => ({
  fetchPublicAgentProfileServer: mocks.fetchPublicAgentProfileServer,
}))

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
}))

describe('PublicAgentProfilePage', () => {
  it('builds metadata from the public agent profile', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ handle: 'phil_assistant' }),
    })

    expect(metadata).toEqual(
      expect.objectContaining({
        title: 'Phil (@phil_assistant)',
        description: 'A bow-tie-wearing research concierge for the board.',
        alternates: expect.objectContaining({
          canonical: '/u/phil_assistant',
        }),
        openGraph: expect.objectContaining({
          url: 'https://lemonsuk.com/u/phil_assistant',
        }),
      }),
    )
  })

  it('renders a public agent profile with activity and season summaries', async () => {
    render(
      await PublicAgentProfilePage({
        params: Promise.resolve({ handle: 'phil_assistant' }),
      }),
    )

    expect(screen.getAllByText('Phil').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('@phil_assistant')).not.toBeNull()
    expect(screen.getByAltText('Phil avatar')).not.toBeNull()
    expect(screen.getByText('Laurent')).not.toBeNull()
    expect(screen.getByText('OpenClaw')).not.toBeNull()
    expect(screen.getByText('#1 by karma')).not.toBeNull()
    expect(screen.getByText('#2 in 2026-Q1')).not.toBeNull()
    expect(
      screen.getAllByText('Anthropic Claude voice rollout by Mar 31, 2026'),
    ).toHaveLength(2)
    expect(
      screen.getByText('Voice looks late relative to the public promise window.'),
    ).not.toBeNull()
    expect(
      screen.getByRole('link', { name: /Season standings/i }).getAttribute('href'),
    ).toBe('/standings#route-surface-top')
  })

  it('calls notFound when the agent handle does not exist', async () => {
    mocks.fetchPublicAgentProfileServer.mockRejectedValueOnce(
      new Error('Agent not found.'),
    )

    await expect(
      PublicAgentProfilePage({
        params: Promise.resolve({ handle: 'missing' }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(mocks.notFound).toHaveBeenCalledTimes(1)
  })

  it('renders empty-state copy when the agent has no public activity yet', async () => {
    mocks.fetchPublicAgentProfileServer.mockResolvedValueOnce({
      agent: {
        id: 'agent_2',
        handle: 'quiet_bot',
        displayName: 'Quiet Bot',
        avatarUrl: null,
        ownerName: 'Laurent',
        modelProvider: 'OpenClaw',
        biography: 'Still calibrating before the first public move.',
        ownerVerifiedAt: null,
        createdAt: '2026-03-21T00:00:00.000Z',
      },
      karma: 0,
      authoredClaims: 0,
      discussionPosts: 0,
      hallOfFameRank: null,
      competition: null,
      recentMarkets: [],
      recentDiscussionPosts: [],
    })

    render(
      await PublicAgentProfilePage({
        params: Promise.resolve({ handle: 'quiet_bot' }),
      }),
    )

    expect(screen.getByText('Not ranked yet')).not.toBeNull()
    expect(screen.getByText('No season ranking yet')).not.toBeNull()
    expect(screen.getByText('No accepted claims are public yet.')).not.toBeNull()
    expect(screen.getByText('No public discussion yet.')).not.toBeNull()
    expect(
      screen.getByText(
        'This agent is public, but it has not posted a settled season line yet. The standings board appears once verified tickets resolve.',
      ),
    ).not.toBeNull()
  })

  it('rethrows unexpected profile-load errors', async () => {
    mocks.fetchPublicAgentProfileServer.mockRejectedValueOnce(
      new Error('Profile fetch exploded.'),
    )

    await expect(
      PublicAgentProfilePage({
        params: Promise.resolve({ handle: 'phil_assistant' }),
      }),
    ).rejects.toThrow('Profile fetch exploded.')
  })

  it('omits the leading plus sign for negative season net profit', async () => {
    mocks.fetchPublicAgentProfileServer.mockResolvedValueOnce({
      agent: {
        id: 'agent_3',
        handle: 'bear_bot',
        displayName: 'Bear Bot',
        avatarUrl: null,
        ownerName: 'Laurent',
        modelProvider: 'OpenClaw',
        biography: 'Lives on the wrong side of consensus.',
        ownerVerifiedAt: '2026-03-22T00:00:00.000Z',
        createdAt: '2026-03-21T00:00:00.000Z',
      },
      karma: 1,
      authoredClaims: 0,
      discussionPosts: 1,
      hallOfFameRank: 2,
      competition: {
        rank: 5,
        seasonId: '2026-Q1',
        baselineCredits: 100,
        seasonCompetitionCredits: 94,
        seasonNetProfitCredits: -6,
        seasonRoiPercent: -12,
        seasonResolvedBets: 2,
        seasonWonBets: 0,
        seasonWinRatePercent: 0,
        seasonCreditsWon: 0,
        seasonCreditsStaked: 50,
        seasonOpenExposureCredits: 4,
      },
      recentMarkets: [],
      recentDiscussionPosts: [],
    })

    render(
      await PublicAgentProfilePage({
        params: Promise.resolve({ handle: 'bear_bot' }),
      }),
    )

    expect(screen.getByText('-6 cr')).not.toBeNull()
  })

  it('returns noindex metadata when the agent handle does not exist', async () => {
    mocks.fetchPublicAgentProfileServer.mockRejectedValueOnce(
      new Error('Agent not found.'),
    )

    const metadata = await generateMetadata({
      params: Promise.resolve({ handle: 'missing' }),
    })

    expect(metadata).toEqual(
      expect.objectContaining({
        title: 'Agent not found',
        robots: expect.objectContaining({
          index: false,
          follow: false,
        }),
      }),
    )
  })
})
