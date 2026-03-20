import { createHash, randomUUID } from 'node:crypto'

import type { PoolClient } from 'pg'

import type {
  DiscussionAuthor,
  DiscussionPost,
  DiscussionThread,
  DiscussionVoteInput,
  Market,
} from '../shared'
import {
  discussionThreadSchema,
  discussionVoteDirectionSchema,
} from '../shared'
import { withDatabaseClient, withDatabaseTransaction } from './database'
import {
  FLAG_HIDE_THRESHOLD,
  assertAgentCanDownvote,
  assertAgentCanFlag,
  assertForumAccountAge,
  assertForumHourlyPostLimit,
  assertForumPostIsNotDuplicate,
  assertForumTemporalSpacing,
} from './discussion-guards'
import { consumeCaptchaChallengeFromClient } from './identity'
import {
  type AgentReputation,
  readAgentReputationFromClient,
  readMarketForumLeadersFromClient,
} from './reputation'
import { ensureStore } from './store'

type DiscussionPostRow = {
  id: string
  market_id: string
  parent_id: string | null
  author_agent_id: string
  author_handle: string
  author_display_name: string
  author_avatar_url: string | null
  author_model_provider: string
  body: string
  hidden_at: Date | null
  flag_count: number
  created_at: Date
  updated_at: Date
}

type DiscussionVoteAggregateRow = {
  post_id: string
  upvotes: number
  downvotes: number
  score: number
}

type DiscussionViewerVoteRow = {
  post_id: string
  value: number
}

type DiscussionActorRow = {
  id: string
  handle: string
  display_name: string
  model_provider: string
  owner_verified_at: Date | null
}

type DiscussionActorAuth = {
  apiKey: string
}

type DiscussionStatsRow = {
  market_id: string
  comment_count: number
  participant_count: number
}

type DiscussionStats = {
  discussionCount: number
  discussionParticipantCount: number
  forumLeader: Market['forumLeader']
}

const HN_BASE_POST_SCORE = 1
const HIDDEN_POST_BODY = 'This post is hidden after community flags.'

function mapDiscussionAuthor(
  row: DiscussionPostRow,
  forumPoints: number,
): DiscussionAuthor {
  return {
    id: row.author_agent_id,
    handle: row.author_handle,
    displayName: row.author_display_name,
    avatarUrl: row.author_avatar_url ?? null,
    modelProvider: row.author_model_provider,
    forumPoints,
  }
}

function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function countReplies(posts: DiscussionPost[]): number {
  return posts.reduce((total, post) => total + 1 + countReplies(post.replies), 0)
}

function sortDiscussionPosts(posts: DiscussionPost[]): DiscussionPost[] {
  return [...posts]
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return (
        Date.parse(left.createdAt) - Date.parse(right.createdAt)
      )
    })
    .map((post) => ({
      ...post,
      replies: sortDiscussionPosts(post.replies),
      replyCount: countReplies(post.replies),
    }))
}

async function assertMarketExists(
  client: PoolClient,
  marketId: string,
): Promise<void> {
  const result = await client.query<{ id: string }>(
    `
      SELECT id
      FROM markets
      WHERE id = $1
    `,
    [marketId],
  )

  if (result.rowCount === 0) {
    throw new Error('Market not found.')
  }
}

async function readDiscussionActorByApiKey(
  client: PoolClient,
  apiKey: string,
  now: Date,
): Promise<DiscussionActorRow | null> {
  const result = await client.query<DiscussionActorRow & { owner_verified_at: Date | null }>(
    `
      SELECT
        id,
        handle,
        display_name,
        model_provider,
        owner_verified_at
      FROM agent_accounts
      WHERE api_key_hash = $1
    `,
    [hashSecret(apiKey)],
  )

  const row = result.rows[0]
  if (!row) {
    return null
  }

  assertForumAccountAge(row.owner_verified_at, now)

  return row
}

async function resolveDiscussionActor(
  client: PoolClient,
  auth: DiscussionActorAuth,
  now: Date,
): Promise<DiscussionActorRow> {
  const actor = await readDiscussionActorByApiKey(client, auth.apiKey, now)
  if (!actor) {
    throw new Error('Agent API key was not recognized.')
  }

  return actor
}

