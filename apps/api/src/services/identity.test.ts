import { describe, expect, it, vi } from 'vitest'

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

  it('builds season competition standings from a shared baseline instead of raw bankroll size', async () => {
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
            'agent_alpha',
            'alpha',
            'Alpha',
            'Owner',
            'OpenAI',
            'Alpha grinds steady season edges.',
            'hash_alpha',
            'claim_alpha',
            'phrase_alpha',
            'owner@example.com',
            '2026-01-02T00:00:00.000Z',
            '2026-01-02T00:00:00.000Z',
            '2026-01-02T00:00:00.000Z',
            100,
            20,
            NULL
          ),
          (
            'agent_bravo',
            'bravo',
            'Bravo',
            'Owner',
            'Anthropic',
            'Bravo can deploy a much larger lifetime bankroll.',
            'hash_bravo',
            'claim_bravo',
            'phrase_bravo',
            'owner@example.com',
            '2026-01-03T00:00:00.000Z',
            '2026-01-03T00:00:00.000Z',
            '2026-01-03T00:00:00.000Z',
            100,
            500,
            NULL
          ),
          (
            'agent_charlie',
            'charlie',
            'Charlie',
            'Owner',
            'Gemini',
            'Charlie only has a small early sample.',
            'hash_charlie',
            'claim_charlie',
            'phrase_charlie',
            'owner@example.com',
            '2026-01-04T00:00:00.000Z',
            '2026-01-04T00:00:00.000Z',
            '2026-01-04T00:00:00.000Z',
            100,
            0,
            NULL
          )
      `,
    )

    await context.pool.query(
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
        VALUES
          (
            'bet_alpha_1',
            'agent_alpha',
            'doge-savings-2026',
            20,
            'against',
            'won',
            4.0,
            0,
            80,
            80,
            '2026-01-05T00:00:00.000Z',
            '2026-01-20T00:00:00.000Z'
          ),
          (
            'bet_alpha_2',
            'agent_alpha',
            'optimus-customizable-2026',
            20,
            'against',
            'lost',
            2.0,
            0,
            40,
            0,
            '2026-01-06T00:00:00.000Z',
            '2026-02-01T00:00:00.000Z'
          ),
          (
            'bet_bravo_1',
            'agent_bravo',
            'cybercab-volume-2026',
            200,
            'against',
            'won',
            1.3,
            0,
            260,
            260,
            '2026-01-07T00:00:00.000Z',
            '2026-02-10T00:00:00.000Z'
          ),
          (
            'bet_bravo_old',
            'agent_bravo',
            'robotaxi-million-2020',
            50,
            'against',
            'won',
            3.0,
            0,
            150,
            150,
            '2025-11-01T00:00:00.000Z',
            '2025-11-15T00:00:00.000Z'
          ),
          (
            'bet_bravo_open',
            'agent_bravo',
            'starship-mars-2026',
            30,
            'against',
            'open',
            2.0,
            0,
            60,
            NULL,
            '2026-03-01T00:00:00.000Z',
            NULL
          ),
          (
            'bet_charlie_1',
            'agent_charlie',
            'apple-smart-glasses-2026',
            10,
            'against',
            'won',
            2.0,
            0,
            20,
            20,
            '2026-01-08T00:00:00.000Z',
            '2026-03-01T00:00:00.000Z'
          )
      `,
    )

    const standings = await context.identity.readCompetitionStandings(
      3,
      new Date('2026-03-18T00:00:00.000Z'),
    )

    expect(standings.map((entry) => entry.agent.handle)).toEqual([
      'alpha',
      'bravo',
      'charlie',
    ])
    expect(standings[0]).toMatchObject({
      rank: 1,
      seasonId: '2026-Q1',
      baselineCredits: 100,
      seasonCompetitionCredits: 140,
      seasonNetProfitCredits: 40,
      seasonRoiPercent: 100,
      seasonResolvedBets: 2,
      seasonWonBets: 1,
      seasonWinRatePercent: 50,
      seasonCreditsWon: 80,
      seasonCreditsStaked: 40,
    })
    expect(standings[1]).toMatchObject({
      rank: 2,
      seasonId: '2026-Q1',
      baselineCredits: 100,
      seasonCompetitionCredits: 130,
      seasonNetProfitCredits: 60,
      seasonRoiPercent: 30,
      seasonResolvedBets: 1,
      seasonWonBets: 1,
      seasonWinRatePercent: 100,
      seasonCreditsWon: 260,
      seasonCreditsStaked: 200,
      seasonOpenExposureCredits: 60,
    })
    expect(standings[2]).toMatchObject({
      rank: 3,
      seasonId: '2026-Q1',
      baselineCredits: 100,
      seasonCompetitionCredits: 110,
      seasonNetProfitCredits: 10,
      seasonRoiPercent: 100,
      seasonResolvedBets: 1,
      seasonWonBets: 1,
      seasonWinRatePercent: 100,
      seasonCreditsWon: 20,
      seasonCreditsStaked: 10,
    })
    expect(standings[0]!.seasonCompetitionCredits).toBeGreaterThan(
      standings[1]!.seasonCompetitionCredits,
    )
    expect(standings[1]!.seasonNetProfitCredits).toBeGreaterThan(
      standings[0]!.seasonNetProfitCredits,
    )
    expect(standings[1]!.seasonCompetitionCredits).toBeGreaterThan(
      standings[2]!.seasonCompetitionCredits,
    )

    await context.pool.end()
  })

  it('breaks season standings ties by roi, resolved volume, stake volume, then reputation fallbacks', async () => {
    const context = await setupApiContext({
      applyMocks: () => {
        vi.doMock('./reputation', () => ({
          readAgentReputationFromClient: vi.fn(async () =>
            new Map([
              [
                'agent_karma',
                {
                  karma: 4,
                  authoredClaims: 0,
                  discussionPosts: 0,
                },
              ],
              [
                'agent_claims',
                {
                  karma: 0,
                  authoredClaims: 2,
                  discussionPosts: 0,
                },
              ],
              [
                'agent_posts',
                {
                  karma: 0,
                  authoredClaims: 0,
                  discussionPosts: 3,
                },
              ],
            ]),
          ),
        }))
      },
    })
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
          ('agent_roi_high', 'roi_high', 'ROI High', 'Owner', 'OpenAI', 'Higher ROI at the same competition stack.', 'hash1', 'claim1', 'phrase1', 'owner@example.com', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 100, 0, NULL),
          ('agent_roi_low', 'roi_low', 'ROI Low', 'Owner', 'OpenAI', 'Lower ROI at the same competition stack.', 'hash2', 'claim2', 'phrase2', 'owner@example.com', '2026-01-01T00:00:00.000Z', '2026-01-01T01:00:00.000Z', '2026-01-01T01:00:00.000Z', 100, 0, NULL),
          ('agent_resolved_high', 'resolved_high', 'Resolved High', 'Owner', 'OpenAI', 'More settled volume at the same competition stack.', 'hash3', 'claim3', 'phrase3', 'owner@example.com', '2026-01-01T00:00:00.000Z', '2026-01-01T02:00:00.000Z', '2026-01-01T02:00:00.000Z', 100, 0, NULL),
          ('agent_resolved_low', 'resolved_low', 'Resolved Low', 'Owner', 'OpenAI', 'Less settled volume at the same competition stack.', 'hash4', 'claim4', 'phrase4', 'owner@example.com', '2026-01-01T00:00:00.000Z', '2026-01-01T03:00:00.000Z', '2026-01-01T03:00:00.000Z', 100, 0, NULL),
          ('agent_stake_high', 'stake_high', 'Stake High', 'Owner', 'OpenAI', 'Higher staked volume at the same ROI and competition stack.', 'hash5', 'claim5', 'phrase5', 'owner@example.com', '2026-01-01T00:00:00.000Z', '2026-01-01T04:00:00.000Z', '2026-01-01T04:00:00.000Z', 100, 0, NULL),
          ('agent_stake_low', 'stake_low', 'Stake Low', 'Owner', 'OpenAI', 'Lower staked volume at the same ROI and competition stack.', 'hash6', 'claim6', 'phrase6', 'owner@example.com', '2026-01-01T00:00:00.000Z', '2026-01-01T05:00:00.000Z', '2026-01-01T05:00:00.000Z', 100, 0, NULL),
          ('agent_karma', 'karma', 'Karma', 'Owner', 'OpenAI', 'Wins zero-score ties on karma.', 'hash7', 'claim7', 'phrase7', 'owner@example.com', '2026-01-01T00:00:00.000Z', '2026-01-01T06:00:00.000Z', '2026-01-01T06:00:00.000Z', 100, 0, NULL),
          ('agent_claims', 'claims', 'Claims', 'Owner', 'OpenAI', 'Wins zero-score ties on authored claims.', 'hash8', 'claim8', 'phrase8', 'owner@example.com', '2026-01-01T00:00:00.000Z', '2026-01-01T07:00:00.000Z', '2026-01-01T07:00:00.000Z', 100, 0, NULL),
          ('agent_posts', 'posts', 'Posts', 'Owner', 'OpenAI', 'Wins zero-score ties on discussion volume.', 'hash9', 'claim9', 'phrase9', 'owner@example.com', '2026-01-01T00:00:00.000Z', '2026-01-01T08:00:00.000Z', '2026-01-01T08:00:00.000Z', 100, 0, NULL),
          ('agent_early', 'early', 'Early', 'Owner', 'OpenAI', 'Earlier created zero-score agent.', 'hash10', 'claim10', 'phrase10', 'owner@example.com', '2026-01-01T00:00:00.000Z', '2026-01-01T09:00:00.000Z', '2026-01-01T09:00:00.000Z', 100, 0, NULL),
          ('agent_late', 'late', 'Late', 'Owner', 'OpenAI', 'Later created zero-score agent.', 'hash11', 'claim11', 'phrase11', 'owner@example.com', '2026-01-01T00:00:00.000Z', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 100, 0, NULL)
      `,
    )

    await context.pool.query(
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
        VALUES
          ('bet_roi_high', 'agent_roi_high', 'doge-savings-2026', 10, 'against', 'won', 2.0, 0, 20, 20, '2026-01-02T00:00:00.000Z', '2026-01-20T00:00:00.000Z'),
          ('bet_roi_low', 'agent_roi_low', 'optimus-customizable-2026', 25, 'against', 'won', 1.4, 0, 35, 35, '2026-01-02T00:00:00.000Z', '2026-01-20T00:00:00.000Z'),
          ('bet_resolved_high_win', 'agent_resolved_high', 'cybercab-volume-2026', 10, 'against', 'won', 3.0, 0, 30, 30, '2026-01-02T00:00:00.000Z', '2026-01-20T00:00:00.000Z'),
          ('bet_resolved_high_loss', 'agent_resolved_high', 'starship-mars-2026', 10, 'against', 'lost', 1.0, 0, 10, 0, '2026-01-03T00:00:00.000Z', '2026-01-21T00:00:00.000Z'),
          ('bet_resolved_low', 'agent_resolved_low', 'robotaxi-million-2020', 20, 'against', 'won', 1.5, 0, 30, 30, '2026-01-02T00:00:00.000Z', '2026-01-20T00:00:00.000Z'),
          ('bet_stake_high', 'agent_stake_high', 'apple-smart-glasses-2026', 300, 'against', 'won', 1.1, 0, 330, 330, '2026-01-02T00:00:00.000Z', '2026-01-20T00:00:00.000Z'),
          ('bet_stake_low', 'agent_stake_low', 'apple-command-center-2026', 200, 'against', 'won', 1.1, 0, 220, 220, '2026-01-02T00:00:00.000Z', '2026-01-20T00:00:00.000Z')
      `,
    )

    const standings = await context.identity.readCompetitionStandings(
      11,
      new Date('2026-03-18T00:00:00.000Z'),
    )

    expect(standings.map((entry) => entry.agent.handle)).toEqual([
      'roi_high',
      'resolved_high',
      'resolved_low',
      'roi_low',
      'stake_high',
      'stake_low',
      'karma',
      'claims',
      'posts',
      'early',
      'late',
    ])
    expect(standings.find((entry) => entry.agent.handle === 'karma')).toMatchObject({
      seasonResolvedBets: 0,
      seasonRoiPercent: 0,
      seasonCompetitionCredits: 100,
      karma: 4,
    })
    expect(standings.find((entry) => entry.agent.handle === 'early')?.rank).toBe(10)
    expect(standings.find((entry) => entry.agent.handle === 'late')?.rank).toBe(11)

    await context.pool.end()
  })

  it('floors deeply negative seasons at zero and resets the board when the quarter rolls over', async () => {
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
        VALUES (
          'agent_floor',
          'floor',
          'Floor',
          'Owner',
          'OpenAI',
          'Absorbs a brutal season and resets cleanly next quarter.',
          'hash_floor',
          'claim_floor',
          'phrase_floor',
          'owner@example.com',
          '2026-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z',
          100,
          200,
          NULL
        )
      `,
    )

    await context.pool.query(
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
        VALUES
          (
            'bet_floor_loss_1',
            'agent_floor',
            'doge-savings-2026',
            90,
            'against',
            'lost',
            1.0,
            0,
            90,
            0,
            '2026-01-05T00:00:00.000Z',
            '2026-02-01T00:00:00.000Z'
          ),
          (
            'bet_floor_loss_2',
            'agent_floor',
            'cybercab-volume-2026',
            90,
            'against',
            'lost',
            1.0,
            0,
            90,
            0,
            '2026-01-06T00:00:00.000Z',
            '2026-02-02T00:00:00.000Z'
          )
      `,
    )

    const q1Standings = await context.identity.readCompetitionStandings(
      1,
      new Date('2026-03-18T00:00:00.000Z'),
    )
    const q2Standings = await context.identity.readCompetitionStandings(
      1,
      new Date('2026-04-18T00:00:00.000Z'),
    )

    expect(q1Standings[0]).toMatchObject({
      seasonId: '2026-Q1',
      seasonCompetitionCredits: 0,
      seasonNetProfitCredits: -180,
      seasonResolvedBets: 2,
      seasonWonBets: 0,
      seasonWinRatePercent: 0,
      seasonCreditsWon: 0,
      seasonCreditsStaked: 180,
    })
    expect(q2Standings[0]).toMatchObject({
      seasonId: '2026-Q2',
      seasonCompetitionCredits: 100,
      seasonNetProfitCredits: 0,
      seasonResolvedBets: 0,
      seasonWonBets: 0,
      seasonWinRatePercent: 0,
      seasonCreditsWon: 0,
      seasonCreditsStaked: 0,
    })

    await context.pool.end()
  })
})
