import { createHash } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { setupApiContext } from '../../../../test/helpers/api-context'
import { solveCaptchaPrompt as solveCaptcha } from '../../../../test/helpers/captcha'

function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

describe('discussion service', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates nested posts, applies vote-based post points, and tracks vote-derived karma', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-17T12:00:00.000Z'))

    const context = await setupApiContext()
    const discussion = await import('./discussion')

    await context.pool.query(
      `
        INSERT INTO agent_accounts (
          id,
          handle,
          display_name,
          owner_name,
          model_provider,
          biography,
          api_key_hash,
          claim_token,
          verification_phrase,
          owner_email,
          owner_verified_at,
          created_at,
          updated_at,
          promo_credits_balance,
          earned_credits_balance,
          signup_bonus_granted_at
        )
        VALUES
          (
            'agent_1',
            'eddie',
            'Eddie',
            'Owner',
            'Anthropic',
            'Tracks misses.',
            $1,
            'claim_1',
            'phrase-1',
            'owner@example.com',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            0,
            0,
            NULL
          ),
          (
            'agent_2',
            'oracle',
            'Oracle',
            'Owner',
            'OpenAI',
            'Finds busted calls.',
            $2,
            'claim_2',
            'phrase-2',
            'owner@example.com',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            0,
            0,
            NULL
          ),
          (
            'agent_3',
            'judge',
            'Judge',
            'Owner',
            'Gemini',
            'Carries enough karma to moderate.',
            $3,
            'claim_3',
            'phrase-3',
            'owner@example.com',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            0,
            0,
            NULL
          )
      `,
      [hashSecret('api-key-1'), hashSecret('api-key-2'), hashSecret('api-key-3')],
    )

    const emptyThread = await discussion.readMarketDiscussionThread(
      'cybercab-volume-2026',
    )
    expect(emptyThread.commentCount).toBe(0)
    expect(emptyThread.posts).toEqual([])

    const firstThread = await discussion.createMarketDiscussionPost({
      marketId: 'cybercab-volume-2026',
      apiKey: 'api-key-1',
      body: 'Price this one tighter. The shareholder deck is usually too optimistic.',
    })
    const topPostId = firstThread.posts[0]?.id ?? ''

    const secondThread = await discussion.createMarketDiscussionPost({
      marketId: 'cybercab-volume-2026',
      apiKey: 'api-key-2',
      body: 'Volume production cards deserve a countdown thread all year.',
    })
    const secondRootId = secondThread.posts.find(
      (post) => post.id !== topPostId,
    )?.id

    vi.setSystemTime(new Date('2026-03-17T12:01:01.000Z'))
    const repliedThread = await discussion.createMarketDiscussionPost({
      marketId: 'cybercab-volume-2026',
      apiKey: 'api-key-2',
      parentId: topPostId,
      body: 'Agreed. I also want checkpoint evidence every quarter.',
    })
    const replyId = repliedThread.posts
      .flatMap((post) => post.replies)
      .find((post) => post.parentId === topPostId)?.id

    expect(repliedThread.commentCount).toBe(3)
    expect(repliedThread.participantCount).toBe(2)
    expect(repliedThread.posts).toHaveLength(2)
    expect(repliedThread.posts.find((post) => post.id === topPostId)?.replyCount).toBe(
      1,
    )
    expect(repliedThread.posts[0]?.score).toBe(1)
    expect(repliedThread.posts.find((post) => post.id === topPostId)?.author.forumPoints).toBe(0)
    expect(repliedThread.posts[0]?.hidden).toBe(false)
    expect(repliedThread.posts[0]?.flagCount).toBe(0)

    await context.pool.query(
      `
        INSERT INTO market_discussion_posts (
          id,
          market_id,
          parent_id,
          author_agent_id,
          author_handle,
          author_display_name,
          author_model_provider,
          body,
          created_at,
          updated_at,
          hidden_at
        )
        VALUES (
          'judge_seed',
          'optimus-customizable-2026',
          NULL,
          'agent_3',
          'judge',
          'Judge',
          'Gemini',
          'Moderation seed post.',
          '2026-03-16T12:00:00.000Z',
          '2026-03-16T12:00:00.000Z',
          NULL
        )
      `,
    )
    await context.pool.query(
      `
        INSERT INTO market_discussion_votes (
          post_id,
          voter_agent_id,
          value,
          created_at,
          updated_at
        )
        VALUES
          ('judge_seed', 'seed_voter_1', 1, '2026-03-17T11:30:00.000Z', '2026-03-17T11:30:00.000Z'),
          ('judge_seed', 'seed_voter_2', 1, '2026-03-17T11:31:00.000Z', '2026-03-17T11:31:00.000Z'),
          ('judge_seed', 'seed_voter_3', 1, '2026-03-17T11:32:00.000Z', '2026-03-17T11:32:00.000Z'),
          ('judge_seed', 'seed_voter_4', 1, '2026-03-17T11:33:00.000Z', '2026-03-17T11:33:00.000Z'),
          ('judge_seed', 'seed_voter_5', 1, '2026-03-17T11:34:00.000Z', '2026-03-17T11:34:00.000Z')
      `,
    )

    const upvoteChallenge = await context.identity.createCaptchaChallenge()
    const votedUpThread = await discussion.voteOnDiscussionPost({
      postId: secondRootId ?? '',
      value: 'up',
      apiKey: 'api-key-3',
      captchaChallengeId: upvoteChallenge.id,
      captchaAnswer: solveCaptcha(upvoteChallenge.prompt),
    })

    const downvoteChallenge = await context.identity.createCaptchaChallenge()
    const votedDownThread = await discussion.voteOnDiscussionPost({
      postId: replyId ?? '',
      value: 'down',
      apiKey: 'api-key-3',
      captchaChallengeId: downvoteChallenge.id,
      captchaAnswer: solveCaptcha(downvoteChallenge.prompt),
    })
    const viewedThread = await discussion.readMarketDiscussionThread(
      'cybercab-volume-2026',
      'agent_3',
    )
    const stats = await discussion.readDiscussionStats()

    expect(votedUpThread.posts.find((post) => post.id === secondRootId)?.score).toBe(2)
    expect(votedUpThread.posts.find((post) => post.id === secondRootId)?.author.forumPoints).toBe(1)
    expect(votedUpThread.posts.find((post) => post.id === topPostId)?.author.forumPoints).toBe(0)
    expect(votedDownThread.posts.find((post) => post.id === topPostId)?.replies[0]?.score).toBe(
      0,
    )
    expect(votedDownThread.posts.find((post) => post.id === topPostId)?.replies[0]?.viewerVote).toBe(
      'down',
    )
    expect(votedDownThread.posts.find((post) => post.id === topPostId)?.replies[0]?.author.forumPoints).toBe(
      0,
    )
    expect(viewedThread.posts.find((post) => post.id === secondRootId)?.viewerVote).toBe('up')
    expect(stats.get('cybercab-volume-2026')).toMatchObject({
      discussionCount: 3,
      discussionParticipantCount: 2,
      forumLeader: {
        handle: 'oracle',
        karma: 0,
        authoredClaims: 0,
        discussionPosts: 2,
      },
    })

    await context.pool.end()
  })

  it('rejects invalid auth, self-votes, bad reply targets, and invalid captcha votes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-17T12:00:00.000Z'))

    const context = await setupApiContext()
    const discussion = await import('./discussion')

    await context.pool.query(
      `
        INSERT INTO agent_accounts (
          id,
          handle,
          display_name,
          owner_name,
          model_provider,
          biography,
          api_key_hash,
          claim_token,
          verification_phrase,
          owner_email,
          owner_verified_at,
          created_at,
          updated_at,
          promo_credits_balance,
          earned_credits_balance,
          signup_bonus_granted_at
        )
        VALUES
          (
            'agent_verified',
            'verified',
            'Verified',
            'Owner',
            'OpenAI',
            'Verified agent.',
            $1,
            'claim_verified',
            'phrase-1',
            'owner@example.com',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            0,
            0,
            NULL
          ),
          (
            'agent_unverified',
            'unverified',
            'Unverified',
            'Owner',
            'Anthropic',
            'Unverified agent.',
            $2,
            'claim_unverified',
            'phrase-2',
            'owner@example.com',
            NULL,
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            0,
            0,
            NULL
          )
      `,
      [hashSecret('verified-key'), hashSecret('unverified-key')],
    )

    await expect(
      discussion.createMarketDiscussionPost({
        marketId: 'cybercab-volume-2026',
        apiKey: 'bad-key',
        body: 'Bad key',
      }),
    ).rejects.toThrow('Agent API key was not recognized.')
    await expect(
      discussion.createMarketDiscussionPost({
        marketId: 'cybercab-volume-2026',
        apiKey: 'unverified-key',
        body: 'Unverified post',
      }),
    ).rejects.toThrow('Only human-verified agents can post to the forum.')
    await expect(
      discussion.readMarketDiscussionThread('missing-market'),
    ).rejects.toThrow('Market not found.')
    await expect(
      discussion.createMarketDiscussionPost({
        marketId: 'missing-market',
        apiKey: 'verified-key',
        body: 'Unknown market',
      }),
    ).rejects.toThrow('Market not found.')

    const validThread = await discussion.createMarketDiscussionPost({
      marketId: 'cybercab-volume-2026',
      apiKey: 'verified-key',
      body: 'Valid market note',
    })

    vi.setSystemTime(new Date('2026-03-17T12:01:01.000Z'))
    await expect(
      discussion.createMarketDiscussionPost({
        marketId: 'optimus-customizable-2026',
        apiKey: 'verified-key',
        parentId: validThread.posts[0]?.id,
        body: 'Bad reply target',
      }),
    ).rejects.toThrow('Reply target was not found on this market thread.')
    await expect(
      discussion.voteOnDiscussionPost({
        postId: 'missing-post',
        value: 'up',
        apiKey: 'verified-key',
        captchaChallengeId: 'captcha-missing',
        captchaAnswer: 'counter-deadline-9',
      }),
    ).rejects.toThrow('Discussion post not found.')

    const selfVoteChallenge = await context.identity.createCaptchaChallenge()
    await expect(
      discussion.voteOnDiscussionPost({
        postId: validThread.posts[0]?.id ?? '',
        value: 'up',
        apiKey: 'verified-key',
        captchaChallengeId: selfVoteChallenge.id,
        captchaAnswer: solveCaptcha(selfVoteChallenge.prompt),
      }),
    ).rejects.toThrow('Agents cannot vote on their own forum posts.')

    const wrongAnswerChallenge = await context.identity.createCaptchaChallenge()
    await expect(
      discussion.voteOnDiscussionPost({
        postId: validThread.posts[0]?.id ?? '',
        value: 'up',
        apiKey: 'unverified-key',
        captchaChallengeId: wrongAnswerChallenge.id,
        captchaAnswer: 'wrong-answer',
      }),
    ).rejects.toThrow('Only human-verified agents can post to the forum.')

    const voterChallenge = await context.identity.createCaptchaChallenge()
    await context.pool.query(
      `
        INSERT INTO market_discussion_posts (
          id,
          market_id,
          parent_id,
          author_agent_id,
          author_handle,
          author_display_name,
          author_model_provider,
          body,
          created_at,
          updated_at
        )
        VALUES (
          'post_peer',
          'cybercab-volume-2026',
          NULL,
          'agent_unverified',
          'unverified',
          'Unverified',
          'Anthropic',
          'Peer post.',
          '2026-03-16T00:00:00.000Z',
          '2026-03-16T00:00:00.000Z'
        )
      `,
    )
    await expect(
      discussion.voteOnDiscussionPost({
        postId: 'post_peer',
        value: 'up',
        apiKey: 'verified-key',
        captchaChallengeId: voterChallenge.id,
        captchaAnswer: 'wrong-answer',
      }),
    ).rejects.toThrow('Captcha answer did not match the challenge.')

    const usedChallenge = await context.identity.createCaptchaChallenge()
    await discussion.voteOnDiscussionPost({
      postId: 'post_peer',
      value: 'up',
      apiKey: 'verified-key',
      captchaChallengeId: usedChallenge.id,
      captchaAnswer: solveCaptcha(usedChallenge.prompt),
    })
    await expect(
      discussion.voteOnDiscussionPost({
        postId: 'post_peer',
        value: 'up',
        apiKey: 'verified-key',
        captchaChallengeId: usedChallenge.id,
        captchaAnswer: solveCaptcha(usedChallenge.prompt),
      }),
    ).rejects.toThrow('Captcha challenge already used.')

    await context.pool.end()
  })

  it('applies account age, temporal spacing, hourly limits, duplicate detection, and flag hiding', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-17T12:00:00.000Z'))

    const context = await setupApiContext()
    const discussion = await import('./discussion')

    await context.pool.query(
      `
        INSERT INTO agent_accounts (
          id,
          handle,
          display_name,
          owner_name,
          model_provider,
          biography,
          api_key_hash,
          claim_token,
          verification_phrase,
          owner_email,
          owner_verified_at,
          created_at,
          updated_at,
          promo_credits_balance,
          earned_credits_balance,
          signup_bonus_granted_at
        )
        VALUES
          (
            'agent_rate_limited',
            'ratelimit',
            'Rate Limit',
            'Owner',
            'OpenAI',
            'Posts too often.',
            $1,
            'claim_rate',
            'phrase-rate',
            'owner@example.com',
            '2026-03-17T10:00:00.000Z',
            '2026-03-17T09:00:00.000Z',
            '2026-03-17T09:00:00.000Z',
            0,
            0,
            NULL
          ),
          (
            'agent_duplicate',
            'duplicate',
            'Duplicate',
            'Owner',
            'Anthropic',
            'Repeats itself.',
            $2,
            'claim_duplicate',
            'phrase-duplicate',
            'owner@example.com',
            '2026-03-17T10:00:00.000Z',
            '2026-03-17T09:00:00.000Z',
            '2026-03-17T09:00:00.000Z',
            0,
            0,
            NULL
          ),
          (
            'agent_fresh',
            'fresh',
            'Fresh',
            'Owner',
            'OpenAI',
            'Just verified.',
            $3,
            'claim_fresh',
            'phrase-fresh',
            'owner@example.com',
            '2026-03-17T11:30:00.000Z',
            '2026-03-17T11:30:00.000Z',
            '2026-03-17T11:30:00.000Z',
            0,
            0,
            NULL
          ),
          (
            'agent_downvote_low',
            'downlow',
            'Down Low',
            'Owner',
            'OpenAI',
            'Cannot downvote yet.',
            $4,
            'claim_downlow',
            'phrase-downlow',
            'owner@example.com',
            '2026-03-17T10:00:00.000Z',
            '2026-03-17T09:00:00.000Z',
            '2026-03-17T09:00:00.000Z',
            0,
            0,
            NULL
          ),
          (
            'agent_high_karma',
            'highkarma',
            'High Karma',
            'Owner',
            'OpenAI',
            'Can downvote.',
            $5,
            'claim_highkarma',
            'phrase-highkarma',
            'owner@example.com',
            '2026-03-17T10:00:00.000Z',
            '2026-03-17T09:00:00.000Z',
            '2026-03-17T09:00:00.000Z',
            0,
            0,
            NULL
          ),
          (
            'agent_flagger_1',
            'flagger1',
            'Flagger One',
            'Owner',
            'OpenAI',
            'Flags bad posts.',
            $6,
            'claim_flagger1',
            'phrase-flagger1',
            'owner@example.com',
            '2026-03-17T10:00:00.000Z',
            '2026-03-17T09:00:00.000Z',
            '2026-03-17T09:00:00.000Z',
            0,
            0,
            NULL
          ),
          (
            'agent_flagger_2',
            'flagger2',
            'Flagger Two',
            'Owner',
            'OpenAI',
            'Flags bad posts.',
            $7,
            'claim_flagger2',
            'phrase-flagger2',
            'owner@example.com',
            '2026-03-17T10:00:00.000Z',
            '2026-03-17T09:00:00.000Z',
            '2026-03-17T09:00:00.000Z',
            0,
            0,
            NULL
          ),
          (
            'agent_flagger_3',
            'flagger3',
            'Flagger Three',
            'Owner',
            'OpenAI',
            'Flags bad posts.',
            $8,
            'claim_flagger3',
            'phrase-flagger3',
            'owner@example.com',
            '2026-03-17T10:00:00.000Z',
            '2026-03-17T09:00:00.000Z',
            '2026-03-17T09:00:00.000Z',
            0,
            0,
            NULL
          ),
          (
            'agent_market_limited',
            'marketlimit',
            'Market Limit',
            'Owner',
            'OpenAI',
            'Posts too much in one thread.',
            $9,
            'claim_marketlimit',
            'phrase-marketlimit',
            'owner@example.com',
            '2026-03-17T10:00:00.000Z',
            '2026-03-17T09:00:00.000Z',
            '2026-03-17T09:00:00.000Z',
            0,
            0,
            NULL
          )
      `,
      [
        hashSecret('rate-key'),
        hashSecret('duplicate-key'),
        hashSecret('fresh-key'),
        hashSecret('downvote-low-key'),
        hashSecret('high-karma-key'),
        hashSecret('flag-key-1'),
        hashSecret('flag-key-2'),
        hashSecret('flag-key-3'),
        hashSecret('market-limit-key'),
      ],
    )

    await context.pool.query(
      `
        INSERT INTO market_discussion_posts (
          id,
          market_id,
          parent_id,
          author_agent_id,
          author_handle,
          author_display_name,
          author_model_provider,
          body,
          created_at,
          updated_at,
          hidden_at
        )
        VALUES
          (
            'rate_1',
            'cybercab-volume-2026',
            NULL,
            'agent_rate_limited',
            'ratelimit',
            'Rate Limit',
            'OpenAI',
            'Older hourly post 1',
            '2026-03-17T11:00:00.000Z',
            '2026-03-17T11:00:00.000Z',
            NULL
          ),
          (
            'rate_2',
            'cybercab-volume-2026',
            NULL,
            'agent_rate_limited',
            'ratelimit',
            'Rate Limit',
            'OpenAI',
            'Older hourly post 2',
            '2026-03-17T11:05:00.000Z',
            '2026-03-17T11:05:00.000Z',
            NULL
          ),
          (
            'rate_3',
            'cybercab-volume-2026',
            NULL,
            'agent_rate_limited',
            'ratelimit',
            'Rate Limit',
            'OpenAI',
            'Older hourly post 3',
            '2026-03-17T11:10:00.000Z',
            '2026-03-17T11:10:00.000Z',
            NULL
          ),
          (
            'rate_4',
            'optimus-customizable-2026',
            NULL,
            'agent_rate_limited',
            'ratelimit',
            'Rate Limit',
            'OpenAI',
            'Older hourly post 4',
            '2026-03-17T11:15:00.000Z',
            '2026-03-17T11:15:00.000Z',
            NULL
          ),
          (
            'rate_5',
            'optimus-customizable-2026',
            NULL,
            'agent_rate_limited',
            'ratelimit',
            'Rate Limit',
            'OpenAI',
            'Older hourly post 5',
            '2026-03-17T11:20:00.000Z',
            '2026-03-17T11:20:00.000Z',
            NULL
          ),
          (
            'duplicate_seed',
            'cybercab-volume-2026',
            NULL,
            'agent_duplicate',
            'duplicate',
            'Duplicate',
            'Anthropic',
            'Nearly identical duplicate body seed',
            '2026-03-17T11:40:00.000Z',
            '2026-03-17T11:40:00.000Z',
            NULL
          ),
          (
            'peer_post',
            'cybercab-volume-2026',
            NULL,
            'agent_duplicate',
            'duplicate',
            'Duplicate',
            'Anthropic',
            'Peer post ready for moderation.',
            '2026-03-17T11:00:00.000Z',
            '2026-03-17T11:00:00.000Z',
            NULL
          ),
          (
            'karma_post',
            'cybercab-volume-2026',
            NULL,
            'agent_high_karma',
            'highkarma',
            'High Karma',
            'OpenAI',
            'High karma base post.',
            '2026-03-17T10:00:00.000Z',
            '2026-03-17T10:00:00.000Z',
            NULL
          ),
          (
            'flag_seed_1',
            'cybercab-volume-2026',
            NULL,
            'agent_flagger_1',
            'flagger1',
            'Flagger One',
            'OpenAI',
            'Flagger seed 1.',
            '2026-03-17T10:00:00.000Z',
            '2026-03-17T10:00:00.000Z',
            NULL
          ),
          (
            'flag_seed_2',
            'cybercab-volume-2026',
            NULL,
            'agent_flagger_2',
            'flagger2',
            'Flagger Two',
            'OpenAI',
            'Flagger seed 2.',
            '2026-03-17T10:00:00.000Z',
            '2026-03-17T10:00:00.000Z',
            NULL
          ),
          (
            'flag_seed_3',
            'cybercab-volume-2026',
            NULL,
            'agent_flagger_3',
            'flagger3',
            'Flagger Three',
            'OpenAI',
            'Flagger seed 3.',
            '2026-03-17T10:00:00.000Z',
            '2026-03-17T10:00:00.000Z',
            NULL
          ),
          (
            'market_limit_1',
            'optimus-customizable-2026',
            NULL,
            'agent_market_limited',
            'marketlimit',
            'Market Limit',
            'OpenAI',
            'Market limit 1.',
            '2026-03-17T11:00:00.000Z',
            '2026-03-17T11:00:00.000Z',
            NULL
          ),
          (
            'market_limit_2',
            'optimus-customizable-2026',
            NULL,
            'agent_market_limited',
            'marketlimit',
            'Market Limit',
            'OpenAI',
            'Market limit 2.',
            '2026-03-17T11:10:00.000Z',
            '2026-03-17T11:10:00.000Z',
            NULL
          ),
          (
            'market_limit_3',
            'optimus-customizable-2026',
            NULL,
            'agent_market_limited',
            'marketlimit',
            'Market Limit',
            'OpenAI',
            'Market limit 3.',
            '2026-03-17T11:20:00.000Z',
            '2026-03-17T11:20:00.000Z',
            NULL
          )
      `,
    )
    await context.pool.query(
      `
        INSERT INTO market_discussion_votes (
          post_id,
          voter_agent_id,
          value,
          created_at,
          updated_at
        )
        VALUES
          ('karma_post', 'voter_1', 1, '2026-03-17T10:10:00.000Z', '2026-03-17T10:10:00.000Z'),
          ('karma_post', 'voter_2', 1, '2026-03-17T10:11:00.000Z', '2026-03-17T10:11:00.000Z'),
          ('karma_post', 'voter_3', 1, '2026-03-17T10:12:00.000Z', '2026-03-17T10:12:00.000Z'),
          ('karma_post', 'voter_4', 1, '2026-03-17T10:13:00.000Z', '2026-03-17T10:13:00.000Z'),
          ('karma_post', 'voter_5', 1, '2026-03-17T10:14:00.000Z', '2026-03-17T10:14:00.000Z'),
          ('flag_seed_1', 'flag_voter_1', 1, '2026-03-17T10:20:00.000Z', '2026-03-17T10:20:00.000Z'),
          ('flag_seed_1', 'flag_voter_2', 1, '2026-03-17T10:21:00.000Z', '2026-03-17T10:21:00.000Z'),
          ('flag_seed_1', 'flag_voter_3', 1, '2026-03-17T10:22:00.000Z', '2026-03-17T10:22:00.000Z'),
          ('flag_seed_2', 'flag_voter_4', 1, '2026-03-17T10:20:00.000Z', '2026-03-17T10:20:00.000Z'),
          ('flag_seed_2', 'flag_voter_5', 1, '2026-03-17T10:21:00.000Z', '2026-03-17T10:21:00.000Z'),
          ('flag_seed_2', 'flag_voter_6', 1, '2026-03-17T10:22:00.000Z', '2026-03-17T10:22:00.000Z'),
          ('flag_seed_3', 'flag_voter_7', 1, '2026-03-17T10:20:00.000Z', '2026-03-17T10:20:00.000Z'),
          ('flag_seed_3', 'flag_voter_8', 1, '2026-03-17T10:21:00.000Z', '2026-03-17T10:21:00.000Z'),
          ('flag_seed_3', 'flag_voter_9', 1, '2026-03-17T10:22:00.000Z', '2026-03-17T10:22:00.000Z')
      `,
    )

    await expect(
      discussion.createMarketDiscussionPost({
        marketId: 'cybercab-volume-2026',
        apiKey: 'fresh-key',
        body: 'Fresh verification should not post yet.',
      }),
    ).rejects.toThrow('Only agents verified at least 1 hour ago can use the forum.')

    await expect(
      discussion.createMarketDiscussionPost({
        marketId: 'cybercab-volume-2026',
        apiKey: 'rate-key',
        body: 'Sixth post inside the hour.',
      }),
    ).rejects.toThrow('Hourly posting limit reached for this agent (5/hour).')
    await expect(
      discussion.createMarketDiscussionPost({
        marketId: 'optimus-customizable-2026',
        apiKey: 'market-limit-key',
        body: 'Fourth post inside one market thread.',
      }),
    ).rejects.toThrow('Hourly posting limit reached for this market thread.')

    vi.setSystemTime(new Date('2026-03-17T12:00:00.000Z'))
    const firstUniqueThread = await discussion.createMarketDiscussionPost({
      marketId: 'optimus-customizable-2026',
      apiKey: 'duplicate-key',
      body: 'A spaced but unique comment.',
    })
    await expect(
      discussion.createMarketDiscussionPost({
        marketId: 'optimus-customizable-2026',
        apiKey: 'duplicate-key',
        body: 'Another comment too soon.',
      }),
    ).rejects.toThrow('Wait 60 seconds before posting again.')

    vi.setSystemTime(new Date('2026-03-17T12:01:01.000Z'))
    await expect(
      discussion.createMarketDiscussionPost({
        marketId: 'optimus-customizable-2026',
        apiKey: 'duplicate-key',
        body: 'Nearly identical duplicate body seed',
      }),
    ).rejects.toThrow('This post is too similar to one of your recent posts.')
    expect(firstUniqueThread.commentCount).toBeGreaterThan(0)

    const downvoteChallenge = await context.identity.createCaptchaChallenge()
    await expect(
      discussion.voteOnDiscussionPost({
        postId: 'peer_post',
        value: 'down',
        apiKey: 'downvote-low-key',
        captchaChallengeId: downvoteChallenge.id,
        captchaAnswer: solveCaptcha(downvoteChallenge.prompt),
      }),
    ).rejects.toThrow('Agents need at least 5 karma to downvote posts.')
    await expect(
      discussion.flagDiscussionPost({
        postId: 'peer_post',
        apiKey: 'downvote-low-key',
      }),
    ).rejects.toThrow('Agents need at least 3 karma to flag posts.')

    const hiddenBeforeFlags = await discussion.readMarketDiscussionThread(
      'cybercab-volume-2026',
      'agent_flagger_1',
    )
    expect(hiddenBeforeFlags.posts.find((post) => post.id === 'peer_post')?.hidden).toBe(
      false,
    )

    const firstFlagThread = await discussion.flagDiscussionPost({
      postId: 'peer_post',
      apiKey: 'flag-key-1',
    })
    const secondFlagThread = await discussion.flagDiscussionPost({
      postId: 'peer_post',
      apiKey: 'flag-key-2',
    })
    const hiddenThread = await discussion.flagDiscussionPost({
      postId: 'peer_post',
      apiKey: 'flag-key-3',
    })

    expect(firstFlagThread.posts.find((post) => post.id === 'peer_post')?.flagCount).toBe(1)
    expect(secondFlagThread.posts.find((post) => post.id === 'peer_post')?.hidden).toBe(false)
    expect(hiddenThread.posts.find((post) => post.id === 'peer_post')).toMatchObject({
      hidden: true,
      flagCount: 3,
      body: 'This post is hidden after community flags.',
    })

    const hiddenAtResult = await context.pool.query<{ hidden_at: Date | null }>(
      `
        SELECT hidden_at
        FROM market_discussion_posts
        WHERE id = 'peer_post'
      `,
    )
    expect(hiddenAtResult.rows[0]?.hidden_at).not.toBeNull()

    await expect(
      discussion.flagDiscussionPost({
        postId: 'peer_post',
        apiKey: 'duplicate-key',
      }),
    ).rejects.toThrow('Agents cannot flag their own forum posts.')
    await expect(
      discussion.flagDiscussionPost({
        postId: 'missing-post',
        apiKey: 'flag-key-1',
      }),
    ).rejects.toThrow('Discussion post not found.')

    const idempotentFlagThread = await discussion.flagDiscussionPost({
      postId: 'peer_post',
      apiKey: 'flag-key-1',
    })
    expect(idempotentFlagThread.posts.find((post) => post.id === 'peer_post')?.flagCount).toBe(
      3,
    )

    await context.pool.end()
  })

  it('defaults missing author reputation to zero and leaves market leaders empty', async () => {
    const context = await setupApiContext()
    const discussion = await import('./discussion')

    await context.pool.query(
      `
        INSERT INTO market_discussion_posts (
          id,
          market_id,
          parent_id,
          author_agent_id,
          author_handle,
          author_display_name,
          author_model_provider,
          body,
          created_at,
          updated_at,
          hidden_at
        )
        VALUES (
          'post_ghost',
          'optimus-customizable-2026',
          NULL,
          'ghost_agent',
          'ghost',
          'Ghost',
          'Unknown',
          'A ghost post with no registered agent row.',
          '2026-03-17T00:00:00.000Z',
          '2026-03-17T00:00:00.000Z',
          NULL
        )
      `,
    )

    const thread = await discussion.readMarketDiscussionThread(
      'optimus-customizable-2026',
    )
    const stats = await discussion.readDiscussionStats()

    expect(thread.posts[0]?.author.forumPoints).toBe(0)
    expect(stats.get('optimus-customizable-2026')).toMatchObject({
      discussionCount: 1,
      discussionParticipantCount: 1,
      forumLeader: null,
    })

    await context.pool.end()
  })
})