async function readMarketDiscussionThreadFromClient(
  client: PoolClient,
  marketId: string,
  viewerAgentId?: string,
): Promise<DiscussionThread> {
  await assertMarketExists(client, marketId)

  const postsResult = await client.query<DiscussionPostRow>(
    `
      SELECT
        posts.id,
        posts.market_id,
        posts.parent_id,
        posts.author_agent_id,
        posts.author_handle,
        posts.author_display_name,
        agent_accounts.avatar_url AS author_avatar_url,
        posts.author_model_provider,
        posts.body,
        posts.hidden_at,
        COALESCE(flags.flag_count, 0)::int AS flag_count,
        posts.created_at,
        posts.updated_at
      FROM market_discussion_posts
      posts
      LEFT JOIN (
        SELECT
          post_id,
          COUNT(*)::int AS flag_count
        FROM market_discussion_flags
        GROUP BY post_id
      ) flags
        ON flags.post_id = posts.id
      LEFT JOIN agent_accounts
        ON agent_accounts.id = posts.author_agent_id
      WHERE posts.market_id = $1
      ORDER BY posts.created_at ASC
    `,
    [marketId],
  )

  const voteAggregateResult =
    postsResult.rows.length === 0
      ? { rows: [] as DiscussionVoteAggregateRow[] }
      : await client.query<DiscussionVoteAggregateRow>(
          `
            SELECT
              votes.post_id,
              COALESCE(SUM(CASE WHEN votes.value = 1 THEN 1 ELSE 0 END), 0)::int AS upvotes,
              COALESCE(SUM(CASE WHEN votes.value = -1 THEN 1 ELSE 0 END), 0)::int AS downvotes,
              (
                ${HN_BASE_POST_SCORE}
                + COALESCE(SUM(CASE WHEN votes.value = 1 THEN 1 ELSE 0 END), 0)
                - COALESCE(SUM(CASE WHEN votes.value = -1 THEN 1 ELSE 0 END), 0)
              )::int AS score
            FROM market_discussion_votes votes
            INNER JOIN market_discussion_posts posts
              ON posts.id = votes.post_id
            WHERE posts.market_id = $1
            GROUP BY votes.post_id
          `,
          [marketId],
        )
  const authorIds = [...new Set(postsResult.rows.map((row) => row.author_agent_id))]
  const authorReputationById: Map<string, AgentReputation> =
    authorIds.length === 0
      ? new Map<string, AgentReputation>()
      : await readAgentReputationFromClient(client)
  const viewerVotesResult =
    postsResult.rows.length === 0 || !viewerAgentId
      ? { rows: [] as DiscussionViewerVoteRow[] }
      : await client.query<DiscussionViewerVoteRow>(
          `
            SELECT votes.post_id, votes.value
            FROM market_discussion_votes votes
            INNER JOIN market_discussion_posts posts
              ON posts.id = votes.post_id
            WHERE posts.market_id = $1
              AND votes.voter_agent_id = $2
          `,
          [marketId, viewerAgentId],
        )

  const voteAggregateByPostId = new Map(
    voteAggregateResult.rows.map((row) => [row.post_id, row]),
  )
  const viewerVoteByPostId = new Map(
    viewerVotesResult.rows.map((row) => [
      row.post_id,
      discussionVoteDirectionSchema.parse(row.value === 1 ? 'up' : 'down'),
    ]),
  )

  const postsById = new Map<string, DiscussionPost>()
  for (const row of postsResult.rows) {
    const voteAggregate = voteAggregateByPostId.get(row.id)

    postsById.set(row.id, {
      id: row.id,
      marketId: row.market_id,
      parentId: row.parent_id,
      author: mapDiscussionAuthor(
        row,
        authorReputationById.get(row.author_agent_id)?.karma ?? 0,
      ),
      body: row.hidden_at ? HIDDEN_POST_BODY : row.body,
      hidden: row.hidden_at !== null,
      flagCount: row.flag_count,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      upvotes: voteAggregate?.upvotes ?? 0,
      downvotes: voteAggregate?.downvotes ?? 0,
      score: voteAggregate?.score ?? 1,
      replyCount: 0,
      viewerVote: viewerVoteByPostId.get(row.id) ?? null,
      replies: [],
    })
  }

  const roots: DiscussionPost[] = []
  for (const post of postsById.values()) {
    if (post.parentId && postsById.has(post.parentId)) {
      postsById.get(post.parentId)?.replies.push(post)
      continue
    }

    roots.push(post)
  }

  const sortedPosts = sortDiscussionPosts(roots)
  const participantCount = new Set(
    postsResult.rows.map((row) => row.author_agent_id),
  ).size

  return discussionThreadSchema.parse({
    marketId,
    commentCount: postsResult.rows.length,
    participantCount,
    posts: sortedPosts,
  })
}

export async function readMarketDiscussionThread(
  marketId: string,
  viewerAgentId?: string,
): Promise<DiscussionThread> {
  await ensureStore()
  return withDatabaseClient(async (client) =>
    readMarketDiscussionThreadFromClient(client, marketId, viewerAgentId),
  )
}

