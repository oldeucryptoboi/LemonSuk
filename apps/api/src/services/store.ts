import type { PoolClient } from 'pg'

import type {
  BetSlip,
  Market,
  MarketLineHistoryEntry,
  Notification,
  Source,
  StoreData,
} from '../shared'
import { storeSchema } from '../shared'
import { createSeedStore } from '../data/seed'
import { withDatabaseClient, withDatabaseTransaction } from './database'
import { createStoredSourceId } from './utils'
import {
  applyAgentSettlementCredits,
  applyAuthoredMarketResolutionRewards,
} from './wallet'

type MetadataRow = {
  last_maintenance_run_at: Date | null
  last_discovery_run_at: Date | null
}

type MarketRow = {
  id: string
  slug: string
  headline: string
  subject: string
  category: Market['category']
  announced_on: Date
  promised_date: Date
  promised_by: string
  summary: string
  status: Market['status']
  resolution: Market['resolution']
  resolution_notes: string | null
  base_payout_multiplier: number
  payout_multiplier: number
  confidence: number
  stake_difficulty: number
  tags: string[]
  linked_market_ids: string[]
  bet_window_open: boolean
  busted_at: Date | null
  created_at: Date
  updated_at: Date
  last_checked_at: Date
  authored_by_agent_id: string | null
  author_handle: string | null
  author_display_name: string | null
  author_avatar_url: string | null
  previous_payout_multiplier: number | null
  last_line_move_at: Date | null
  last_line_move_reason: Market['lastLineMoveReason']
  current_open_interest_credits: number
  current_liability_credits: number
  max_stake_credits: number
  max_liability_credits: number
  per_agent_exposure_cap_credits: number
  betting_suspended: boolean
  suspension_reason: string | null
  settlement_grace_hours: number
  auto_resolve_at: Date | null
  settlement_state: Market['settlementState']
}

type MarketLineHistoryRow = {
  id: string
  market_id: string
  moved_at: Date
  previous_payout_multiplier: number
  next_payout_multiplier: number
  reason: MarketLineHistoryEntry['reason']
  commentary: string
  trigger_bet_id: string | null
  open_interest_credits: number
  liability_credits: number
}

type MarketSourceRow = {
  id: string
  market_id: string
  label: string
  url: string
  source_type: Source['sourceType']
  domain: string
  published_at: Date | null
  note: string
}

type BetRow = {
  id: string
  user_id: string
  market_id: string
  stake_credits: number
  side: BetSlip['side']
  status: BetSlip['status']
  payout_multiplier_at_placement: number
  global_bonus_percent_at_placement: number
  projected_payout_credits: number
  settled_payout_credits: number | null
  placed_at: Date
  settled_at: Date | null
}

type NotificationRow = {
  id: string
  user_id: string
  market_id: string | null
  bet_id: string | null
  type: Notification['type']
  title: string
  body: string
  created_at: Date
  read_at: Date | null
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null
}

