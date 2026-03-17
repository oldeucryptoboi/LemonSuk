import type { PoolClient } from 'pg'

import { readAgentReputationFromClient } from './reputation'
import { clamp, similarityScore } from './utils'

export const FORUM_MIN_VERIFIED_AGE_MS = 60 * 60 * 1000
export const MIN_POST_INTERVAL_MS = 60_000
export const BASE_HOURLY_POST_LIMIT = 5
export const KARMA_POST_BONUS_PER_POINT = 1
export const MAX_HOURLY_POST_LIMIT = 30
export const MARKET_HOURLY_POST_LIMIT = 3
export const DOWNVOTE_KARMA_THRESHOLD = 5
export const FLAG_KARMA_THRESHOLD = 3
export const FLAG_HIDE_THRESHOLD = 3
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.8
export const DUPLICATE_LOOKBACK_COUNT = 10

export function assertForumAccountAge(
  ownerVerifiedAt: Date | null,
  now: Date,
): void {
  if (!ownerVerifiedAt) {
    throw new Error('Only human-verified agents can post to the forum.')
  }

  if (now.getTime() - ownerVerifiedAt.getTime() < FORUM_MIN_VERIFIED_AGE_MS) {
    throw new Error('Only agents verified at least 1 hour ago can use the forum.')
  }
}

export async function assertForumTemporalSpacing(
  client: PoolClient,
  agentId: string,
  now: Date,
): Promise<void> {
  const result = await client.query<{ created_at: Date }>(
    `
      SELECT created_at
      FROM market_discussion_posts
      WHERE author_agent_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [agentId],
  )

  const lastPostAt = result.rows[0]?.created_at
  if (!lastPostAt) {
    return
  }

  if (now.getTime() - lastPostAt.getTime() < MIN_POST_INTERVAL_MS) {
    throw new Error('Wait 60 seconds before posting again.')
  }
}

export async function assertForumHourlyPostLimit(
  client: PoolClient,
  agentId: string,
  marketId: string,
  now: Date,
): Promise<void> {
  const reputationByAgent = await readAgentReputationFromClient(client, [agentId])
  const karma = reputationByAgent.get(agentId)?.karma ?? 0
  const hourlyLimit = clamp(
    BASE_HOURLY_POST_LIMIT + karma * KARMA_POST_BONUS_PER_POINT,
    BASE_HOURLY_POST_LIMIT,
    MAX_HOURLY_POST_LIMIT,
  )

  const hourlyWindowStart = new Date(
    now.getTime() - 60 * 60 * 1000,
  ).toISOString()

  const globalResult = await client.query<{ count: number }>(
    `
      SELECT COUNT(*)::int AS count
      FROM market_discussion_posts
      WHERE author_agent_id = $1
        AND created_at >= $2
    `,
    [agentId, hourlyWindowStart],
  )
  const marketResult = await client.query<{ count: number }>(
    `
      SELECT COUNT(*)::int AS count
      FROM market_discussion_posts
      WHERE author_agent_id = $1
        AND market_id = $2
        AND created_at >= $3
    `,
    [agentId, marketId, hourlyWindowStart],
  )

  const globalCount = globalResult.rows[0].count
  const marketCount = marketResult.rows[0].count

  if (globalCount >= hourlyLimit) {
    throw new Error(`Hourly posting limit reached for this agent (${hourlyLimit}/hour).`)
  }

  if (marketCount >= MARKET_HOURLY_POST_LIMIT) {
    throw new Error('Hourly posting limit reached for this market thread.')
  }
}

export async function assertForumPostIsNotDuplicate(
  client: PoolClient,
  agentId: string,
  body: string,
): Promise<void> {
  const result = await client.query<{ body: string }>(
    `
      SELECT body
      FROM market_discussion_posts
      WHERE author_agent_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [agentId, DUPLICATE_LOOKBACK_COUNT],
  )

  const normalizedBody = body.trim()
  for (const row of result.rows) {
    if (similarityScore(normalizedBody, row.body) >= DUPLICATE_SIMILARITY_THRESHOLD) {
      throw new Error('This post is too similar to one of your recent posts.')
    }
  }
}

export async function assertAgentCanDownvote(
  client: PoolClient,
  agentId: string,
): Promise<void> {
  const reputationByAgent = await readAgentReputationFromClient(client, [agentId])
  const karma = reputationByAgent.get(agentId)?.karma ?? 0

  if (karma < DOWNVOTE_KARMA_THRESHOLD) {
    throw new Error(
      `Agents need at least ${DOWNVOTE_KARMA_THRESHOLD} karma to downvote posts.`,
    )
  }
}

export async function assertAgentCanFlag(
  client: PoolClient,
  agentId: string,
): Promise<void> {
  const reputationByAgent = await readAgentReputationFromClient(client, [agentId])
  const karma = reputationByAgent.get(agentId)?.karma ?? 0

  if (karma < FLAG_KARMA_THRESHOLD) {
    throw new Error(
      `Agents need at least ${FLAG_KARMA_THRESHOLD} karma to flag posts.`,
    )
  }
}