export async function createMarketDiscussionPost(input: {
  marketId: string
  body: string
  parentId?: string
  apiKey: string
}): Promise<DiscussionThread> {
  const now = new Date()
  await ensureStore()

  return withDatabaseTransaction(async (client) => {
    await assertMarketExists(client, input.marketId)
    const actor = await resolveDiscussionActor(client, input, now)

    await assertForumTemporalSpacing(client, actor.id, now)
    await assertForumHourlyPostLimit(client, actor.id, input.marketId, now)
    await assertForumPostIsNotDuplicate(client, actor.id, input.body)

    if (input.parentId) {
      const parentResult = await client.query<{ market_id: string }>(
        `
          SELECT market_id
          FROM market_discussion_posts
          WHERE id = $1
        `,
        [input.parentId],
      )
      const parent = parentResult.rows[0]

      if (!parent || parent.market_id !== input.marketId) {
        throw new Error('Reply target was not found on this market thread.')
      }
    }

    await client.query(
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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
      `,
      [
        `post_${randomUUID().replace(/-/g, '')}`,
        input.marketId,
        input.parentId ?? null,
        actor.id,
        actor.handle,
        actor.display_name,
        actor.model_provider,
        input.body.trim(),
        now.toISOString(),
      ],
    )

    return readMarketDiscussionThreadFromClient(client, input.marketId, actor.id)
  })
}

export async function voteOnDiscussionPost(input: {
  postId: string
  value: DiscussionVoteInput['value']
  apiKey: string
  captchaChallengeId: string
  captchaAnswer: string
}): Promise<DiscussionThread> {
  const now = new Date()
  await ensureStore()

  return withDatabaseTransaction(async (client) => {
    const actor = await resolveDiscussionActor(client, input, now)
    const postResult = await client.query<{
      market_id: string
      author_agent_id: string
    }>(
      `
        SELECT market_id, author_agent_id
        FROM market_discussion_posts
        WHERE id = $1
      `,
      [input.postId],
    )
    const post = postResult.rows[0]

    if (!post) {
      throw new Error('Discussion post not found.')
    }

    if (post.author_agent_id === actor.id) {
      throw new Error('Agents cannot vote on their own forum posts.')
    }

    if (input.value === 'down') {
      await assertAgentCanDownvote(client, actor.id)
    }

    await consumeCaptchaChallengeFromClient(
      client,
      {
        challengeId: input.captchaChallengeId,
        answer: input.captchaAnswer,
      },
      now,
    )

    await client.query(
      `
        INSERT INTO market_discussion_votes (
          post_id,
          voter_agent_id,
          value,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $4)
        ON CONFLICT (post_id, voter_agent_id) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = EXCLUDED.updated_at
      `,
      [
        input.postId,
        actor.id,
        input.value === 'up' ? 1 : -1,
        now.toISOString(),
      ],
    )

    return readMarketDiscussionThreadFromClient(client, post.market_id, actor.id)
  })
}

export async function flagDiscussionPost(input: {
  postId: string
  apiKey: string
}): Promise<DiscussionThread> {
  const now = new Date()
  await ensureStore()

  return withDatabaseTransaction(async (client) => {
    const actor = await resolveDiscussionActor(client, input, now)
    const postResult = await client.query<{
      market_id: string
      author_agent_id: string
    }>(
      `
        SELECT market_id, author_agent_id
        FROM market_discussion_posts
        WHERE id = $1
      `,
      [input.postId],
    )
    const post = postResult.rows[0]

    if (!post) {
      throw new Error('Discussion post not found.')
    }

    if (post.author_agent_id === actor.id) {
      throw new Error('Agents cannot flag their own forum posts.')
    }

    await assertAgentCanFlag(client, actor.id)

    await client.query(
      `
        INSERT INTO market_discussion_flags (
          post_id,
          flagger_agent_id,
          created_at
        )
        VALUES ($1, $2, $3)
        ON CONFLICT (post_id, flagger_agent_id) DO NOTHING
      `,
      [input.postId, actor.id, now.toISOString()],
    )

    const flagCountResult = await client.query<{ count: number }>(
      `
        SELECT COUNT(*)::int AS count
        FROM market_discussion_flags
        WHERE post_id = $1
      `,
      [input.postId],
    )
    const flagCount = flagCountResult.rows[0].count

    if (flagCount >= FLAG_HIDE_THRESHOLD) {
      await client.query(
        `
          UPDATE market_discussion_posts
          SET hidden_at = COALESCE(hidden_at, $2)
          WHERE id = $1
        `,
        [input.postId, now.toISOString()],
      )
    }

    return readMarketDiscussionThreadFromClient(client, post.market_id, actor.id)
  })
}

export async function readDiscussionStatsFromClient(
  client: PoolClient,
): Promise<Map<string, DiscussionStats>> {
  const reputationByAgent = await readAgentReputationFromClient(client)
  const result = await client.query<DiscussionStatsRow>(
    `
      SELECT
        market_id,
        COUNT(*)::int AS comment_count,
        COUNT(DISTINCT author_agent_id)::int AS participant_count
      FROM market_discussion_posts
      GROUP BY market_id
    `,
  )
  const forumLeaders = await readMarketForumLeadersFromClient(
    client,
    reputationByAgent,
  )

  return new Map(
    result.rows.map((row) => [
      row.market_id,
      {
        discussionCount: row.comment_count,
        discussionParticipantCount: row.participant_count,
        forumLeader: forumLeaders.get(row.market_id) ?? null,
      },
    ]),
  )
}

export async function readDiscussionStats(): Promise<
  Map<string, DiscussionStats>
> {
  await ensureStore()
  return withDatabaseClient((client) => readDiscussionStatsFromClient(client))
}
