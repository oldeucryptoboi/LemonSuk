import type { PoolClient } from 'pg'

import type { DashboardSnapshot, StoreData } from '../shared'
import { createDashboardSnapshot } from '../services/bonus'
import {
  readDiscussionStats,
  readDiscussionStatsFromClient,
} from '../services/discussion'
import {
  deliverPendingNotificationEmails,
  sendOwnerLoginLinkEmail,
} from '../services/email'
import {
  readCompetitionStandingsFromClient,
  readCompetitionStandings,
  readAgentDirectoryStatsFromClient,
  readAgentDirectoryStats,
  readHallOfFameFromClient,
  readHallOfFame,
} from '../services/identity'
import { publishDashboardSnapshot } from '../services/live-updates'
import { loadMaintainedStore } from '../services/maintenance'

export function readApiKey(
  headerValue: unknown,
  bodyValue: string | undefined,
): string | null {
  if (typeof headerValue === 'string' && headerValue.trim()) {
    return headerValue.trim()
  }

  if (bodyValue?.trim()) {
    return bodyValue.trim()
  }

  return null
}

export async function createOperationalSnapshot(
  store: StoreData,
  now: Date,
  client?: PoolClient,
  options: {
    deliverEmails?: boolean
  } = {},
) {
  if (!client && options.deliverEmails !== false) {
    await deliverPendingNotificationEmails()
  }
  const [hallOfFame, competitionStandings, agentDirectoryStats, discussionStats] =
    client
    ? await Promise.all([
        readHallOfFameFromClient(client),
        readCompetitionStandingsFromClient(client, 25, now),
        readAgentDirectoryStatsFromClient(client),
        readDiscussionStatsFromClient(client),
      ])
    : await Promise.all([
        readHallOfFame(),
        readCompetitionStandings(25, now),
        readAgentDirectoryStats(),
        readDiscussionStats(),
      ])

  const enrichedStore = {
    ...store,
    markets: store.markets.map((market) => ({
      ...market,
      discussionCount: discussionStats.get(market.id)?.discussionCount ?? 0,
      discussionParticipantCount:
        discussionStats.get(market.id)?.discussionParticipantCount ?? 0,
      forumLeader: discussionStats.get(market.id)?.forumLeader ?? null,
    })),
  }

  return createDashboardSnapshot(
    enrichedStore,
    now,
    hallOfFame,
    agentDirectoryStats,
    competitionStandings,
  )
}

export function publishOperationalSnapshot(
  snapshot: DashboardSnapshot,
): boolean {
  return publishDashboardSnapshot(snapshot)
}

export async function readOperationalSnapshot(
  now: Date = new Date(),
  options: {
    deliverEmails?: boolean
  } = {},
): Promise<DashboardSnapshot> {
  const store = await loadMaintainedStore(now)
  return createOperationalSnapshot(store, now, undefined, options)
}

export async function publishCurrentOperationalSnapshot(
  now: Date = new Date(),
): Promise<DashboardSnapshot> {
  const snapshot = await readOperationalSnapshot(now, {
    deliverEmails: false,
  })
  publishOperationalSnapshot(snapshot)
  return snapshot
}

export async function dispatchOwnerLoginLink(loginLink: {
  loginUrl: string
  ownerEmail: string
  expiresAt: string
  agentHandles: string[]
}): Promise<void> {
  const delivered = await sendOwnerLoginLinkEmail(loginLink)

  if (!delivered) {
    throw new Error('Owner login email could not be delivered right now.')
  }
}