function mapMarket(
  row: MarketRow,
  sourcesByMarketId: Map<string, Source[]>,
  lineHistoryByMarketId: Map<string, MarketLineHistoryEntry[]>,
): Market {
  return {
    id: row.id,
    slug: row.slug,
    headline: row.headline,
    subject: row.subject,
    category: row.category,
    announcedOn: row.announced_on.toISOString(),
    promisedDate: row.promised_date.toISOString(),
    promisedBy: row.promised_by,
    summary: row.summary,
    status: row.status,
    resolution: row.resolution,
    resolutionNotes: row.resolution_notes,
    basePayoutMultiplier: Number(row.base_payout_multiplier),
    payoutMultiplier: Number(row.payout_multiplier),
    confidence: row.confidence,
    stakeDifficulty: row.stake_difficulty,
    tags: row.tags,
    sources: sourcesByMarketId.get(row.id) ?? [],
    author:
      row.authored_by_agent_id && row.author_handle && row.author_display_name
        ? {
            id: row.authored_by_agent_id,
            handle: row.author_handle,
            displayName: row.author_display_name,
            avatarUrl: row.author_avatar_url ?? null,
          }
        : null,
    linkedMarketIds: row.linked_market_ids,
    betWindowOpen: row.bet_window_open,
    bustedAt: toIso(row.busted_at),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    lastCheckedAt: row.last_checked_at.toISOString(),
    previousPayoutMultiplier:
      row.previous_payout_multiplier === null
        ? null
        : Number(row.previous_payout_multiplier),
    lastLineMoveAt: toIso(row.last_line_move_at),
    lastLineMoveReason: row.last_line_move_reason ?? null,
    lineHistory: lineHistoryByMarketId.get(row.id) ?? [],
    currentOpenInterestCredits: Number(row.current_open_interest_credits),
    currentLiabilityCredits: Number(row.current_liability_credits),
    maxStakeCredits: Number(row.max_stake_credits),
    maxLiabilityCredits: Number(row.max_liability_credits),
    perAgentExposureCapCredits: Number(row.per_agent_exposure_cap_credits),
    bettingSuspended: row.betting_suspended,
    suspensionReason: row.suspension_reason,
    settlementGraceHours: row.settlement_grace_hours,
    autoResolveAt: toIso(row.auto_resolve_at),
    settlementState: row.settlement_state,
  }
}

function mapLineHistoryEntry(row: MarketLineHistoryRow): MarketLineHistoryEntry {
  return {
    id: row.id,
    movedAt: row.moved_at.toISOString(),
    previousPayoutMultiplier: Number(row.previous_payout_multiplier),
    nextPayoutMultiplier: Number(row.next_payout_multiplier),
    reason: row.reason,
    commentary: row.commentary,
    triggerBetId: row.trigger_bet_id,
    openInterestCredits: Number(row.open_interest_credits),
    liabilityCredits: Number(row.liability_credits),
  }
}

function mapBet(row: BetRow): BetSlip {
  return {
    id: row.id,
    userId: row.user_id,
    marketId: row.market_id,
    stakeCredits: Number(row.stake_credits),
    side: row.side,
    status: row.status,
    payoutMultiplierAtPlacement: Number(row.payout_multiplier_at_placement),
    globalBonusPercentAtPlacement: Number(
      row.global_bonus_percent_at_placement,
    ),
    projectedPayoutCredits: Number(row.projected_payout_credits),
    settledPayoutCredits:
      row.settled_payout_credits === null
        ? null
        : Number(row.settled_payout_credits),
    placedAt: row.placed_at.toISOString(),
    settledAt: toIso(row.settled_at),
  }
}

function mapNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    marketId: row.market_id,
    betId: row.bet_id,
    type: row.type,
    title: row.title,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    readAt: toIso(row.read_at),
  }
}

function mapSource(row: MarketSourceRow): Source {
  return {
    id: row.id,
    label: row.label,
    url: row.url,
    sourceType: row.source_type,
    domain: row.domain,
    publishedAt: toIso(row.published_at),
    note: row.note,
  }
}

