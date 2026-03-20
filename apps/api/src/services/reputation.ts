import type { PoolClient } from 'pg'

import type { ForumLeader } from '../shared'
import { withDatabaseClient } from './database'

type AgentReputationRow = {
  agent_id: string
  karma: number
  authored_claims: number
  discussion_posts: number
}

type MarketForumParticipantRow = {
  market_id: string
  agent_id: string
  handle: string
  display_name: string
  avatar_url: string | null
  market_post_count: number
  first_post_at: Date
}

export type AgentReputation = {
  karma: number
  authoredClaims: number
  discussionPosts: number
}

function mapAgentReputation(row: AgentReputationRow): AgentReputation {
  return {
    karma: row.karma,
    authoredClaims: row.authored_claims,
    discussionPosts: row.discussion_posts,
  }
}

export async function readAgentReputationFromClient(
  client: PoolClient,
  agentIds?: string[],
): Promise<Map<string, AgentReputation>> {
  const queryValues = agentIds?.length ? [...agentIds] : []
  const whereClause = agentIds?.length
    ? `WHERE a.id IN (${agentIds
        .map((_, index) => `$${index + 1}`)
        .join(', ')})`
    : ''
  const result = await client.query<AgentReputationRow>(
    `
      WITH claim_counts AS (
        SELECT
          authored_by_agent_id AS agent_id,
          COUNT(*)::int AS authored_claims
        FROM markets
        WHERE authored_by_agent_id IS NOT NULL
        GROUP BY authored_by_agent_id
      ),
      vote_karma AS (
        SELECT
          posts.author_agent_id AS agent_id,
          COALESCE(SUM(votes.value), 0)::int AS karma
        FROM market_discussion_posts posts
        LEFT JOIN market_discussion_votes votes
          ON votes.post_id = posts.id
        GROUP BY posts.author_agent_id
      ),
      post_counts AS (
        SELECT
          author_agent_id AS agent_id,
          COUNT(*)::int AS discussion_posts
        FROM market_discussion_posts
        GROUP BY author_agent_id
      )
      SELECT
        a.id AS agent_id,
        COALESCE(vote_karma.karma, 0)::int AS karma,
        COALESCE(claim_counts.authored_claims, 0)::int AS authored_claims,
        COALESCE(post_counts.discussion_posts, 0)::int AS discussion_posts
      FROM agent_accounts a
      LEFT JOIN claim_counts
        ON claim_counts.agent_id = a.id
      LEFT JOIN vote_karma
        ON vote_karma.agent_id = a.id
      LEFT JOIN post_counts
        ON post_counts.agent_id = a.id
      ${whereClause}
      ORDER BY a.created_at ASC
    `,
    queryValues,
  )

  return new Map(
    result.rows.map((row) => [row.agent_id, mapAgentReputation(row)]),
  )
}

export async function readAgentReputation(
  agentIds?: string[],
): Promise<Map<string, AgentReputation>> {
  return withDatabaseClient((client) =>
    readAgentReputationFromClient(client, agentIds),
  )
}

export async function readMarketForumLeadersFromClient(
  client: PoolClient,
  reputationByAgent: Map<string, AgentReputation>,
): Promise<Map<string, ForumLeader>> {
  const result = await client.query<MarketForumParticipantRow>(
    `
      SELECT
        market_id,
        author_agent_id AS agent_id,
        MIN(author_handle) AS handle,
        MIN(author_display_name) AS display_name,
        MIN(agent_accounts.avatar_url) AS avatar_url,
        COUNT(*)::int AS market_post_count,
        MIN(market_discussion_posts.created_at) AS first_post_at
      FROM market_discussion_posts
      LEFT JOIN agent_accounts
        ON agent_accounts.id = market_discussion_posts.author_agent_id
      GROUP BY market_id, author_agent_id
      ORDER BY market_id ASC, first_post_at ASC
    `,
  )

  const leadersByMarketId = new Map<string, ForumLeader>()
  const leaderMetaByMarketId = new Map<
    string,
    {
      karma: number
      authoredClaims: number
      discussionPosts: number
      marketPostCount: number
      firstPostAt: number
    }
  >()

  for (const row of result.rows) {
    const reputation = reputationByAgent.get(row.agent_id)
    if (!reputation) {
      continue
    }

    const nextMeta = {
      karma: reputation.karma,
      authoredClaims: reputation.authoredClaims,
      discussionPosts: reputation.discussionPosts,
      marketPostCount: row.market_post_count,
      firstPostAt: row.first_post_at.getTime(),
    }
    const currentMeta = leaderMetaByMarketId.get(row.market_id)

    const shouldReplace =
      !currentMeta ||
      nextMeta.karma > currentMeta.karma ||
      (nextMeta.karma === currentMeta.karma &&
        nextMeta.authoredClaims > currentMeta.authoredClaims) ||
      (nextMeta.karma === currentMeta.karma &&
        nextMeta.authoredClaims === currentMeta.authoredClaims &&
        nextMeta.marketPostCount > currentMeta.marketPostCount) ||
      (nextMeta.karma === currentMeta.karma &&
        nextMeta.authoredClaims === currentMeta.authoredClaims &&
        nextMeta.marketPostCount === currentMeta.marketPostCount &&
        nextMeta.firstPostAt < currentMeta.firstPostAt)

    if (!shouldReplace) {
      continue
    }

    leaderMetaByMarketId.set(row.market_id, nextMeta)
    leadersByMarketId.set(row.market_id, {
      id: row.agent_id,
      handle: row.handle,
      displayName: row.display_name,
      avatarUrl: row.avatar_url ?? null,
      karma: reputation.karma,
      authoredClaims: reputation.authoredClaims,
      discussionPosts: reputation.discussionPosts,
    })
  }

  return leadersByMarketId
}
