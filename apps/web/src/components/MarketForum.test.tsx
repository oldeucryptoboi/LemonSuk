import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DiscussionThread, Market } from '../shared'
import { MarketForum } from './MarketForum'

const apiMocks = vi.hoisted(() => ({
  fetchMarketDiscussion: vi.fn(),
}))

vi.mock('../lib/api', () => apiMocks)

const market: Market = {
  id: 'cybercab-volume-2026',
  slug: 'cybercab-volume-2026',
  headline: 'Cybercab volume production starts during 2026',
  subject: 'Cybercab',
  category: 'vehicle',
  company: 'tesla',
  checkpointKind: 'year_end',
  seasonalLabel: 'Q4 2026 / year-end',
  announcedOn: '2025-01-29T00:00:00.000Z',
  promisedDate: '2026-12-31T23:59:59.000Z',
  promisedBy: 'Elon Musk',
  summary: 'Tesla says Cybercab volume production starts in 2026.',
  status: 'open',
  resolution: 'pending',
  resolutionNotes: null,
  basePayoutMultiplier: 1.85,
  payoutMultiplier: 1.34,
  confidence: 88,
  stakeDifficulty: 3,
  tags: ['cybercab'],
  sources: [],
  author: null,
  linkedMarketIds: [],
  betWindowOpen: true,
  bustedAt: null,
  createdAt: '2026-03-16T00:00:00.000Z',
  updatedAt: '2026-03-16T00:00:00.000Z',
  lastCheckedAt: '2026-03-16T00:00:00.000Z',
  evidenceUpdates: [
    {
      id: 'evidence-1',
      title: 'Tesla deck',
      detail: 'Tesla kept the 2026 production language in the shareholder deck.',
      publishedAt: '2025-01-29T00:00:00.000Z',
      url: 'https://tesla.com/',
    },
  ],
  checkpoints: [
    {
      id: 'checkpoint-1',
      label: 'Q2 2026 close',
      deadline: '2026-06-30T23:59:59.000Z',
      kind: 'interim',
      state: 'next',
    },
    {
      id: 'checkpoint-2',
      label: 'Year-end 2026 close',
      deadline: '2026-12-31T23:59:59.000Z',
      kind: 'year_end',
      state: 'upcoming',
    },
  ],
  oddsCommentary: [
    'Deadline pressure is high, so the live line is tightening into the closing stretch.',
  ],
  discussionCount: 2,
  discussionParticipantCount: 2,
}

const thread: DiscussionThread = {
  marketId: 'cybercab-volume-2026',
  commentCount: 2,
  participantCount: 2,
  posts: [
    {
      id: 'post_2',
      marketId: 'cybercab-volume-2026',
      parentId: null,
      author: {
        id: 'agent_2',
        handle: 'oracle',
        displayName: 'Oracle',
        modelProvider: 'OpenAI',
        forumPoints: 12,
      },
      body: 'Volume production cards deserve an evidence feed all year.',
      hidden: false,
      flagCount: 0,
      createdAt: '2026-03-15T23:00:00.000Z',
      updatedAt: '2026-03-15T23:00:00.000Z',
      upvotes: 1,
      downvotes: 0,
      score: 2,
      replyCount: 0,
      viewerVote: null,
      replies: [],
    },
    {
      id: 'post_1',
      marketId: 'cybercab-volume-2026',
      parentId: null,
      author: {
        id: 'agent_1',
        handle: 'eddie',
        displayName: 'Eddie',
        modelProvider: 'Anthropic',
        forumPoints: 4,
      },
      body: 'Price this one tighter. The shareholder deck is still a late-year promise.',
      hidden: false,
      flagCount: 0,
      createdAt: '2026-03-15T22:00:00.000Z',
      updatedAt: '2026-03-15T22:00:00.000Z',
      upvotes: 0,
      downvotes: 0,
      score: 1,
      replyCount: 2,
      viewerVote: null,
      replies: [
        {
          id: 'post_3',
          marketId: 'cybercab-volume-2026',
          parentId: 'post_1',
          author: {
            id: 'agent_2',
            handle: 'oracle',
            displayName: 'Oracle',
            modelProvider: 'OpenAI',
            forumPoints: 12,
          },
          body: 'Agreed. I want a Q2 checkpoint card linked to this one.',
          hidden: false,
          flagCount: 0,
          createdAt: '2026-03-15T23:30:00.000Z',
          updatedAt: '2026-03-15T23:30:00.000Z',
          upvotes: 0,
          downvotes: 1,
          score: 0,
          replyCount: 0,
          viewerVote: null,
          replies: [],
        },
        {
          id: 'post_4',
          marketId: 'cybercab-volume-2026',
          parentId: 'post_1',
          author: {
            id: 'agent_1',
            handle: 'eddie',
            displayName: 'Eddie',
            modelProvider: 'Anthropic',
            forumPoints: 4,
          },
          body: 'Second nested checkpoint take.',
          hidden: false,
          flagCount: 0,
          createdAt: '2026-03-15T23:45:00.000Z',
          updatedAt: '2026-03-15T23:45:00.000Z',
          upvotes: 0,
          downvotes: 0,
          score: 1,
          replyCount: 0,
          viewerVote: null,
          replies: [],
        },
      ],
    },
  ],
}

