import type { PoolClient } from 'pg'

import type { StoreData } from '../shared'

export const humanVerifiedSignupBonusCredits = 40

type AgentWalletRow = {
  promo_credits_balance: number
  earned_credits_balance: number
}

export type AgentWallet = {
  promoCredits: number
  earnedCredits: number
  availableCredits: number
}

function normalizeCredits(value: number): number {
  return Number(value.toFixed(2))
}

function mapWallet(row: AgentWalletRow): AgentWallet {
  const promoCredits = normalizeCredits(Number(row.promo_credits_balance))
  const earnedCredits = normalizeCredits(Number(row.earned_credits_balance))

  return {
    promoCredits,
    earnedCredits,
    availableCredits: normalizeCredits(promoCredits + earnedCredits),
  }
}

async function readWalletRow(
  client: PoolClient,
  agentId: string,
  forUpdate: boolean = false,
): Promise<AgentWalletRow | null> {
  const result = await client.query<AgentWalletRow>(
    `
      SELECT promo_credits_balance, earned_credits_balance
      FROM agent_accounts
      WHERE id = $1
      ${forUpdate ? 'FOR UPDATE' : ''}
    `,
    [agentId],
  )

  return result.rows[0] ?? null
}

export async function readAgentWallet(
  client: PoolClient,
  agentId: string,
): Promise<AgentWallet | null> {
  const row = await readWalletRow(client, agentId)
  return row ? mapWallet(row) : null
}

export async function grantHumanVerificationCredits(
  client: PoolClient,
  ownerEmail: string,
  now: Date,
): Promise<number> {
  const result = await client.query<{ id: string }>(
    `
      UPDATE agent_accounts
      SET promo_credits_balance = promo_credits_balance + $2,
          signup_bonus_granted_at = $1,
          updated_at = $1
      WHERE owner_email = $3
        AND owner_verified_at IS NOT NULL
        AND signup_bonus_granted_at IS NULL
      RETURNING id
    `,
    [now.toISOString(), humanVerifiedSignupBonusCredits, ownerEmail],
  )

  return result.rows.length
}

export async function debitAgentCredits(
  client: PoolClient,
  agentId: string,
  stakeCredits: number,
): Promise<AgentWallet> {
  const row = await readWalletRow(client, agentId, true)

  if (!row) {
    throw new Error('Agent wallet was not found.')
  }

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
      RETURNING promo_credits_balance, earned_credits_balance
    `,
    [agentId, nextPromoCredits, nextEarnedCredits, new Date().toISOString()],
  )

  // The row exists because we lock and validate the agent before updating it.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return mapWallet(result.rows[0]!)
}

export async function applyAgentSettlementCredits(
  client: PoolClient,
  previousStore: StoreData,
  nextStore: StoreData,
): Promise<void> {
  const previousBetsById = new Map(
    previousStore.bets.map((bet) => [bet.id, bet]),
  )
  const payoutByUserId = new Map<string, number>()

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

    payoutByUserId.set(
      bet.userId,
      normalizeCredits(
        (payoutByUserId.get(bet.userId) ?? 0) + settledPayout,
      ),
    )
  }

  if (payoutByUserId.size === 0) {
    return
  }

  const nowIso = new Date().toISOString()
  for (const [agentId, payoutCredits] of payoutByUserId) {
    await client.query(
      `
        UPDATE agent_accounts
        SET earned_credits_balance = earned_credits_balance + $2,
            updated_at = $3
        WHERE id = $1
      `,
      [agentId, payoutCredits, nowIso],
    )
  }
}
