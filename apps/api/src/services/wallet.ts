import { randomUUID } from 'node:crypto'

import type { PoolClient } from 'pg'

import type { StoreData } from '../shared'
import {
  agentAcceptedLeadPromoReward,
  agentCreditSeasonPromoFloor,
  agentCreditZeroBalanceRefill,
  agentCreditZeroBalanceRefillCooldownDays,
  agentResolvedMarketPromoReward,
} from '../shared'

const zeroBalanceRefillCooldownMs =
  agentCreditZeroBalanceRefillCooldownDays * 24 * 60 * 60 * 1000

type AgentWalletRow = {
  promo_credits_balance: number
  earned_credits_balance: number
  owner_verified_at: Date | null
  promo_credit_season_id: string | null
  promo_credit_season_granted_at: Date | null
  zero_balance_refill_granted_at: Date | null
}

type CreditLedgerRow = {
  id: string
}

export type AgentWallet = {
  promoCredits: number
  earnedCredits: number
  availableCredits: number
  creditSeason: string
  seasonPromoFloorCredits: number
  zeroBalanceRefillCredits: number
  nextPromoRefillAt: string | null
}

type CreditLedgerEntryInput = {
  agentId: string
  balanceType: 'promo' | 'earned'
  amount: number
  entryType: string
  idempotencyKey: string
  now: Date
  seasonId?: string | null
  referenceType?: string | null
  referenceId?: string | null
  note?: string | null
}

function normalizeCredits(value: number): number {
  return Number(value.toFixed(2))
}

export function deriveCreditSeasonId(value: Date): string {
  const quarter = Math.floor(value.getUTCMonth() / 3) + 1
  return `${value.getUTCFullYear()}-Q${quarter}`
}

export function deriveCreditSeasonWindow(value: Date): {
  seasonId: string
  startAt: Date
  endAt: Date
} {
  const quarter = Math.floor(value.getUTCMonth() / 3)
  const startAt = new Date(Date.UTC(value.getUTCFullYear(), quarter * 3, 1))
  const endAt = new Date(
    Date.UTC(value.getUTCFullYear(), quarter * 3 + 3, 1),
  )

  return {
    seasonId: deriveCreditSeasonId(value),
    startAt,
    endAt,
  }
}

function nextRefillAt(
  row: AgentWalletRow,
  availableCredits: number,
  now: Date,
): string | null {
  if (!row.owner_verified_at || availableCredits > 0) {
    return null
  }

  if (!row.zero_balance_refill_granted_at) {
    return now.toISOString()
  }

  return new Date(
    row.zero_balance_refill_granted_at.getTime() + zeroBalanceRefillCooldownMs,
  ).toISOString()
}

function mapWallet(row: AgentWalletRow, now: Date = new Date()): AgentWallet {
  const promoCredits = normalizeCredits(Number(row.promo_credits_balance))
  const earnedCredits = normalizeCredits(Number(row.earned_credits_balance))
  const availableCredits = normalizeCredits(promoCredits + earnedCredits)

  return {
    promoCredits,
    earnedCredits,
    availableCredits,
    creditSeason: row.promo_credit_season_id ?? deriveCreditSeasonId(now),
    seasonPromoFloorCredits: agentCreditSeasonPromoFloor,
    zeroBalanceRefillCredits: agentCreditZeroBalanceRefill,
    nextPromoRefillAt: nextRefillAt(row, availableCredits, now),
  }
}

async function readWalletRow(
  client: PoolClient,
  agentId: string,
  forUpdate: boolean = false,
): Promise<AgentWalletRow | null> {
  const result = await client.query<AgentWalletRow>(
    `
      SELECT
        promo_credits_balance,
        earned_credits_balance,
        owner_verified_at,
        promo_credit_season_id,
        promo_credit_season_granted_at,
        zero_balance_refill_granted_at
      FROM agent_accounts
      WHERE id = $1
      ${forUpdate ? 'FOR UPDATE' : ''}
    `,
    [agentId],
  )

  return result.rows[0] ?? null
}

async function insertCreditLedgerEntry(
  client: PoolClient,
  input: CreditLedgerEntryInput,
): Promise<boolean> {
  const existing = await client.query<CreditLedgerRow>(
    `
      SELECT id
      FROM agent_credit_ledger
      WHERE idempotency_key = $1
      LIMIT 1
    `,
    [input.idempotencyKey],
  )

  if (Number(existing.rowCount) > 0) {
    return false
  }

  const result = await client.query<CreditLedgerRow>(
    `
      INSERT INTO agent_credit_ledger (
        id,
        agent_id,
        balance_type,
        entry_type,
        amount,
        idempotency_key,
        reference_type,
        reference_id,
        season_id,
        note,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `,
    [
      `credit_${randomUUID().replace(/-/g, '')}`,
      input.agentId,
      input.balanceType,
      input.entryType,
      normalizeCredits(input.amount),
      input.idempotencyKey,
      input.referenceType ?? null,
      input.referenceId ?? null,
      input.seasonId,
      input.note,
      input.now.toISOString(),
    ],
  )

  return Number(result.rowCount) > 0
}

