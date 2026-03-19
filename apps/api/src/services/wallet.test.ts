import { describe, expect, it } from 'vitest'

import { setupApiContext } from '../../../../test/helpers/api-context'
import { solveCaptchaPrompt as solveCaptcha } from '../../../../test/helpers/captcha'

describe('wallet service', () => {
  it('tops verified agents up to the seasonal bankroll floor and debits promo credits before earned credits', async () => {
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
      expect(await wallet.readAgentWallet(client, registration.agent.id)).toMatchObject({
        promoCredits: 0,
        earnedCredits: 0,
        availableCredits: 0,
      })

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
        await wallet.applyOwnerCreditEconomyForEmail(
          client,
          'owner@example.com',
          new Date('2026-03-16T00:00:00.000Z'),
        ),
      ).toBe(1)
      expect(
        await wallet.applyOwnerCreditEconomyForEmail(
          client,
          'owner@example.com',
          new Date('2026-03-16T00:05:00.000Z'),
        ),
      ).toBe(1)
      expect(await wallet.readAgentWallet(client, registration.agent.id)).toMatchObject({
        promoCredits: 100,
        earnedCredits: 0,
        availableCredits: 100,
        creditSeason: '2026-Q1',
      })

      expect(
        await wallet.debitAgentCredits(client, registration.agent.id, 12.5),
      ).toMatchObject({
        promoCredits: 87.5,
        earnedCredits: 0,
        availableCredits: 87.5,
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
        await wallet.debitAgentCredits(client, registration.agent.id, 90),
      ).toMatchObject({
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

  it('applies zero-balance refill once per cooldown window', async () => {
    const context = await setupApiContext()
    const database = await import('./database')
    const wallet = await import('./wallet')

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
          promo_credits_balance,
          earned_credits_balance,
          promo_credit_season_id,
          created_at,
          updated_at
        )
        VALUES (
          'agent-refill',
          'refill_bot',
          'Refill Bot',
          'Owner',
          'OpenAI',
          'Tests refill logic.',
          'hash',
          'claim_refill',
          'refill-phrase',
          'owner@example.com',
          '2026-03-16T00:00:00.000Z',
          0,
          0,
          '2026-Q1',
          '2026-03-16T00:00:00.000Z',
          '2026-03-16T00:00:00.000Z'
        )
      `,
    )

    await database.withDatabaseTransaction(async (client) => {
      expect(
        await wallet.applyAgentCreditEconomy(
          client,
          'agent-refill',
          new Date('2026-03-17T00:00:00.000Z'),
        ),
      ).toMatchObject({
        promoCredits: 20,
        earnedCredits: 0,
        availableCredits: 20,
        creditSeason: '2026-Q1',
      })

      await client.query(
        `
          UPDATE agent_accounts
          SET promo_credits_balance = 0,
              earned_credits_balance = 0
          WHERE id = 'agent-refill'
        `,
      )

      expect(
        await wallet.applyAgentCreditEconomy(
          client,
          'agent-refill',
          new Date('2026-03-18T00:00:00.000Z'),
        ),
      ).toMatchObject({
        promoCredits: 0,
        earnedCredits: 0,
        availableCredits: 0,
        creditSeason: '2026-Q1',
      })

      expect(
        await wallet.applyAgentCreditEconomy(
          client,
          'agent-refill',
          new Date('2026-03-25T00:00:00.000Z'),
        ),
      ).toMatchObject({
        promoCredits: 20,
        earnedCredits: 0,
        availableCredits: 20,
        creditSeason: '2026-Q1',
      })
    })

    await context.pool.end()
  })

  it('grants promo rewards for accepted leads and resolved authored markets once', async () => {
    const context = await setupApiContext()
    const database = await import('./database')
    const wallet = await import('./wallet')

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
          'agent-reward',
          'reward_bot',
          'Reward Bot',
          'Owner',
          'OpenAI',
          'Tracks merit rewards.',
          'hash',
          'claim_reward',
          'reward-phrase',
          'owner@example.com',
          '2026-03-16T00:00:00.000Z',
          '2026-03-16T00:00:00.000Z',
          '2026-03-16T00:00:00.000Z'
        )
      `,
    )

    await database.withDatabaseTransaction(async (client) => {
      await wallet.grantAcceptedLeadReward(
        client,
        'agent-reward',
        'lead-1',
        new Date('2026-03-18T00:00:00.000Z'),
      )
      await wallet.grantAcceptedLeadReward(
        client,
        'agent-reward',
        'lead-1',
        new Date('2026-03-18T00:01:00.000Z'),
      )

      await wallet.applyAuthoredMarketResolutionRewards(
        client,
        {
          markets: [
            {
              id: 'market-authored',
              slug: 'authored-market',
              headline: 'Authored market',
              subject: 'Authored market',
              category: 'ai',
              announcedOn: '2026-03-16T00:00:00.000Z',
              promisedDate: '2026-03-20T00:00:00.000Z',
              promisedBy: 'LemonSuk',
              summary: 'Authored market',
              status: 'open',
              resolution: 'pending',
              resolutionNotes: null,
              basePayoutMultiplier: 1.5,
              payoutMultiplier: 1.5,
              confidence: 80,
              stakeDifficulty: 3,
              tags: [],
              sources: [],
              author: {
                id: 'agent-reward',
                handle: 'reward_bot',
                displayName: 'Reward Bot',
              },
              linkedMarketIds: [],
              betWindowOpen: true,
              bustedAt: null,
              createdAt: '2026-03-16T00:00:00.000Z',
              updatedAt: '2026-03-16T00:00:00.000Z',
              lastCheckedAt: '2026-03-16T00:00:00.000Z',
            },
          ],
          bets: [],
          notifications: [],
          metadata: {
            lastMaintenanceRunAt: null,
            lastDiscoveryRunAt: null,
          },
        },
        {
          markets: [
            {
              id: 'market-authored',
              slug: 'authored-market',
              headline: 'Authored market',
              subject: 'Authored market',
              category: 'ai',
              announcedOn: '2026-03-16T00:00:00.000Z',
              promisedDate: '2026-03-20T00:00:00.000Z',
              promisedBy: 'LemonSuk',
              summary: 'Authored market',
              status: 'busted',
              resolution: 'missed',
              resolutionNotes: 'missed',
              basePayoutMultiplier: 1.5,
              payoutMultiplier: 1.5,
              confidence: 80,
              stakeDifficulty: 3,
              tags: [],
              sources: [],
              author: {
                id: 'agent-reward',
                handle: 'reward_bot',
                displayName: 'Reward Bot',
              },
              linkedMarketIds: [],
              betWindowOpen: false,
              bustedAt: '2026-03-21T00:00:00.000Z',
              createdAt: '2026-03-16T00:00:00.000Z',
              updatedAt: '2026-03-21T00:00:00.000Z',
              lastCheckedAt: '2026-03-21T00:00:00.000Z',
            },
          ],
          bets: [],
          notifications: [],
          metadata: {
            lastMaintenanceRunAt: null,
            lastDiscoveryRunAt: null,
          },
        },
      )
      await wallet.applyAuthoredMarketResolutionRewards(
        client,
        {
          markets: [
            {
              id: 'market-authored',
              slug: 'authored-market',
              headline: 'Authored market',
              subject: 'Authored market',
              category: 'ai',
              announcedOn: '2026-03-16T00:00:00.000Z',
              promisedDate: '2026-03-20T00:00:00.000Z',
              promisedBy: 'LemonSuk',
              summary: 'Authored market',
              status: 'open',
              resolution: 'pending',
              resolutionNotes: null,
              basePayoutMultiplier: 1.5,
              payoutMultiplier: 1.5,
              confidence: 80,
              stakeDifficulty: 3,
              tags: [],
              sources: [],
              author: {
                id: 'agent-reward',
                handle: 'reward_bot',
                displayName: 'Reward Bot',
              },
              linkedMarketIds: [],
              betWindowOpen: true,
              bustedAt: null,
              createdAt: '2026-03-16T00:00:00.000Z',
              updatedAt: '2026-03-16T00:00:00.000Z',
              lastCheckedAt: '2026-03-16T00:00:00.000Z',
            },
          ],
          bets: [],
          notifications: [],
          metadata: {
            lastMaintenanceRunAt: null,
            lastDiscoveryRunAt: null,
          },
        },
        {
          markets: [
            {
              id: 'market-authored',
              slug: 'authored-market',
              headline: 'Authored market',
              subject: 'Authored market',
              category: 'ai',
              announcedOn: '2026-03-16T00:00:00.000Z',
              promisedDate: '2026-03-20T00:00:00.000Z',
              promisedBy: 'LemonSuk',
              summary: 'Authored market',
              status: 'busted',
              resolution: 'missed',
              resolutionNotes: 'missed',
              basePayoutMultiplier: 1.5,
              payoutMultiplier: 1.5,
              confidence: 80,
              stakeDifficulty: 3,
              tags: [],
              sources: [],
              author: {
                id: 'agent-reward',
                handle: 'reward_bot',
                displayName: 'Reward Bot',
              },
              linkedMarketIds: [],
              betWindowOpen: false,
              bustedAt: '2026-03-21T00:00:00.000Z',
              createdAt: '2026-03-16T00:00:00.000Z',
              updatedAt: '2026-03-21T00:00:00.000Z',
              lastCheckedAt: '2026-03-21T00:00:00.000Z',
            },
          ],
          bets: [],
          notifications: [],
          metadata: {
            lastMaintenanceRunAt: null,
            lastDiscoveryRunAt: null,
          },
        },
      )

      expect(await wallet.readAgentWallet(client, 'agent-reward')).toMatchObject({
        promoCredits: 25,
        earnedCredits: 0,
        availableCredits: 25,
      })
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
      expect(await wallet.readAgentWallet(client, 'agent-wallet')).toMatchObject({
        promoCredits: 0,
        earnedCredits: 0,
        availableCredits: 0,
      })

      await wallet.applyAgentSettlementCredits(client, previousStore, nextStore)
      expect(await wallet.readAgentWallet(client, 'agent-wallet')).toMatchObject({
        promoCredits: 0,
        earnedCredits: 16.5,
        availableCredits: 16.5,
      })

      await wallet.applyAgentSettlementCredits(client, previousStore, nextStore)
      expect(await wallet.readAgentWallet(client, 'agent-wallet')).toMatchObject({
        promoCredits: 0,
        earnedCredits: 16.5,
        availableCredits: 16.5,
      })
    })

    await context.pool.end()
  })
})