async function readStoreFromClient(client: PoolClient): Promise<StoreData> {
  const metadataResult = await client.query<MetadataRow>(
    `
      SELECT last_maintenance_run_at, last_discovery_run_at
      FROM app_metadata
      WHERE singleton = TRUE
    `,
  )
  const marketsResult = await client.query<MarketRow>(
    `
      SELECT
        markets.*,
        agent_accounts.handle AS author_handle,
        agent_accounts.display_name AS author_display_name,
        agent_accounts.avatar_url AS author_avatar_url
      FROM markets
      LEFT JOIN agent_accounts
        ON agent_accounts.id = markets.authored_by_agent_id
    `,
  )
  const sourcesResult = await client.query<MarketSourceRow>(
    `
      SELECT *
      FROM market_sources
      ORDER BY market_id, label
    `,
  )
  const lineHistoryResult = await client.query<MarketLineHistoryRow>(
    `
      SELECT *
      FROM market_line_history
      ORDER BY market_id, moved_at DESC
    `,
  )
  const betsResult = await client.query<BetRow>(
    `
      SELECT *
      FROM bets
      ORDER BY placed_at DESC
    `,
  )
  const notificationsResult = await client.query<NotificationRow>(
    `
      SELECT *
      FROM notifications
      ORDER BY created_at DESC
    `,
  )

  const sourcesByMarketId = new Map<string, Source[]>()
  for (const row of sourcesResult.rows) {
    const collection = sourcesByMarketId.get(row.market_id) ?? []
    collection.push(mapSource(row))
    sourcesByMarketId.set(row.market_id, collection)
  }
  const lineHistoryByMarketId = new Map<string, MarketLineHistoryEntry[]>()
  for (const row of lineHistoryResult.rows) {
    const collection = lineHistoryByMarketId.get(row.market_id) ?? []
    collection.push(mapLineHistoryEntry(row))
    lineHistoryByMarketId.set(row.market_id, collection)
  }

  const metadata = metadataResult.rows[0]

  return storeSchema.parse({
    markets: marketsResult.rows.map((row) =>
      mapMarket(row, sourcesByMarketId, lineHistoryByMarketId),
    ),
    bets: betsResult.rows.map(mapBet),
    notifications: notificationsResult.rows.map(mapNotification),
    metadata: {
      lastMaintenanceRunAt: metadata
        ? toIso(metadata.last_maintenance_run_at)
        : null,
      lastDiscoveryRunAt: metadata
        ? toIso(metadata.last_discovery_run_at)
        : null,
    },
  })
}