async function grantPromoCredits(
  client: PoolClient,
  input: Omit<CreditLedgerEntryInput, 'balanceType'>,
): Promise<boolean> {
  const inserted = await insertCreditLedgerEntry(client, {
    ...input,
    balanceType: 'promo',
  })
  if (!inserted) {
    return false
  }

  await client.query(
    `
      UPDATE agent_accounts
      SET promo_credits_balance = promo_credits_balance + $2,
          updated_at = $3
      WHERE id = $1
    `,
    [input.agentId, normalizeCredits(input.amount), input.now.toISOString()],
  )

  return true
}

async function grantEarnedCredits(
  client: PoolClient,
  input: Omit<CreditLedgerEntryInput, 'balanceType'>,
): Promise<boolean> {
  const inserted = await insertCreditLedgerEntry(client, {
    ...input,
    balanceType: 'earned',
  })
  if (!inserted) {
    return false
  }

  await client.query(
    `
      UPDATE agent_accounts
      SET earned_credits_balance = earned_credits_balance + $2,
          updated_at = $3
      WHERE id = $1
    `,
    [input.agentId, normalizeCredits(input.amount), input.now.toISOString()],
  )

  return true
}

export async function readAgentWallet(
  client: PoolClient,
  agentId: string,
): Promise<AgentWallet | null> {
  const row = await readWalletRow(client, agentId)
  return row ? mapWallet(row) : null
}

export async function applyAgentCreditEconomy(
  client: PoolClient,
  agentId: string,
  now: Date,
): Promise<AgentWallet> {
  const row = await readWalletRow(client, agentId, true)

  if (!row) {
    throw new Error('Agent wallet was not found.')
  }

  if (!row.owner_verified_at) {
    return mapWallet(row, now)
  }

  const seasonId = deriveCreditSeasonId(now)
  let promoCredits = normalizeCredits(Number(row.promo_credits_balance))
  const earnedCredits = normalizeCredits(Number(row.earned_credits_balance))
  let seasonChanged = false
  let refillChanged = false

  if (row.promo_credit_season_id !== seasonId) {
    const seasonTopUp = normalizeCredits(
      Math.max(0, agentCreditSeasonPromoFloor - promoCredits),
    )
    if (seasonTopUp > 0) {
      await grantPromoCredits(client, {
        agentId,
        amount: seasonTopUp,
        entryType: 'season_bankroll',
        idempotencyKey: `season_bankroll:${agentId}:${seasonId}`,
        seasonId,
        note: `Seasonal promo bankroll floor for ${seasonId}.`,
        now,
      })
      promoCredits = normalizeCredits(promoCredits + seasonTopUp)
    }

    seasonChanged = true
  }

  const availableCredits = normalizeCredits(promoCredits + earnedCredits)
  const canRefill =
    availableCredits <= 0 &&
    (!row.zero_balance_refill_granted_at ||
      now.getTime() - row.zero_balance_refill_granted_at.getTime() >=
        zeroBalanceRefillCooldownMs)

  if (canRefill) {
    const refillBucket = Math.floor(now.getTime() / zeroBalanceRefillCooldownMs)
    await grantPromoCredits(client, {
      agentId,
      amount: agentCreditZeroBalanceRefill,
      entryType: 'zero_balance_refill',
      idempotencyKey: `zero_balance_refill:${agentId}:${refillBucket}`,
      seasonId,
      note: 'Weekly zero-balance refill.',
      now,
    })
    promoCredits = normalizeCredits(promoCredits + agentCreditZeroBalanceRefill)
    refillChanged = true
  }

  if (seasonChanged || refillChanged) {
    await client.query(
      `
        UPDATE agent_accounts
        SET promo_credit_season_id = $2,
            promo_credit_season_granted_at = CASE
              WHEN $3 THEN $4
              ELSE promo_credit_season_granted_at
            END,
            zero_balance_refill_granted_at = CASE
              WHEN $5 THEN $4
              ELSE zero_balance_refill_granted_at
            END,
            updated_at = $4
        WHERE id = $1
      `,
      [
        agentId,
        seasonId,
        seasonChanged,
        now.toISOString(),
        refillChanged,
      ],
    )
  }

  return mapWallet((await readWalletRow(client, agentId))!, now)
}

