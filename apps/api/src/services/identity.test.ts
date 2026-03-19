import { describe, expect, it } from 'vitest'

import { placeAgainstBetForUser } from './betting'
import { setupApiContext } from '../../../../test/helpers/api-context'

function solveCaptcha(prompt: string): string {
  const match = prompt.match(
    /slug:\s+([a-z]+-[a-z]+)-(\d+)\+(\d+)\./i,
  )

  if (!match) {
    throw new Error(`Could not solve captcha prompt: ${prompt}`)
  }

  return `${match[1]}-${Number(match[2]) + Number(match[3])}`
}

function registrationInput(challengeId: string, handle: string, prompt: string) {
  return {
    handle,
    displayName: `Agent ${handle}`,
    ownerName: 'Human Owner',
    modelProvider: 'OpenAI',
    biography:
      'Systematic counter-bettor that tracks deadlines and fades optimistic timelines.',
    captchaChallengeId: challengeId,
    captchaAnswer: solveCaptcha(prompt),
  }
}

describe('identity service', () => {
  it('rejects used, expired, and duplicate registrations', async () => {
    const context = await setupApiContext()
    const firstChallenge = await context.identity.createCaptchaChallenge()
    const success = await context.identity.registerAgent(
      registrationInput(firstChallenge.id, 'alpha_bot', firstChallenge.prompt),
    )

    expect(success.agent.handle).toBe('alpha_bot')
    expect(success.agent.availableCredits).toBe(0)

    await expect(
      context.identity.registerAgent(
        registrationInput(firstChallenge.id, 'bravo_bot', firstChallenge.prompt),
      ),
    ).rejects.toThrow('Captcha challenge already used.')

    const wrongAnswerChallenge = await context.identity.createCaptchaChallenge()
    await expect(
      context.identity.registerAgent({
        ...registrationInput(
          wrongAnswerChallenge.id,
          'wrong_answer_bot',
          wrongAnswerChallenge.prompt,
        ),
        captchaAnswer: 'wrong-answer',
      }),
    ).rejects.toThrow('Captcha answer did not match the challenge.')

    const expiredChallenge = await context.identity.createCaptchaChallenge()
    await context.pool.query(
      `
        UPDATE captcha_challenges
        SET expires_at = '2000-01-01T00:00:00.000Z'
        WHERE id = $1
      `,
      [expiredChallenge.id],
    )
    await expect(
      context.identity.registerAgent(
        registrationInput(
          expiredChallenge.id,
          'charlie_bot',
          expiredChallenge.prompt,
        ),
      ),
    ).rejects.toThrow('Captcha challenge expired. Request a new one.')

    const duplicateHandleChallenge =
      await context.identity.createCaptchaChallenge()
    await expect(
      context.identity.registerAgent(
        registrationInput(
          duplicateHandleChallenge.id,
          'alpha_bot',
          duplicateHandleChallenge.prompt,
        ),
      ),
    ).rejects.toThrow('That agent handle is already taken.')

    await context.pool.end()
  })

  it('builds owner sessions and ranks the hall of fame with contribution karma kept separate from credits', async () => {
    const context = await setupApiContext()

    const alphaChallenge = await context.identity.createCaptchaChallenge()
    const alpha = await context.identity.registerAgent(
      registrationInput(alphaChallenge.id, 'alpha_bot', alphaChallenge.prompt),
    )
    const bravoChallenge = await context.identity.createCaptchaChallenge()
    const bravo = await context.identity.registerAgent(
      registrationInput(bravoChallenge.id, 'bravo_bot', bravoChallenge.prompt),
    )
    expect(alpha.agent.availableCredits).toBe(0)
    expect(bravo.agent.availableCredits).toBe(0)

    expect(await context.identity.readCaptchaChallenge(alphaChallenge.id)).not.toBeNull()
    expect(await context.identity.authenticateAgentApiKey('missing')).toBeNull()
    expect(
      await context.identity.authenticateAgentApiKey(alpha.apiKey),
    ).toMatchObject({
      handle: 'alpha_bot',
    })
    await context.store.withStoreTransaction(async (_store, _persist, client) => {
      expect(
        await context.identity.readAgentProfileByIdFromClient(client, 'missing'),
      ).toBeNull()
    })
    expect(
      (await context.identity.readClaimView(alpha.agent.claimUrl.replace('/?claim=', '')))
        ?.agent.handle,
    ).toBe('alpha_bot')

    const alphaClaimToken = alpha.agent.claimUrl.replace('/?claim=', '')
    const alphaOwnerLogin = await context.identity.claimOwnerByClaimToken(
      alphaClaimToken,
      'owner@example.com',
    )
    expect(alphaOwnerLogin.ownerEmail).toBe('owner@example.com')
    expect(
      await context.identity.authenticateAgentApiKey(alpha.apiKey),
    ).toMatchObject({
      availableCredits: 100,
      promoCredits: 100,
      earnedCredits: 0,
    })
    await expect(
      context.identity.claimOwnerByClaimToken(
        alphaClaimToken,
        'different@example.com',
      ),
    ).rejects.toThrow('This agent is already linked to another owner email.')
    await context.identity.setupOwnerEmail(bravo.apiKey, 'owner@example.com')
    const agentDirectoryStats = await context.identity.readAgentDirectoryStats()
    expect(agentDirectoryStats).toEqual({
      registeredAgents: 2,
      humanVerifiedAgents: 1,
    })

    await context.store.withStoreTransaction(async (store, persist) => {
      const alphaFirst = placeAgainstBetForUser(
        store,
        alpha.agent.id,
        'cybercab-volume-2026',
        40,
        new Date('2026-03-16T00:00:00.000Z'),
      )
      const alphaSecond = placeAgainstBetForUser(
        alphaFirst.store,
        alpha.agent.id,
        'optimus-customizable-2026',
        20,
        new Date('2026-03-16T00:01:00.000Z'),
      )
      const bravoBet = placeAgainstBetForUser(
        alphaSecond.store,
        bravo.agent.id,
        'optimus-customizable-2026',
        10,
        new Date('2026-03-16T00:02:00.000Z'),
      )

      await persist(bravoBet.store)
    })

    const ownerLogin = await context.identity.createOwnerLoginLink(
      'owner@example.com',
    )
    expect(
      await context.identity.authenticateAgentApiKey(alpha.apiKey),
    ).toMatchObject({
      availableCredits: 100,
      promoCredits: 100,
      earnedCredits: 0,
    })
    expect(
      await context.identity.authenticateAgentApiKey(bravo.apiKey),
    ).toMatchObject({
      availableCredits: 100,
      promoCredits: 100,
      earnedCredits: 0,
    })
    expect(await context.identity.readAgentDirectoryStats()).toEqual({
      registeredAgents: 2,
      humanVerifiedAgents: 2,
    })
    const pendingOwnerSession = await context.identity.readOwnerSession(
      ownerLogin.sessionToken,
    )

    expect(pendingOwnerSession?.bets.some((bet) => bet.settledAt === null)).toBe(
      true,
    )

    await context.maintenance.loadMaintainedStore(
      new Date('2027-01-05T00:00:00.000Z'),
    )
    await context.pool.query(
      `
        UPDATE notifications
        SET read_at = '2027-01-02T01:00:00.000Z'
        WHERE id = (
          SELECT id
          FROM notifications
          ORDER BY created_at DESC
          LIMIT 1
        )
      `,
    )
    const ownerSession = await context.identity.readOwnerSession(
      ownerLogin.sessionToken,
    )

    expect(ownerSession?.agents).toHaveLength(2)
    expect(
      ownerSession?.agents.some(
        (agent) => (agent.availableCredits ?? 0) > 100,
      ),
    ).toBe(true)
    expect(ownerSession?.bets).toHaveLength(3)
    expect(ownerSession?.notifications).toHaveLength(3)
    expect(ownerSession?.bets.some((bet) => bet.settledAt !== null)).toBe(true)
    expect(ownerSession?.notifications.some((entry) => entry.readAt !== null)).toBe(
      true,
    )

    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_email = 'elsewhere@example.com'
        WHERE owner_email = 'owner@example.com'
      `,
    )
    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_verified_at = NULL
        WHERE handle = 'bravo_bot'
      `,
    )

    const emptySession = await context.identity.readOwnerSession(
      ownerLogin.sessionToken,
    )
    expect(emptySession?.agents).toEqual([])
    expect(emptySession?.bets).toEqual([])
    expect(emptySession?.notifications).toEqual([])

    const hallOfFame = await context.identity.readHallOfFame(1)
    expect(hallOfFame).toHaveLength(1)
    expect(hallOfFame[0]).toMatchObject({
      rank: 1,
      karma: 0,
      authoredClaims: 0,
      discussionPosts: 0,
      wonBets: 2,
      winRatePercent: 100,
    })
    expect(hallOfFame[0]?.agent.handle).toBe('alpha_bot')
    expect(hallOfFame[0]?.agent.earnedCredits).toBeGreaterThan(0)
    expect(hallOfFame[0]?.totalCreditsWon).toBeGreaterThan(
      hallOfFame[0]?.totalCreditsStaked ?? 0,
    )
    expect(await context.identity.readAgentDirectoryStats()).toEqual({
      registeredAgents: 2,
      humanVerifiedAgents: 1,
    })

    const expiringLink = await context.identity.createOwnerLoginLink(
      'elsewhere@example.com',
    )
    await context.pool.query(
      `
        UPDATE owner_sessions
        SET expires_at = '2000-01-01T00:00:00.000Z'
        WHERE token = $1
      `,
      [expiringLink.sessionToken],
    )
    expect(
      await context.identity.readOwnerSession(expiringLink.sessionToken),
    ).toBeNull()

    await context.pool.end()
  })

  it('breaks hall-of-fame ties by authored claims, discussion volume, then created time', async () => {
    const context = await setupApiContext()
    await context.store.ensureStore()

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
            'agent_claims',
            'claims',
            'Claims',
            'Owner',
            'OpenAI',
            'Wins claim tie breaks.',
            'hash_claims',
            'claim_claims',
            'phrase_claims',
            'owner@example.com',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T00:00:00.000Z',
            0,
            0,
            NULL
          ),
          (
            'agent_posts',
            'posts',
            'Posts',
            'Owner',
            'Anthropic',
            'Wins post-volume tie breaks.',
            'hash_posts',
            'claim_posts',
            'phrase_posts',
            'owner@example.com',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T01:00:00.000Z',
            '2026-03-16T01:00:00.000Z',
            0,
            0,
            NULL
          ),
          (
            'agent_early',
            'early',
            'Early',
            'Owner',
            'Gemini',
            'Earlier created agent.',
            'hash_early',
            'claim_early',
            'phrase_early',
            'owner@example.com',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T02:00:00.000Z',
            '2026-03-16T02:00:00.000Z',
            0,
            0,
            NULL
          ),
          (
            'agent_late',
            'late',
            'Late',
            'Owner',
            'Gemini',
            'Later created agent.',
            'hash_late',
            'claim_late',
            'phrase_late',
            'owner@example.com',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T03:00:00.000Z',
            '2026-03-16T03:00:00.000Z',
            0,
            0,
            NULL
          ),
          (
            'agent_karma',
            'karma',
            'Karma',
            'Owner',
            'OpenAI',
            'Wins the karma sort.',
            'hash_karma',
            'claim_karma',
            'phrase_karma',
            'owner@example.com',
            '2026-03-16T00:00:00.000Z',
            '2026-03-16T04:00:00.000Z',
            '2026-03-16T04:00:00.000Z',
            0,
            0,
            NULL
          )
      `,
    )

    await context.pool.query(
      `
        UPDATE markets
        SET authored_by_agent_id = 'agent_claims'
        WHERE id = 'cybercab-volume-2026'
      `,
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
          updated_at
        )
        VALUES
          (
            'post_posts_1',
            'optimus-customizable-2026',
            NULL,
            'agent_posts',
            'posts',
            'Posts',
            'Anthropic',
            'Posts take 1.',
            '2026-03-16T04:00:00.000Z',
            '2026-03-16T04:00:00.000Z'
          ),
          (
            'post_posts_2',
            'optimus-customizable-2026',
            NULL,
            'agent_posts',
            'posts',
            'Posts',
            'Anthropic',
            'Posts take 2.',
            '2026-03-16T04:05:00.000Z',
            '2026-03-16T04:05:00.000Z'
          ),
          (
            'post_karma',
            'optimus-customizable-2026',
            NULL,
            'agent_karma',
            'karma',
            'Karma',
            'OpenAI',
            'Karma take.',
            '2026-03-16T05:00:00.000Z',
            '2026-03-16T05:00:00.000Z'
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
        VALUES (
          'post_karma',
          'voter_karma',
          1,
          '2026-03-16T05:05:00.000Z',
          '2026-03-16T05:05:00.000Z'
        )
      `,
    )

    const hallOfFame = await context.identity.readHallOfFame(5)

    expect(hallOfFame.map((entry) => entry.agent.handle)).toEqual([
      'karma',
      'claims',
      'posts',
      'early',
      'late',
    ])

    await context.pool.end()
  })
})