async function replaceStoreFromClient(
  client: PoolClient,
  store: StoreData,
): Promise<StoreData> {
  const validated = storeSchema.parse(store)

  await client.query('DELETE FROM notifications')
  await client.query('DELETE FROM bets')
  await client.query('DELETE FROM market_line_history')
  await client.query('DELETE FROM market_sources')
  await client.query('DELETE FROM markets')

  await client.query(
    `
      INSERT INTO app_metadata (
        singleton,
        last_maintenance_run_at,
        last_discovery_run_at
      )
      VALUES (TRUE, $1, $2)
      ON CONFLICT (singleton) DO UPDATE SET
        last_maintenance_run_at = EXCLUDED.last_maintenance_run_at,
        last_discovery_run_at = EXCLUDED.last_discovery_run_at
    `,
    [
      validated.metadata.lastMaintenanceRunAt,
      validated.metadata.lastDiscoveryRunAt,
    ],
  )

  for (const market of validated.markets) {
    await client.query(
      `
        INSERT INTO markets (
          id,
          slug,
          headline,
          subject,
          category,
          announced_on,
          promised_date,
          promised_by,
          summary,
          status,
          resolution,
          resolution_notes,
          base_payout_multiplier,
          payout_multiplier,
          confidence,
          stake_difficulty,
          tags,
          linked_market_ids,
          bet_window_open,
          busted_at,
          created_at,
          updated_at,
          last_checked_at,
          authored_by_agent_id,
          previous_payout_multiplier,
          last_line_move_at,
          last_line_move_reason,
          current_open_interest_credits,
          current_liability_credits,
          max_stake_credits,
          max_liability_credits,
          per_agent_exposure_cap_credits,
          betting_suspended,
          suspension_reason,
          settlement_grace_hours,
          auto_resolve_at,
          settlement_state
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
          $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35,
          $36, $37
        )
      `,
      [
        market.id,
        market.slug,
        market.headline,
        market.subject,
        market.category,
        market.announcedOn,
        market.promisedDate,
        market.promisedBy,
        market.summary,
        market.status,
        market.resolution,
        market.resolutionNotes,
        market.basePayoutMultiplier,
        market.payoutMultiplier,
        market.confidence,
        market.stakeDifficulty,
        market.tags,
        market.linkedMarketIds,
        market.betWindowOpen,
        market.bustedAt,
        market.createdAt,
        market.updatedAt,
        market.lastCheckedAt,
        market.author?.id ?? null,
        market.previousPayoutMultiplier ?? null,
        market.lastLineMoveAt ?? null,
        market.lastLineMoveReason ?? null,
        market.currentOpenInterestCredits ?? 0,
        market.currentLiabilityCredits ?? 0,
        market.maxStakeCredits ?? 100,
        market.maxLiabilityCredits ?? 350,
        market.perAgentExposureCapCredits ?? 150,
        market.bettingSuspended ?? false,
        market.suspensionReason ?? null,
        market.settlementGraceHours ?? 0,
        market.autoResolveAt ?? null,
        market.settlementState ?? 'live',
      ],
    )

    for (const source of market.sources) {
      await client.query(
        `
          INSERT INTO market_sources (
            id,
            market_id,
            label,
            url,
            source_type,
            domain,
            published_at,
            note
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          createStoredSourceId(market.id, source.id),
          market.id,
          source.label,
          source.url,
          source.sourceType,
          source.domain,
          source.publishedAt,
          source.note,
        ],
      )
    }

    await insertMarketLineHistoryEntries(client, market)
  }

  for (const bet of validated.bets) {
    await client.query(
      `
        INSERT INTO bets (
          id,
          user_id,
          market_id,
          stake_credits,
          side,
          status,
          payout_multiplier_at_placement,
          global_bonus_percent_at_placement,
          projected_payout_credits,
          settled_payout_credits,
          placed_at,
          settled_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `,
      [
        bet.id,
        bet.userId,
        bet.marketId,
        bet.stakeCredits,
        bet.side,
        bet.status,
        bet.payoutMultiplierAtPlacement,
        bet.globalBonusPercentAtPlacement,
        bet.projectedPayoutCredits,
        bet.settledPayoutCredits,
        bet.placedAt,
        bet.settledAt,
      ],
    )
  }

  for (const notification of validated.notifications) {
    await client.query(
      `
        INSERT INTO notifications (
          id,
          user_id,
          market_id,
          bet_id,
          type,
          title,
          body,
          created_at,
          read_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        notification.id,
        notification.userId,
        notification.marketId,
        notification.betId,
        notification.type,
        notification.title,
        notification.body,
        notification.createdAt,
        notification.readAt,
      ],
    )
  }

  return validated
}

async function insertMarketFromClient(
  client: PoolClient,
  market: Market,
): Promise<void> {
  await client.query(
    `
      INSERT INTO markets (
        id,
        slug,
        headline,
        subject,
        category,
        announced_on,
        promised_date,
        promised_by,
        summary,
        status,
        resolution,
        resolution_notes,
        base_payout_multiplier,
        payout_multiplier,
        confidence,
        stake_difficulty,
        tags,
        linked_market_ids,
        bet_window_open,
        busted_at,
        created_at,
        updated_at,
        last_checked_at,
        authored_by_agent_id,
        previous_payout_multiplier,
        last_line_move_at,
        last_line_move_reason,
        current_open_interest_credits,
        current_liability_credits,
        max_stake_credits,
        max_liability_credits,
        per_agent_exposure_cap_credits,
        betting_suspended,
        suspension_reason,
        settlement_grace_hours,
        auto_resolve_at,
        settlement_state
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
        $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35,
        $36, $37
      )
    `,
    [
      market.id,
      market.slug,
      market.headline,
      market.subject,
      market.category,
      market.announcedOn,
      market.promisedDate,
      market.promisedBy,
      market.summary,
      market.status,
      market.resolution,
      market.resolutionNotes,
      market.basePayoutMultiplier,
      market.payoutMultiplier,
      market.confidence,
      market.stakeDifficulty,
      market.tags,
      market.linkedMarketIds,
      market.betWindowOpen,
      market.bustedAt,
      market.createdAt,
      market.updatedAt,
      market.lastCheckedAt,
      market.author?.id ?? null,
      market.previousPayoutMultiplier ?? null,
      market.lastLineMoveAt ?? null,
      market.lastLineMoveReason ?? null,
      market.currentOpenInterestCredits ?? 0,
      market.currentLiabilityCredits ?? 0,
      market.maxStakeCredits ?? 100,
      market.maxLiabilityCredits ?? 350,
      market.perAgentExposureCapCredits ?? 150,
      market.bettingSuspended ?? false,
      market.suspensionReason ?? null,
      market.settlementGraceHours ?? 0,
      market.autoResolveAt ?? null,
      market.settlementState ?? 'live',
    ],
  )

  for (const source of market.sources) {
    await client.query(
      `
        INSERT INTO market_sources (
          id,
          market_id,
          label,
          url,
          source_type,
          domain,
          published_at,
          note
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        createStoredSourceId(market.id, source.id),
        market.id,
        source.label,
        source.url,
        source.sourceType,
        source.domain,
        source.publishedAt,
        source.note,
      ],
    )
  }

  await insertMarketLineHistoryEntries(client, market)
}

async function insertMarketLineHistoryEntries(
  client: PoolClient,
  market: Market,
): Promise<void> {
  for (const entry of market.lineHistory ?? []) {
    await client.query(
      `
        INSERT INTO market_line_history (
          id,
          market_id,
          moved_at,
          previous_payout_multiplier,
          next_payout_multiplier,
          reason,
          commentary,
          trigger_bet_id,
          open_interest_credits,
          liability_credits
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        entry.id,
        market.id,
        entry.movedAt,
        entry.previousPayoutMultiplier,
        entry.nextPayoutMultiplier,
        entry.reason,
        entry.commentary,
        entry.triggerBetId ?? null,
        entry.openInterestCredits,
        entry.liabilityCredits,
      ],
    )
  }
}

async function seedStoreIfEmpty(client: PoolClient): Promise<void> {
  const result = await client.query<{ count: string; id?: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM markets
    `,
  )

  if (Number(result.rows[0]?.count ?? 0) === 0) {
    await replaceStoreFromClient(client, createSeedStore())
    return
  }

  const existingMarkets = await client.query<{ id: string }>(
    'SELECT id FROM markets',
  )
  const existingIds = new Set(existingMarkets.rows.map((row) => row.id))
  const missingSeedMarkets = createSeedStore().markets.filter(
    (market) => !existingIds.has(market.id),
  )

  for (const market of missingSeedMarkets) {
    await insertMarketFromClient(client, market)
  }
}

export async function ensureStore(): Promise<void> {
  await withDatabaseTransaction(async (client) => {
    await seedStoreIfEmpty(client)
  })
}

export async function readStore(): Promise<StoreData> {
  await ensureStore()
  return withDatabaseClient(async (client) => readStoreFromClient(client))
}

export async function withStoreTransaction<T>(
  run: (
    store: StoreData,
    persist: (nextStore: StoreData) => Promise<StoreData>,
    client: PoolClient,
  ) => Promise<T>,
): Promise<T> {
  return withDatabaseTransaction(async (client) => {
    await seedStoreIfEmpty(client)

    let currentStore = await readStoreFromClient(client)

      const persist = async (nextStore: StoreData): Promise<StoreData> => {
        const previousStore = currentStore
        const persistedStore = await replaceStoreFromClient(client, nextStore)
        await applyAgentSettlementCredits(client, previousStore, persistedStore)
        await applyAuthoredMarketResolutionRewards(
          client,
          previousStore,
          persistedStore,
        )
        currentStore = persistedStore
        return currentStore
      }

    return run(currentStore, persist, client)
  })
}
