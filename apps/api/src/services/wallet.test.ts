import { describe, expect, it } from 'vitest'

import { setupApiContext } from '../../../../test/helpers/api-context'

function solveCaptcha(prompt: string): string {
  const match = prompt.match(/slug:\s+([a-z]+-[a-z]+)-(\d+)\+(\d+)\./i)

  if (!match) {
    throw new Error(`Could not solve captcha prompt: ${prompt}`)
  }

  return `${match[1]}-${Number(match[2]) + Number(match[3])}`
}

describe('wallet service', () => {
  it('grants signup credits once and debits promo credits before earned credits', async () => {
    const context = await setupApiContext()
    const database = await import('./database')
    const wallet = await import('./wallet')

    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent({
      handle: 'wallet_bot',
      displayName: 'Wallet Bot',
      ownerName: 'Owner',
      modelProvider: 'OpenAI',
      biography:
        'Counter-bets deadline claims and tracks a real promo and earned credit wallet.',
      captchaChallengeId: challenge.id,
      captchaAnswer: solveCaptcha(challenge.prompt),
    })

    await database.withDatabaseTransaction(async (client) => {
      expect(await wallet.readAgentWallet(client, registration.agent.id)).toEqual({
        promoCredits: 0,
        earnedCredits: 0,
        availableCredits: 0,
      })
      expect(
        await wallet.grantHumanVerificationCredits(
          client,
          'owner@example.com',
          new Date('2026-03-16T00:00:00.000Z'),
        ),
      ).toBe(0)

      await client.query(
        `
          UPDATE agent_accounts
          SET owner_email = 'owner@example.com',
              owner_verified_at = '2026-03-16T00:00:00.000Z'
          WHERE id = $1
        `,
        [registration.agent.id],
      )

      expect(
        await wallet.grantHumanVerificationCredits(
          client,
          'owner@example.com',
          new Date('2026-03-16T00:00:00.000Z'),
        ),
      ).toBe(1)
      expect(
        await wallet.grantHumanVerificationCredits(
          client,
          'owner@example.com',
          new Date('2026-03-16T00:05:00.000Z'),
        ),
      ).toBe(0)
      expect(await wallet.readAgentWallet(client, registration.agent.id)).toEqual({
        promoCredits: 40,
        earnedCredits: 0,
        availableCredits: 40,
      })

      expect(
        await wallet.debitAgentCredits(client, registration.agent.id, 12.5),
      ).toEqual({
        promoCredits: 27.5,
        earnedCredits: 0,
        availableCredits: 27.5,
      })

      await client.query(
        `
          UPDATE agent_accounts
          SET earned_credits_balance = 5
          WHERE id = $1
        `,
        [registration.agent.id],
      )
      expect(
        await wallet.debitAgentCredits(client, registration.agent.id, 30),
      ).toEqual({
        promoCredits: 0,
        earnedCredits: 2.5,
        availableCredits: 2.5,
      })

      await expect(
        wallet.debitAgentCredits(client, registration.agent.id, 10),
      ).rejects.toThrow('Insufficient agent credits.')
      await expect(
        wallet.debitAgentCredits(client, 'missing-agent', 1),
      ).rejects.toThrow('Agent wallet was not found.')
      expect(await wallet.readAgentWallet(client, 'missing-agent')).toBeNull()
    })

    await context.pool.end()
  })

  it('credits only newly won agent settlements back into earned balances', async () => {
    const context = await setupApiContext()
    const database = await import('./database')
    const wallet = await import('./wallet')

    const previousStore = {
      markets: [],
      bets: [
        {
          id: 'bet-open',
          userId: 'agent-wallet',
          marketId: 'market-1',
          stakeCredits: 10,
          side: 'against' as const,
          status: 'open' as const,
          payoutMultiplierAtPlacement: 1.5,
          globalBonusPercentAtPlacement: 10,
          projectedPayoutCredits: 16.5,
          settledPayoutCredits: null,
          placedAt: '2026-03-16T00:00:00.000Z',
          settledAt: null,
        },
        {
          id: 'bet-won-already',
          userId: 'agent-wallet',
          marketId: 'market-2',
          stakeCredits: 8,
          side: 'against' as const,
          status: 'won' as const,
          payoutMultiplierAtPlacement: 1.4,
          globalBonusPercentAtPlacement: 8,
          projectedPayoutCredits: 12.1,
          settledPayoutCredits: 12.1,
          placedAt: '2026-03-15T00:00:00.000Z',
          settledAt: '2026-03-16T00:00:00.000Z',
        },
      ],
      notifications: [],
      metadata: {
        lastMaintenanceRunAt: null,
        lastDiscoveryRunAt: null,
      },
    }
    const nextStore = {
      ...previousStore,
      bets: [
        {
          ...previousStore.bets[0],
          status: 'won' as const,
          settledPayoutCredits: null,
          settledAt: '2026-03-16T01:00:00.000Z',
        },
        previousStore.bets[1],
        {
          id: 'bet-demo',
          userId: 'demo-user',
          marketId: 'market-3',
          stakeCredits: 4,
          side: 'against' as const,
          status: 'won' as const,
          payoutMultiplierAtPlacement: 1.2,
          globalBonusPercentAtPlacement: 8,
          projectedPayoutCredits: 5.18,
          settledPayoutCredits: 5.18,
          placedAt: '2026-03-16T00:30:00.000Z',
          settledAt: '2026-03-16T01:00:00.000Z',
        },
        {
          id: 'bet-zero',
          userId: 'agent-wallet',
          marketId: 'market-4',
          stakeCredits: 2,
          side: 'against' as const,
          status: 'won' as const,
          payoutMultiplierAtPlacement: 1,
          globalBonusPercentAtPlacement: 0,
          projectedPayoutCredits: 0,
          settledPayoutCredits: 0,
          placedAt: '2026-03-16T00:45:00.000Z',
          settledAt: '2026-03-16T01:00:00.000Z',
        },
      ],
    }

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
          updated_at
        )
        VALUES (
          'agent-wallet',
          'wallet_bot',
          'Wallet Bot',
          'Owner',
          'OpenAI',
          'Tracks a real credits wallet.',
          'hash',
          'claim_wallet',
          'wallet-phrase',
          'owner@example.com',
          '2026-03-16T00:00:00.000Z',
          '2026-03-16T00:00:00.000Z',
          '2026-03-16T00:00:00.000Z'
        )
      `,
    )

    await database.withDatabaseTransaction(async (client) => {
      await wallet.applyAgentSettlementCredits(client, previousStore, previousStore)
      expect(await wallet.readAgentWallet(client, 'agent-wallet')).toEqual({
        promoCredits: 0,
        earnedCredits: 0,
        availableCredits: 0,
      })

      await wallet.applyAgentSettlementCredits(client, previousStore, nextStore)
      expect(await wallet.readAgentWallet(client, 'agent-wallet')).toEqual({
        promoCredits: 0,
        earnedCredits: 16.5,
        availableCredits: 16.5,
      })
    })

    await context.pool.end()
  })
})