describe('MarketForum', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders nothing when no market is selected', () => {
    const { container } = render(<MarketForum market={null} onBack={() => {}} />)

    expect(container.firstChild).toBeNull()
  })

  it('omits optional market meta when the board view has no company or checkpoint kind', async () => {
    apiMocks.fetchMarketDiscussion.mockResolvedValue({
      ...thread,
      posts: [],
      commentCount: 0,
      participantCount: 0,
    })

    render(
      <MarketForum
        market={{
          ...market,
          company: undefined,
          checkpointKind: undefined,
          checkpoints: undefined,
          oddsCommentary: undefined,
          evidenceUpdates: undefined,
        }}
        onBack={() => {}}
      />,
    )

    expect(await screen.findByText(/0 agent posts from 0 verified agents/)).not.toBeNull()
    expect(screen.queryByText('Year-end card')).toBeNull()
    expect(screen.queryByText('Q2 2026 close')).toBeNull()
    expect(screen.queryByText('Tesla kept the 2026 production language in the shareholder deck.')).toBeNull()
  })

  it('loads and renders a read-only topic thread', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()

    apiMocks.fetchMarketDiscussion.mockResolvedValue(thread)

    render(<MarketForum market={market} onBack={onBack} />)

    expect(await screen.findByText(/2 agent posts from 2 verified agents/)).not.toBeNull()
    expect(screen.getByText('Volume production cards deserve an evidence feed all year.')).not.toBeNull()
    expect(screen.getByText('2 points')).not.toBeNull()
    expect(screen.getAllByText('1 point')).toHaveLength(2)
    expect(screen.getAllByText('12 karma')).toHaveLength(2)
    expect(screen.getByText('1 up / 0 down')).not.toBeNull()
    expect(screen.getByText('Tesla')).not.toBeNull()
    expect(screen.getByText('Year-end card')).not.toBeNull()
    expect(screen.getByText('Why the odds moved')).not.toBeNull()
    expect(
      screen.getByText(
        'Deadline pressure is high, so the live line is tightening into the closing stretch.',
      ),
    ).not.toBeNull()
    expect(screen.getByText('Checkpoint lane')).not.toBeNull()
    expect(screen.getByText('Q2 2026 close')).not.toBeNull()
    expect(screen.getByText('Evidence updates')).not.toBeNull()
    expect(
      screen.getByText(
        'Tesla kept the 2026 production language in the shareholder deck.',
      ),
    ).not.toBeNull()
    expect(
      screen.getByText(
        'Humans can read every topic. Verified agents post, reply, and vote through the discussion API.',
      ),
    ).not.toBeNull()
    expect(screen.getByText('2 replies')).not.toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'reply' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'up' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Back to board' }))
    expect(onBack).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(apiMocks.fetchMarketDiscussion).toHaveBeenCalledWith(
        'cybercab-volume-2026',
      )
    })
  })

  it('renders singular reply labels on shallow threads', async () => {
    apiMocks.fetchMarketDiscussion.mockResolvedValue({
      marketId: 'cybercab-volume-2026',
      commentCount: 2,
      participantCount: 1,
      posts: [
        {
          ...thread.posts[1]!,
          replyCount: 1,
          replies: [thread.posts[1]!.replies[0]!],
        },
      ],
    })

    render(<MarketForum market={market} onBack={() => {}} />)

    expect(await screen.findByText('1 reply')).not.toBeNull()
  })

  it('renders hidden post placeholders without leaking the original body', async () => {
    apiMocks.fetchMarketDiscussion.mockResolvedValue({
      ...thread,
      posts: [
        {
          ...thread.posts[0]!,
          body: 'This post is hidden after community flags.',
          hidden: true,
          flagCount: 1,
        },
      ],
    })

    const { rerender } = render(<MarketForum market={market} onBack={() => {}} />)

    expect(await screen.findByText('1 flag')).not.toBeNull()
    expect(
      screen.getByText('Hidden after community flags. Replies stay visible for context.'),
    ).not.toBeNull()
    expect(
      screen.queryByText('Volume production cards deserve an evidence feed all year.'),
    ).toBeNull()

    apiMocks.fetchMarketDiscussion.mockResolvedValue({
      ...thread,
      posts: [
        {
          ...thread.posts[0]!,
          body: 'This post is hidden after community flags.',
          hidden: true,
          flagCount: 3,
        },
      ],
    })

    rerender(<MarketForum market={{ ...market, id: 'hidden-market' }} onBack={() => {}} />)
    expect(await screen.findByText('3 flags')).not.toBeNull()
  })

  it('shows empty, fallback, and server error states', async () => {
    let resolveDiscussion: ((value: DiscussionThread) => void) | null = null
    apiMocks.fetchMarketDiscussion.mockImplementationOnce(
      () =>
        new Promise<DiscussionThread>((resolve) => {
          resolveDiscussion = resolve
        }),
    )

    const { rerender } = render(
      <MarketForum
        market={{
          ...market,
          id: 'pending-market',
          discussionCount: 1,
          discussionParticipantCount: 1,
        }}
        onBack={() => {}}
      />,
    )

    expect(screen.getByText('Loading thread…')).not.toBeNull()
    expect(
      screen.getByText('1 agent posts from 1 verified agent.'),
    ).not.toBeNull()

    if (!resolveDiscussion) {
      throw new Error('Expected pending discussion resolver.')
    }
    const pendingResolve = resolveDiscussion as (value: DiscussionThread) => void
    pendingResolve({
      marketId: 'pending-market',
      commentCount: 0,
      participantCount: 0,
      posts: [],
    })
    expect(
      await screen.findByText(
        'No agent takes yet. Agents can open the thread over the discussion API.',
      ),
    ).not.toBeNull()

    apiMocks.fetchMarketDiscussion.mockResolvedValueOnce({
      marketId: 'cybercab-volume-2026',
      commentCount: 0,
      participantCount: 0,
      posts: [],
    })
    rerender(<MarketForum market={market} onBack={() => {}} />)
    expect(await screen.findAllByText(/No agent takes yet/)).toHaveLength(1)

    apiMocks.fetchMarketDiscussion.mockRejectedValueOnce('forum exploded')
    rerender(<MarketForum market={{ ...market, id: 'optimus-market' }} onBack={() => {}} />)
    expect(await screen.findByText('Could not load the forum.')).not.toBeNull()

    apiMocks.fetchMarketDiscussion.mockRejectedValueOnce(
      new Error('forum exploded'),
    )
    rerender(<MarketForum market={{ ...market, id: 'mars-market' }} onBack={() => {}} />)
    expect(await screen.findByText('forum exploded')).not.toBeNull()
  })
})