export async function applyOwnerCreditEconomyForEmail(
  client: PoolClient,
  ownerEmail: string,
  now: Date,
): Promise<number> {
  const result = await client.query<{ id: string }>(
    `
      SELECT id
      FROM agent_accounts
      WHERE owner_email = $1
        AND owner_verified_at IS NOT NULL
      ORDER BY created_at DESC
    `,
    [ownerEmail],
  )

  for (const row of result.rows) {
    await applyAgentCreditEconomy(client, row.id, now)
  }

  return result.rows.length
}

export async function debitAgentCredits(
  client: PoolClient,
  agentId: string,
  stakeCredits: number,
): Promise<AgentWallet> {
  await applyAgentCreditEconomy(client, agentId, new Date())
  const row = (await readWalletRow(client, agentId, true))!

  const current = mapWallet(row)
  if (current.availableCredits < stakeCredits) {
    throw new Error('Insufficient agent credits.')
  }

  const promoSpent = Math.min(current.promoCredits, stakeCredits)
  const earnedSpent = normalizeCredits(stakeCredits - promoSpent)
  const nextPromoCredits = normalizeCredits(current.promoCredits - promoSpent)
  const nextEarnedCredits = normalizeCredits(
    current.earnedCredits - earnedSpent,
  )

  const result = await client.query<AgentWalletRow>(
    `
      UPDATE agent_accounts
      SET promo_credits_balance = $2,
          earned_credits_balance = $3,
          updated_at = $4
      WHERE id = $1
      RETURNING
        promo_credits_balance,
        earned_credits_balance,
        owner_verified_at,
        promo_credit_season_id,
        promo_credit_season_granted_at,
        zero_balance_refill_granted_at
    `,
    [agentId, nextPromoCredits, nextEarnedCredits, new Date().toISOString()],
  )

  // The row exists because the agent row is locked and updated in the same statement.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return mapWallet(result.rows[0]!)
}

export async function grantAcceptedLeadReward(
  client: PoolClient,
  agentId: string,
  leadId: string,
  now: Date,
): Promise<boolean> {
  return grantPromoCredits(client, {
    agentId,
    amount: agentAcceptedLeadPromoReward,
    entryType: 'accepted_lead_reward',
    idempotencyKey: `accepted_lead_reward:${leadId}`,
    referenceType: 'prediction_lead',
    referenceId: leadId,
    seasonId: deriveCreditSeasonId(now),
    note: 'Accepted review lead reward.',
    now,
  })
}

export async function applyAgentSettlementCredits(
  client: PoolClient,
  previousStore: StoreData,
  nextStore: StoreData,
): Promise<void> {
  const previousBetsById = new Map(
    previousStore.bets.map((bet) => [bet.id, bet]),
  )
  const now = new Date()

  for (const bet of nextStore.bets) {
    if (bet.status !== 'won') {
      continue
    }

    const previous = previousBetsById.get(bet.id)
    if (previous?.status === 'won') {
      continue
    }

    const settledPayout =
      bet.settledPayoutCredits ?? bet.projectedPayoutCredits
    if (settledPayout <= 0) {
      continue
    }

    if (!(await readWalletRow(client, bet.userId))) {
      continue
    }

    await grantEarnedCredits(client, {
      agentId: bet.userId,
      amount: settledPayout,
      entryType: 'bet_win_settlement',
      idempotencyKey: `bet_win_settlement:${bet.id}`,
      referenceType: 'bet',
      referenceId: bet.id,
      note: 'Settled winning ticket payout.',
      seasonId: deriveCreditSeasonId(now),
      now,
    })
  }
}

export async function applyAuthoredMarketResolutionRewards(
  client: PoolClient,
  previousStore: StoreData,
  nextStore: StoreData,
): Promise<void> {
  const previousMarketsById = new Map(
    previousStore.markets.map((market) => [market.id, market]),
  )
  const now = new Date()

  for (const market of nextStore.markets) {
    if (!market.author?.id) {
      continue
    }

    const previous = previousMarketsById.get(market.id)
    const becameSettled =
      previous?.resolution === 'pending' && market.resolution !== 'pending'

    if (!becameSettled) {
      continue
    }

    await grantPromoCredits(client, {
      agentId: market.author.id,
      amount: agentResolvedMarketPromoReward,
      entryType: 'resolved_authored_market_reward',
      idempotencyKey: `resolved_authored_market_reward:${market.id}`,
      referenceType: 'market',
      referenceId: market.id,
      seasonId: deriveCreditSeasonId(now),
      note: 'Resolved authored market reward.',
      now,
    })
  }
}
