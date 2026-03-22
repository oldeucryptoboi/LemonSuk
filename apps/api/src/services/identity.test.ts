import { beforeEach, describe, expect, it, vi } from 'vitest'

import { placeAgainstBetForUser } from './betting'
import { setupApiContext } from '../../../../test/helpers/api-context'
import { solveCaptchaPrompt as solveCaptcha } from '../../../../test/helpers/captcha'

const avatarStorageMocks = vi.hoisted(() => ({
  ingestAgentAvatarFromUrl: vi.fn(async (sourceUrl: string, agentHandle: string) => {
    const extension = sourceUrl.split('.').pop() || 'png'
    return `https://cdn.lemonsuk.test/agent-avatars/${agentHandle}/${agentHandle}.${extension}`
  }),
  deleteManagedAvatarUrl: vi.fn(async () => undefined),
  isManagedAvatarUrl: vi.fn((url: string | null | undefined) =>
    typeof url === 'string' && url.startsWith('https://cdn.lemonsuk.test/'),
  ),
}))

vi.mock('./avatar-storage', () => avatarStorageMocks)

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

async function connectClaimX(
  context: Awaited<ReturnType<typeof setupApiContext>>,
  agentId: string,
  handle = 'owner',
  userId = 'x-user-1',
) {
  await context.pool.query(
    `
      UPDATE agent_accounts
      SET owner_verification_x_handle = $2,
          owner_verification_x_user_id = $3,
          owner_verification_x_connected_at = '2026-03-16T00:00:00.000Z'
      WHERE id = $1
    `,
    [agentId, handle, userId],
  )
}

async function verifyClaimEmail(
  context: Awaited<ReturnType<typeof setupApiContext>>,
  claimToken: string,
) {
  const link =
    await context.identity.createClaimOwnerEmailVerificationLink(claimToken)
  const token = new URL(link.claimUrl, 'http://localhost').searchParams.get(
    'token',
  )

  if (!token) {
    throw new Error('Expected email verification token in claim link.')
  }

  await context.identity.verifyClaimOwnerEmail(token)
}

function enableXPostVerification() {
  process.env.X_BEARER_TOKEN = 'x-bearer-token'
}

function createTweetLookupResponse(input: {
  tweetId: string
  authorId: string
  username?: string
  text: string
}) {
  return new Response(
    JSON.stringify({
      data: {
        id: input.tweetId,
        author_id: input.authorId,
        text: input.text,
      },
      includes: input.username
        ? {
            users: [
              {
                id: input.authorId,
                username: input.username,
              },
            ],
          }
        : undefined,
    }),
    { status: 200 },
  )
}

describe('identity service', () => {
  beforeEach(() => {
    avatarStorageMocks.ingestAgentAvatarFromUrl.mockClear()
    avatarStorageMocks.deleteManagedAvatarUrl.mockClear()
    avatarStorageMocks.isManagedAvatarUrl.mockClear()
    avatarStorageMocks.ingestAgentAvatarFromUrl.mockImplementation(
      async (sourceUrl: string, agentHandle: string) => {
        const extension = sourceUrl.split('.').pop() || 'png'
        return `https://cdn.lemonsuk.test/agent-avatars/${agentHandle}/${agentHandle}.${extension}`
      },
    )
    avatarStorageMocks.deleteManagedAvatarUrl.mockImplementation(
      async () => undefined,
    )
    avatarStorageMocks.isManagedAvatarUrl.mockImplementation(
      (url: string | null | undefined) =>
        typeof url === 'string' && url.startsWith('https://cdn.lemonsuk.test/'),
    )
  })

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

  it('accepts a two-character handle to match Moltbook-style naming rules', async () => {
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()

    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'ph', challenge.prompt),
    )

    expect(registration.agent.handle).toBe('ph')

    await context.pool.end()
  })

  it('stores avatar urls during registration and returns them from the agent profile', async () => {
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()

    const registration = await context.identity.registerAgent({
      ...registrationInput(challenge.id, 'avatar_bot', challenge.prompt),
      avatarUrl: 'https://example.com/avatar-bot.png',
    })

    expect(registration.agent.avatarUrl).toBe(
      'https://cdn.lemonsuk.test/agent-avatars/avatar_bot/avatar_bot.png',
    )
    expect(avatarStorageMocks.ingestAgentAvatarFromUrl).toHaveBeenCalledWith(
      'https://example.com/avatar-bot.png',
      'avatar_bot',
    )
    expect(
      await context.identity.authenticateAgentApiKey(registration.apiKey),
    ).toMatchObject({
      handle: 'avatar_bot',
      avatarUrl:
        'https://cdn.lemonsuk.test/agent-avatars/avatar_bot/avatar_bot.png',
    })

    await context.store.withStoreTransaction(async (_store, _persist, client) => {
      expect(
        await context.identity.readAgentProfileByIdFromClient(
          client,
          registration.agent.id,
        ),
      ).toMatchObject({
        handle: 'avatar_bot',
        avatarUrl:
          'https://cdn.lemonsuk.test/agent-avatars/avatar_bot/avatar_bot.png',
      })
    })

    await context.pool.end()
  })

  it('updates agent display, biography, and avatar through the authenticated profile route', async () => {
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent({
      ...registrationInput(challenge.id, 'profile_bot', challenge.prompt),
      avatarUrl: 'https://example.com/original.png',
    })

    await expect(
      context.identity.updateAgentProfile(registration.apiKey, {}),
    ).rejects.toThrow('No valid profile fields were provided.')

    const updated = await context.identity.updateAgentProfile(
      registration.apiKey,
      {
        displayName: 'Profile Bot Prime',
        biography:
          'Profile bot now carries a sharper biography with an updated photo.',
        avatarUrl: 'https://example.com/profile-bot-prime.png',
      },
    )

    expect(updated).toMatchObject({
      displayName: 'Profile Bot Prime',
      biography:
        'Profile bot now carries a sharper biography with an updated photo.',
      avatarUrl:
        'https://cdn.lemonsuk.test/agent-avatars/profile_bot/profile_bot.png',
    })

    const retainedAvatar = await context.identity.updateAgentProfile(
      registration.apiKey,
      {
        displayName: 'Profile Bot Encore',
      },
    )

    expect(retainedAvatar).toMatchObject({
      displayName: 'Profile Bot Encore',
      avatarUrl:
        'https://cdn.lemonsuk.test/agent-avatars/profile_bot/profile_bot.png',
    })

    const cleared = await context.identity.updateAgentProfile(
      registration.apiKey,
      {
        avatarUrl: null,
      },
    )

    expect(cleared.avatarUrl).toBeNull()
    expect(
      await context.identity.authenticateAgentApiKey(registration.apiKey),
    ).toMatchObject({
      displayName: 'Profile Bot Encore',
      avatarUrl: null,
    })

    await context.pool.end()
  })

  it('rejects agent profile updates after an unverified registration has expired', async () => {
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'expired_profile_bot', challenge.prompt),
    )

    await context.pool.query(
      `
        UPDATE agent_accounts
        SET created_at = '2026-03-15T00:00:00.000Z',
            updated_at = '2026-03-15T00:00:00.000Z'
        WHERE id = $1
      `,
      [registration.agent.id],
    )

    await expect(
      context.identity.updateAgentProfile(registration.apiKey, {
        displayName: 'Expired Bot',
      }),
    ).rejects.toThrow(
      'This agent registration expired. Register the agent again.',
    )

    expect(
      await context.pool.query(
        `SELECT COUNT(*)::int AS count FROM agent_accounts WHERE id = $1`,
        [registration.agent.id],
      ),
    ).toMatchObject({ rows: [{ count: 0 }] })

    await context.pool.end()
  })

  it('rejects agent profile updates when the api key is not recognized', async () => {
    const context = await setupApiContext()

    await expect(
      context.identity.updateAgentProfile('missing-api-key', {
        displayName: 'Ghost Bot',
      }),
    ).rejects.toThrow('Agent API key was not recognized.')

    await context.pool.end()
  })

  it('requires X OAuth config before starting the X-connect flow', async () => {
    delete process.env.X_CLIENT_ID
    delete process.env.X_CLIENT_SECRET
    const context = await setupApiContext()

    await expect(
      context.identity.createOwnerClaimXConnectUrl('claim_missing'),
    ).rejects.toThrow('X verification is not configured right now.')

    await context.pool.end()
  })

  it('rejects missing X callback states', async () => {
    process.env.X_CLIENT_ID = 'x-client-id'
    process.env.X_CLIENT_SECRET = 'x-client-secret'
    const context = await setupApiContext()

    await expect(
      context.identity.completeOwnerClaimXConnection({
        state: 'missing-state',
        code: 'auth-code',
      }),
    ).rejects.toThrow(
      'That X verification session has expired. Start again from the claim link.',
    )

    await context.pool.end()
  })

  it('requires claim email verification before X and consumes the emailed link once', async () => {
    process.env.X_CLIENT_ID = 'x-client-id'
    process.env.X_CLIENT_SECRET = 'x-client-secret'
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'email_gate_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')

    const pendingEmailClaim = await context.identity.claimOwnerByClaimToken(
      claimToken,
      'owner@example.com',
    )
    expect(pendingEmailClaim.agent.ownerVerificationStatus).toBe('pending_email')
    await expect(
      context.identity.createOwnerClaimXConnectUrl(claimToken),
    ).rejects.toThrow(
      'Confirm the owner email from the claim link before connecting X.',
    )

    const link =
      await context.identity.createClaimOwnerEmailVerificationLink(claimToken)
    const token = new URL(link.claimUrl, 'http://localhost').searchParams.get(
      'token',
    )
    if (!token) {
      throw new Error('Expected email verification token in claim link.')
    }

    await expect(
      context.identity.verifyClaimOwnerEmail(token),
    ).resolves.toEqual({
      claimToken,
    })

    const pendingTweetClaim = await context.identity.readClaimView(claimToken)
    expect(pendingTweetClaim?.agent.ownerVerificationStatus).toBe('pending_tweet')

    await expect(context.identity.verifyClaimOwnerEmail(token)).rejects.toThrow(
      'That claim email verification link has expired. Start again from the claim link.',
    )

    await context.pool.end()
  })

  it('rejects swapping to a different owner email once a claim already advanced to pending_tweet', async () => {
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'locked_claim_owner_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')

    await context.identity.claimOwnerByClaimToken(claimToken, 'owner@example.com')
    await verifyClaimEmail(context, claimToken)

    await expect(
      context.identity.claimOwnerByClaimToken(claimToken, 'other@example.com'),
    ).rejects.toThrow('This agent is already linked to another owner email.')

    await context.pool.end()
  })

  it('rejects swapping to a different owner email after a claim is already verified', async () => {
    enableXPostVerification()
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(
        challenge.id,
        'verified_locked_claim_owner_bot',
        challenge.prompt,
      ),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')

    const pendingEmailClaim = await context.identity.claimOwnerByClaimToken(
      claimToken,
      'owner@example.com',
    )
    await verifyClaimEmail(context, claimToken)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        createTweetLookupResponse({
          tweetId: '31415926',
          authorId: 'x-user-1',
          username: 'owner',
          text: `Claiming @verified_locked_claim_owner_bot on LemonSuk. Human verification code: ${pendingEmailClaim.agent.ownerVerificationCode}`,
        }),
      ),
    )
    await connectClaimX(context, registration.agent.id)
    await context.identity.verifyOwnerByClaimTweet(claimToken, {
      tweetUrl: 'https://x.com/owner/status/31415926',
    })

    await expect(
      context.identity.claimOwnerByClaimToken(claimToken, 'other@example.com'),
    ).rejects.toThrow('This agent is already linked to another owner email.')

    await context.pool.end()
  })

  it('accepts an already-verified claim email token without reopening the claim flow', async () => {
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'verified_email_token_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')

    await context.identity.claimOwnerByClaimToken(claimToken, 'owner@example.com')
    const link =
      await context.identity.createClaimOwnerEmailVerificationLink(claimToken)
    const token = new URL(link.claimUrl, 'http://localhost').searchParams.get(
      'token',
    )

    if (!token) {
      throw new Error('Expected email verification token in claim link.')
    }

    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_verified_at = '2026-03-16T00:00:00.000Z',
            owner_verification_status = 'verified'
        WHERE id = $1
      `,
      [registration.agent.id],
    )

    await expect(context.identity.verifyClaimOwnerEmail(token)).resolves.toEqual({
      claimToken,
    })

    await context.pool.end()
  })

  it('rejects a claim email token when the attached owner email changed after the link was issued', async () => {
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'mismatched_email_token_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')

    await context.identity.claimOwnerByClaimToken(claimToken, 'owner@example.com')
    const link =
      await context.identity.createClaimOwnerEmailVerificationLink(claimToken)
    const token = new URL(link.claimUrl, 'http://localhost').searchParams.get(
      'token',
    )

    if (!token) {
      throw new Error('Expected email verification token in claim link.')
    }

    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_email = 'other@example.com'
        WHERE id = $1
      `,
      [registration.agent.id],
    )

    await expect(context.identity.verifyClaimOwnerEmail(token)).rejects.toThrow(
      'This claim email verification link no longer matches the attached owner email.',
    )

    await context.pool.end()
  })

  it('rejects claim email tokens when the claim vanished or expired before verification', async () => {
    const context = await setupApiContext()
    const missingChallenge = await context.identity.createCaptchaChallenge()
    const missingRegistration = await context.identity.registerAgent(
      registrationInput(
        missingChallenge.id,
        'missing_email_claim_bot',
        missingChallenge.prompt,
      ),
    )
    const missingClaimToken = missingRegistration.agent.claimUrl.replace(
      '/?claim=',
      '',
    )

    await context.identity.claimOwnerByClaimToken(
      missingClaimToken,
      'owner@example.com',
    )
    const missingLink =
      await context.identity.createClaimOwnerEmailVerificationLink(
        missingClaimToken,
      )
    const missingToken = new URL(
      missingLink.claimUrl,
      'http://localhost',
    ).searchParams.get('token')

    if (!missingToken) {
      throw new Error('Expected email verification token in claim link.')
    }

    await context.pool.query(`DELETE FROM agent_accounts WHERE id = $1`, [
      missingRegistration.agent.id,
    ])

    await expect(
      context.identity.verifyClaimOwnerEmail(missingToken),
    ).rejects.toThrow('Claim not found.')

    const expiredChallenge = await context.identity.createCaptchaChallenge()
    const expiredRegistration = await context.identity.registerAgent(
      registrationInput(
        expiredChallenge.id,
        'expired_email_claim_bot',
        expiredChallenge.prompt,
      ),
    )
    const expiredClaimToken = expiredRegistration.agent.claimUrl.replace(
      '/?claim=',
      '',
    )

    await context.identity.claimOwnerByClaimToken(
      expiredClaimToken,
      'owner@example.com',
    )
    const expiredLink =
      await context.identity.createClaimOwnerEmailVerificationLink(
        expiredClaimToken,
      )
    const expiredToken = new URL(
      expiredLink.claimUrl,
      'http://localhost',
    ).searchParams.get('token')

    if (!expiredToken) {
      throw new Error('Expected email verification token in claim link.')
    }

    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_verification_started_at = '2026-03-15T00:00:00.000Z',
            updated_at = '2026-03-15T00:00:00.000Z'
        WHERE id = $1
      `,
      [expiredRegistration.agent.id],
    )

    await expect(
      context.identity.verifyClaimOwnerEmail(expiredToken),
    ).rejects.toThrow('Claim not found.')
    expect(
      await context.pool.query(
        `SELECT COUNT(*)::int AS count FROM agent_accounts WHERE id = $1`,
        [expiredRegistration.agent.id],
      ),
    ).toMatchObject({ rows: [{ count: 0 }] })

    await context.pool.end()
  })

  it('rejects completing the X callback before the claim email is confirmed', async () => {
    process.env.X_CLIENT_ID = 'x-client-id'
    process.env.X_CLIENT_SECRET = 'x-client-secret'
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'pending_email_x_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')

    await context.identity.claimOwnerByClaimToken(claimToken, 'owner@example.com')
    await context.pool.query(
      `
        INSERT INTO owner_verification_x_states (
          state,
          claim_token,
          code_verifier,
          created_at,
          expires_at,
          consumed_at
        )
        VALUES (
          'state_pending_email',
          $1,
          'code-verifier',
          '2099-03-16T00:00:00.000Z',
          '2099-03-16T00:15:00.000Z',
          NULL
        )
      `,
      [claimToken],
    )

    await expect(
      context.identity.completeOwnerClaimXConnection({
        state: 'state_pending_email',
        code: 'auth-code',
      }),
    ).rejects.toThrow(
      'Confirm the owner email from the claim link before connecting X.',
    )

    await context.pool.end()
  })

  it('requires a connected X account before accepting the verification tweet', async () => {
    enableXPostVerification()
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'tweet_gate_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')

    await context.identity.claimOwnerByClaimToken(claimToken, 'owner@example.com')
    await verifyClaimEmail(context, claimToken)

    await expect(
      context.identity.verifyOwnerByClaimTweet(claimToken, {
        tweetUrl: 'https://x.com/owner/status/1',
      }),
    ).rejects.toThrow(
      'Connect this claim with X before submitting the verification tweet.',
    )

    await context.pool.end()
  })

  it('rejects claim-email verification links for verified or already-advanced claims', async () => {
    const context = await setupApiContext()
    await expect(
      context.identity.createClaimOwnerEmailVerificationLink('missing_claim'),
    ).rejects.toThrow('Claim not found.')

    const unclaimedChallenge = await context.identity.createCaptchaChallenge()
    const unclaimedRegistration = await context.identity.registerAgent(
      registrationInput(
        unclaimedChallenge.id,
        'unclaimed_mail_link_bot',
        unclaimedChallenge.prompt,
      ),
    )
    const unclaimedClaimToken = unclaimedRegistration.agent.claimUrl.replace(
      '/?claim=',
      '',
    )

    await expect(
      context.identity.createClaimOwnerEmailVerificationLink(unclaimedClaimToken),
    ).rejects.toThrow('Attach an owner email before sending a verification link.')

    const verifiedChallenge = await context.identity.createCaptchaChallenge()
    const verifiedRegistration = await context.identity.registerAgent(
      registrationInput(
        verifiedChallenge.id,
        'verified_mail_link_bot',
        verifiedChallenge.prompt,
      ),
    )
    const verifiedClaimToken = verifiedRegistration.agent.claimUrl.replace(
      '/?claim=',
      '',
    )

    await context.identity.claimOwnerByClaimToken(
      verifiedClaimToken,
      'owner@example.com',
    )
    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_verified_at = '2026-03-16T00:00:00.000Z',
            owner_verification_status = 'verified'
        WHERE id = $1
      `,
      [verifiedRegistration.agent.id],
    )

    await expect(
      context.identity.createClaimOwnerEmailVerificationLink(verifiedClaimToken),
    ).rejects.toThrow('This claim is already verified.')

    const advancedChallenge = await context.identity.createCaptchaChallenge()
    const advancedRegistration = await context.identity.registerAgent(
      registrationInput(
        advancedChallenge.id,
        'advanced_mail_link_bot',
        advancedChallenge.prompt,
      ),
    )
    const advancedClaimToken = advancedRegistration.agent.claimUrl.replace(
      '/?claim=',
      '',
    )

    await context.identity.claimOwnerByClaimToken(
      advancedClaimToken,
      'owner@example.com',
    )
    await verifyClaimEmail(context, advancedClaimToken)

    await expect(
      context.identity.createClaimOwnerEmailVerificationLink(advancedClaimToken),
    ).rejects.toThrow('This claim is past the owner-email verification step already.')

    await context.pool.end()
  })

  it('preserves verified and pending-tweet status when an agent pre-attaches the same owner email again', async () => {
    const context = await setupApiContext()
    const verifiedChallenge = await context.identity.createCaptchaChallenge()
    const verifiedRegistration = await context.identity.registerAgent(
      registrationInput(
        verifiedChallenge.id,
        'verified_setup_owner_bot',
        verifiedChallenge.prompt,
      ),
    )

    await context.identity.setupOwnerEmail(
      verifiedRegistration.apiKey,
      'owner@example.com',
    )
    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_verified_at = '2026-03-16T00:00:00.000Z',
            owner_verification_status = 'verified'
        WHERE id = $1
      `,
      [verifiedRegistration.agent.id],
    )

    await expect(
      context.identity.setupOwnerEmail(
        verifiedRegistration.apiKey,
        'owner@example.com',
      ),
    ).resolves.toMatchObject({
      agent: {
        ownerEmail: 'owner@example.com',
        ownerVerificationStatus: 'verified',
      },
    })

    const pendingTweetChallenge = await context.identity.createCaptchaChallenge()
    const pendingTweetRegistration = await context.identity.registerAgent(
      registrationInput(
        pendingTweetChallenge.id,
        'pending_tweet_setup_owner_bot',
        pendingTweetChallenge.prompt,
      ),
    )

    await context.identity.setupOwnerEmail(
      pendingTweetRegistration.apiKey,
      'owner@example.com',
    )
    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_verification_status = 'pending_tweet'
        WHERE id = $1
      `,
      [pendingTweetRegistration.agent.id],
    )

    await expect(
      context.identity.setupOwnerEmail(
        pendingTweetRegistration.apiKey,
        'owner@example.com',
      ),
    ).resolves.toMatchObject({
      agent: {
        ownerEmail: 'owner@example.com',
        ownerVerificationStatus: 'pending_tweet',
      },
    })

    await context.pool.end()
  })

  it('rejects a fresh claim-email verification link request when the pending claim has expired and deletes it', async () => {
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'expired_mail_link_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')

    await context.identity.claimOwnerByClaimToken(claimToken, 'owner@example.com')
    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_verification_started_at = '2026-03-15T00:00:00.000Z',
            updated_at = '2026-03-15T00:00:00.000Z'
        WHERE id = $1
      `,
      [registration.agent.id],
    )

    await expect(
      context.identity.createClaimOwnerEmailVerificationLink(claimToken),
    ).rejects.toThrow('Claim not found.')
    expect(
      await context.pool.query(
        `SELECT COUNT(*)::int AS count FROM agent_accounts WHERE id = $1`,
        [registration.agent.id],
      ),
    ).toMatchObject({ rows: [{ count: 0 }] })

    await context.pool.end()
  })

  it('accepts normalized captcha answers with integer and whitespace formatting', async () => {
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const solved = solveCaptcha(challenge.prompt)
    const normalizedNumeric = String(Number(solved))

    const registration = await context.identity.registerAgent({
      ...registrationInput(challenge.id, 'normalized_bot', challenge.prompt),
      captchaAnswer: `  ${normalizedNumeric}  `,
    })

    expect(registration.agent.handle).toBe('normalized_bot')
    expect(registration.agent.ownerVerificationStatus).toBe('unclaimed')

    await context.pool.end()
  })

  it('reclaims stale unclaimed handles and evicts the expired api key', async () => {
    const context = await setupApiContext()
    const firstChallenge = await context.identity.createCaptchaChallenge()
    const firstRegistration = await context.identity.registerAgent(
      registrationInput(
        firstChallenge.id,
        'reclaim_bot',
        firstChallenge.prompt,
      ),
    )

    await context.pool.query(
      `
        UPDATE agent_accounts
        SET created_at = '2026-03-15T00:00:00.000Z',
            updated_at = '2026-03-15T00:00:00.000Z'
        WHERE id = $1
      `,
      [firstRegistration.agent.id],
    )

    const secondChallenge = await context.identity.createCaptchaChallenge()
    const secondRegistration = await context.identity.registerAgent(
      registrationInput(
        secondChallenge.id,
        'reclaim_bot',
        secondChallenge.prompt,
      ),
    )

    expect(secondRegistration.agent.id).not.toBe(firstRegistration.agent.id)
    expect(
      await context.identity.authenticateAgentApiKey(firstRegistration.apiKey),
    ).toBeNull()
    expect(
      await context.pool.query(
        `SELECT COUNT(*)::int AS count FROM agent_accounts WHERE handle = 'reclaim_bot'`,
      ),
    ).toMatchObject({
      rows: [{ count: 1 }],
    })

    await context.pool.end()
  })

  it('expires stale pending claims and removes their claim view', async () => {
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'pending_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')

    await context.identity.claimOwnerByClaimToken(claimToken, 'owner@example.com')
    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_verification_started_at = '2026-03-15T00:00:00.000Z',
            updated_at = '2026-03-15T00:00:00.000Z'
        WHERE id = $1
      `,
      [registration.agent.id],
    )

    expect(await context.identity.readClaimView(claimToken)).toBeNull()
    await expect(
      context.identity.claimOwnerByClaimToken(claimToken, 'owner@example.com'),
    ).rejects.toThrow('Claim not found.')
    expect(
      await context.identity.authenticateAgentApiKey(registration.apiKey),
    ).toBeNull()

    await context.pool.end()
  })

  it('expires stale pending claims by falling back to updated_at when started_at is missing', async () => {
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'pending_updated_at_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')

    await context.identity.claimOwnerByClaimToken(claimToken, 'owner@example.com')
    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_verification_started_at = NULL,
            updated_at = '2026-03-15T00:00:00.000Z'
        WHERE id = $1
      `,
      [registration.agent.id],
    )

    expect(await context.identity.readClaimView(claimToken)).toBeNull()
    await expect(
      context.identity.claimOwnerByClaimToken(claimToken, 'owner@example.com'),
    ).rejects.toThrow('Claim not found.')

    await context.pool.end()
  })

  it('rejects owner-email attach on an expired unclaimed registration and deletes it', async () => {
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'expired_claim_attach_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')

    await context.pool.query(
      `
        UPDATE agent_accounts
        SET created_at = '2026-03-15T00:00:00.000Z',
            updated_at = '2026-03-15T00:00:00.000Z'
        WHERE id = $1
      `,
      [registration.agent.id],
    )

    await expect(
      context.identity.claimOwnerByClaimToken(claimToken, 'owner@example.com'),
    ).rejects.toThrow('Claim not found.')
    expect(
      await context.pool.query(
        `SELECT COUNT(*)::int AS count FROM agent_accounts WHERE id = $1`,
        [registration.agent.id],
      ),
    ).toMatchObject({ rows: [{ count: 0 }] })

    await context.pool.end()
  })

  it('rejects tweet verification on an expired pending claim and deletes the stale agent', async () => {
    enableXPostVerification()
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'expired_tweet_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')

    await context.identity.claimOwnerByClaimToken(claimToken, 'owner@example.com')
    await connectClaimX(context, registration.agent.id)
    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_verification_started_at = '2026-03-15T00:00:00.000Z',
            updated_at = '2026-03-15T00:00:00.000Z'
        WHERE id = $1
      `,
      [registration.agent.id],
    )

    await expect(
      context.identity.verifyOwnerByClaimTweet(claimToken, {
        tweetUrl: 'https://x.com/owner/status/1',
      }),
    ).rejects.toThrow('Claim not found.')
    expect(
      await context.pool.query(
        `SELECT COUNT(*)::int AS count FROM agent_accounts WHERE id = $1`,
        [registration.agent.id],
      ),
    ).toMatchObject({ rows: [{ count: 0 }] })

    await context.pool.end()
  })

  it('evicts expired unverified agents on api-key authentication', async () => {
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'expired_auth_bot', challenge.prompt),
    )

    await context.pool.query(
      `
        UPDATE agent_accounts
        SET created_at = '2026-03-15T00:00:00.000Z',
            updated_at = '2026-03-15T00:00:00.000Z'
        WHERE id = $1
      `,
      [registration.agent.id],
    )

    expect(
      await context.identity.authenticateAgentApiKey(registration.apiKey),
    ).toBeNull()
    expect(
      await context.pool.query(
        `SELECT COUNT(*)::int AS count FROM agent_accounts WHERE id = $1`,
        [registration.agent.id],
      ),
    ).toMatchObject({ rows: [{ count: 0 }] })

    await context.pool.end()
  })

  it('rejects owner email setup on an expired unverified registration and deletes it', async () => {
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'expired_setup_bot', challenge.prompt),
    )

    await context.pool.query(
      `
        UPDATE agent_accounts
        SET created_at = '2026-03-15T00:00:00.000Z',
            updated_at = '2026-03-15T00:00:00.000Z'
        WHERE id = $1
      `,
      [registration.agent.id],
    )

    await expect(
      context.identity.setupOwnerEmail(registration.apiKey, 'owner@example.com'),
    ).rejects.toThrow(
      'This agent registration expired. Register the agent again.',
    )
    expect(
      await context.pool.query(
        `SELECT COUNT(*)::int AS count FROM agent_accounts WHERE id = $1`,
        [registration.agent.id],
      ),
    ).toMatchObject({ rows: [{ count: 0 }] })

    await context.pool.end()
  })

  it('purges expired auth artifacts and stale unverified agent records', async () => {
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'cleanup_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')
    const marketId = (
      await context.pool.query<{ id: string }>(
        `SELECT id FROM markets ORDER BY created_at ASC LIMIT 1`,
      )
    ).rows[0]!.id

    await context.pool.query(
      `
        UPDATE agent_accounts
        SET created_at = '2026-03-15T00:00:00.000Z',
            updated_at = '2026-03-15T00:00:00.000Z'
        WHERE id = $1
      `,
      [registration.agent.id],
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
        VALUES (
          'bet_cleanup',
          $1,
          $2,
          5,
          'against',
          'open',
          1.50,
          0,
          7.5,
          NULL,
          '2026-03-15T00:00:00.000Z',
          NULL
        )
      `,
      [registration.agent.id, marketId],
    )
    await context.pool.query(
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
        VALUES (
          'notification_cleanup',
          $1,
          $2,
          'bet_cleanup',
          'system',
          'Cleanup',
          'Cleanup artifact.',
          '2026-03-15T00:00:00.000Z',
          NULL
        )
      `,
      [registration.agent.id, marketId],
    )
    await context.pool.query(
      `
        INSERT INTO market_discussion_posts (
          id,
          market_id,
          author_agent_id,
          parent_id,
          author_handle,
          author_display_name,
          author_model_provider,
          body,
          created_at,
          updated_at
        )
        VALUES (
          'discussion_cleanup',
          $2,
          $1,
          NULL,
          'cleanup_bot',
          'Cleanup Bot',
          'OpenAI',
          'Stale unverified discussion artifact.',
          '2026-03-15T00:00:00.000Z',
          '2026-03-15T00:00:00.000Z'
        )
      `,
      [registration.agent.id, marketId],
    )
    await context.pool.query(
      `
        INSERT INTO owner_sessions (
          token,
          owner_email,
          created_at,
          expires_at,
          last_seen_at
        )
        VALUES (
          'owner_cleanup',
          'cleanup@example.com',
          '2026-03-15T00:00:00.000Z',
          '2026-03-15T00:00:00.000Z',
          '2026-03-15T00:00:00.000Z'
        )
      `,
    )
    await context.pool.query(
      `
        INSERT INTO owner_verification_x_states (
          state,
          claim_token,
          code_verifier,
          created_at,
          expires_at,
          consumed_at
        )
        VALUES (
          'xstate_cleanup',
          $1,
          'verifier',
          '2026-03-15T00:00:00.000Z',
          '2026-03-15T00:00:00.000Z',
          NULL
        )
      `,
      [claimToken],
    )
    await context.pool.query(
      `
        UPDATE captcha_challenges
        SET expires_at = '2026-03-15T00:00:00.000Z'
        WHERE id = $1
      `,
      [challenge.id],
    )

    const cleanup = await context.identity.cleanupExpiredIdentityState(
      new Date('2026-03-19T00:00:00.000Z'),
    )

    expect(cleanup.expiredCaptchasDeleted).toBeGreaterThanOrEqual(1)
    expect(cleanup.expiredOwnerSessionsDeleted).toBeGreaterThanOrEqual(1)
    expect(cleanup.expiredOwnerXStatesDeleted).toBeGreaterThanOrEqual(1)
    expect(cleanup.staleAgentAccountsDeleted).toBe(1)
    expect(cleanup.staleBetsDeleted).toBe(1)
    expect(cleanup.staleNotificationsDeleted).toBe(1)
    expect(cleanup.staleDiscussionPostsDeleted).toBe(1)
    expect(
      await context.pool.query(
        `SELECT COUNT(*)::int AS count FROM agent_accounts WHERE id = $1`,
        [registration.agent.id],
      ),
    ).toMatchObject({ rows: [{ count: 0 }] })

    await context.pool.end()
  })

  it('builds owner sessions and ranks the hall of fame with contribution karma kept separate from credits', async () => {
    enableXPostVerification()
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
    const alphaClaimView = await context.identity.claimOwnerByClaimToken(
      alphaClaimToken,
      'owner@example.com',
    )
    expect(alphaClaimView.agent.ownerEmail).toBe('owner@example.com')
    expect(alphaClaimView.agent.ownerVerificationStatus).toBe('pending_email')
    expect(alphaClaimView.agent.ownerVerificationCode).toMatch(
      /^[a-z]+-[A-Z0-9]{4}$/,
    )
    expect(
      await context.identity.authenticateAgentApiKey(alpha.apiKey),
    ).toMatchObject({
      availableCredits: 0,
      promoCredits: 0,
      earnedCredits: 0,
    })
    const relinkedClaimView = await context.identity.claimOwnerByClaimToken(
      alphaClaimToken,
      'owner@example.com',
    )
    expect(relinkedClaimView.agent.ownerEmail).toBe('owner@example.com')
    expect(relinkedClaimView.agent.ownerVerificationStatus).toBe('pending_email')
    await context.identity.setupOwnerEmail(bravo.apiKey, 'owner@example.com')
    await expect(
      context.identity.createOwnerLoginLink('owner@example.com'),
    ).rejects.toThrow(
      'Finish the claim verification steps from your claim link before opening the owner deck.',
    )
    await verifyClaimEmail(context, alphaClaimToken)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        createTweetLookupResponse({
          tweetId: '1',
          authorId: 'x-user-1',
          username: 'owner',
          text: `Claiming @alpha_bot on LemonSuk. Human verification code: ${alphaClaimView.agent.ownerVerificationCode}`,
        }),
      ),
    )
    await connectClaimX(context, alpha.agent.id)
    await context.identity.verifyOwnerByClaimTweet(alphaClaimToken, {
      tweetUrl: 'https://x.com/owner/status/1',
    })
    const agentDirectoryStats = await context.identity.readAgentDirectoryStats()
    expect(agentDirectoryStats).toEqual({
      registeredAgents: 2,
      humanVerifiedAgents: 1,
    })
    const bravoClaimToken = bravo.agent.claimUrl.replace('/?claim=', '')
    const bravoClaimView = await context.identity.readClaimView(bravoClaimToken)
    await verifyClaimEmail(context, bravoClaimToken)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        createTweetLookupResponse({
          tweetId: '2',
          authorId: 'x-user-2',
          username: 'owner_two',
          text: `Claiming @bravo_bot on LemonSuk. Human verification code: ${bravoClaimView?.agent.ownerVerificationCode}`,
        }),
      ),
    )
    await connectClaimX(context, bravo.agent.id, 'owner_two', 'x-user-2')
    await context.identity.verifyOwnerByClaimTweet(bravoClaimToken, {
      tweetUrl: 'https://x.com/owner_two/status/2',
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

    vi.unstubAllGlobals()
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

  it('returns a public agent profile with recent activity, ranks, and hidden discussion masking', async () => {
    enableXPostVerification()
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'public_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')
    const claimView = await context.identity.claimOwnerByClaimToken(
      claimToken,
      'owner@example.com',
    )

    await verifyClaimEmail(context, claimToken)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        createTweetLookupResponse({
          tweetId: '12345',
          authorId: 'x-user-public',
          username: 'owner_public',
          text: `Claiming @public_bot on LemonSuk. Human verification code: ${claimView.agent.ownerVerificationCode}`,
        }),
      ),
    )
    await connectClaimX(context, registration.agent.id, 'owner_public', 'x-user-public')
    await context.identity.verifyOwnerByClaimTweet(claimToken, {
      tweetUrl: 'https://x.com/owner_public/status/12345',
    })

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
          updated_at,
          hidden_at
        )
        VALUES
          (
            'post_public_visible',
            'optimus-customizable-2026',
            NULL,
            $1,
            'public_bot',
            'Agent public_bot',
            'OpenAI',
            'Visible board take.',
            '2026-03-18T00:00:00.000Z',
            '2026-03-18T00:00:00.000Z',
            NULL
          ),
          (
            'post_public_hidden',
            'optimus-customizable-2026',
            NULL,
            $1,
            'public_bot',
            'Agent public_bot',
            'OpenAI',
            'Hidden board take.',
            '2026-03-19T00:00:00.000Z',
            '2026-03-19T00:00:00.000Z',
            '2026-03-19T02:00:00.000Z'
          ),
          (
            'post_public_reply',
            'optimus-customizable-2026',
            'post_public_hidden',
            $1,
            'public_bot',
            'Agent public_bot',
            'OpenAI',
            'Reply on the hidden post.',
            '2026-03-19T01:00:00.000Z',
            '2026-03-19T01:00:00.000Z',
            NULL
          )
      `,
      [registration.agent.id],
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
          'post_public_visible',
          'vote_public_visible',
          1,
          '2026-03-18T01:00:00.000Z',
          '2026-03-18T01:00:00.000Z'
        )
      `,
    )

    await context.store.withStoreTransaction(async (store, persist) => {
      const placed = placeAgainstBetForUser(
        store,
        registration.agent.id,
        'optimus-customizable-2026',
        20,
        new Date('2026-03-16T00:00:00.000Z'),
      )
      await persist(placed.store)
    })
    await context.maintenance.loadMaintainedStore(
      new Date('2027-01-05T00:00:00.000Z'),
    )
    await context.pool.query(
      `
        UPDATE markets
        SET authored_by_agent_id = $1,
            updated_at = '2027-01-05T00:00:00.000Z'
        WHERE id = 'cybercab-volume-2026'
      `,
      [registration.agent.id],
    )

    const profile = await context.identity.readPublicAgentProfile(
      'public_bot',
      new Date('2027-01-05T00:00:00.000Z'),
    )

    expect(profile).toMatchObject({
      agent: {
        handle: 'public_bot',
        ownerVerifiedAt: expect.any(String),
      },
      discussionPosts: 3,
      hallOfFameRank: 1,
      competition: {
        rank: 1,
        seasonId: '2027-Q1',
        seasonResolvedBets: 1,
      },
    })
    expect(profile?.authoredClaims).toBeGreaterThanOrEqual(0)
    expect(profile?.recentMarkets).toEqual([
      expect.objectContaining({
        slug: 'cybercab-volume-2026',
      }),
    ])
    expect(profile?.recentDiscussionPosts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'post_public_hidden',
          hidden: true,
          body: 'This post is hidden after community flags.',
          replyCount: 1,
        }),
        expect.objectContaining({
          id: 'post_public_reply',
          hidden: false,
          body: 'Reply on the hidden post.',
        }),
        expect.objectContaining({
          id: 'post_public_visible',
          hidden: false,
          score: 2,
          body: 'Visible board take.',
        }),
      ]),
    )

    vi.unstubAllGlobals()
    await context.pool.end()
  })

  it('returns null for missing public agent handles and evicts expired registrations from the public directory', async () => {
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'expired_public', challenge.prompt),
    )

    await context.pool.query(
      `
        UPDATE agent_accounts
        SET created_at = '2026-03-15T00:00:00.000Z',
            updated_at = '2026-03-15T00:00:00.000Z'
        WHERE id = $1
      `,
      [registration.agent.id],
    )

    expect(await context.identity.readPublicAgentProfile('missing')).toBeNull()
    expect(
      await context.identity.readPublicAgentProfile(
        'expired_public',
        new Date('2026-03-17T12:00:00.000Z'),
      ),
    ).toBeNull()
    expect(
      await context.identity.readClaimView(
        registration.agent.claimUrl.replace('/?claim=', ''),
      ),
    ).toBeNull()

    await context.pool.end()
  })

  it('returns zeroed public profile stats when an agent has no public activity yet', async () => {
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    await context.identity.registerAgent(
      registrationInput(challenge.id, 'quiet_bot', challenge.prompt),
    )

    const profile = await context.identity.readPublicAgentProfile('quiet_bot')

    expect(profile).toMatchObject({
      agent: {
        handle: 'quiet_bot',
      },
      karma: 0,
      authoredClaims: 0,
      discussionPosts: 0,
      hallOfFameRank: null,
      competition: null,
      recentMarkets: [],
      recentDiscussionPosts: [],
    })

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

  it('handles tweet verification contingencies and allows re-entry after verification', async () => {
    enableXPostVerification()
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'charlie_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')
    const claimView = await context.identity.claimOwnerByClaimToken(
      claimToken,
      'owner@example.com',
    )
    await verifyClaimEmail(context, claimToken)
    await connectClaimX(context, registration.agent.id)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        createTweetLookupResponse({
          tweetId: '10',
          authorId: 'x-user-1',
          username: 'owner',
          text: 'missing code',
        }),
      ),
    )
    await expect(
      context.identity.verifyOwnerByClaimTweet(claimToken, {
        tweetUrl: 'https://x.com/owner/status/10',
      }),
    ).rejects.toThrow(
      'Verification template not found in that public X post. Post the exact template and try again.',
    )

    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_verification_status = 'unclaimed',
            owner_verification_code = NULL
        WHERE id = $1
      `,
      [registration.agent.id],
    )

    await expect(
      context.identity.verifyOwnerByClaimTweet(claimToken, {
        tweetUrl: 'https://x.com/owner/status/11',
      }),
    ).rejects.toThrow('This claim is not waiting on X verification.')

    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_verification_status = 'pending_tweet',
            owner_verification_code = $2
        WHERE id = $1
      `,
      [registration.agent.id, claimView.agent.ownerVerificationCode],
    )

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        createTweetLookupResponse({
          tweetId: '12',
          authorId: 'x-user-1',
          username: 'owner',
          text: `Claiming @charlie_bot on LemonSuk. Human verification code: ${claimView.agent.ownerVerificationCode}`,
        }),
      ),
    )

    const firstLoginLink = await context.identity.verifyOwnerByClaimTweet(
      claimToken,
      {
        tweetUrl: 'https://x.com/owner/status/12',
      },
    )
    expect(firstLoginLink.ownerEmail).toBe('owner@example.com')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('fetch should not run for already verified claims')
      }),
    )

    const secondLoginLink = await context.identity.verifyOwnerByClaimTweet(
      claimToken,
      {
        tweetUrl: 'https://x.com/owner/status/13',
      },
    )
    expect(secondLoginLink.ownerEmail).toBe('owner@example.com')

    await context.pool.end()
  })

  it('accepts tweet verification when X omits the expanded username but the author id matches', async () => {
    enableXPostVerification()
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'username_optional_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')
    const claimView = await context.identity.claimOwnerByClaimToken(
      claimToken,
      'owner@example.com',
    )

    await verifyClaimEmail(context, claimToken)
    await connectClaimX(context, registration.agent.id)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: {
              id: '700',
              author_id: 'x-user-1',
              text: `Claiming @username_optional_bot on LemonSuk. Human verification code: ${claimView.agent.ownerVerificationCode}`,
            },
          }),
          { status: 200 },
        ),
      ),
    )

    const ownerLoginLink = await context.identity.verifyOwnerByClaimTweet(claimToken, {
      tweetUrl: 'https://x.com/owner/status/700',
    })
    const verifiedClaim = await context.identity.readClaimView(claimToken)

    expect(ownerLoginLink.ownerEmail).toBe('owner@example.com')
    expect(verifiedClaim?.agent.ownerVerificationStatus).toBe('verified')
    expect(verifiedClaim?.agent.ownerVerificationTweetUrl).toBe(
      'https://x.com/owner/status/700',
    )

    await context.pool.end()
  })

  it('validates captcha edge cases and tweet verification input requirements', async () => {
    enableXPostVerification()
    const context = await setupApiContext()

    const overflowChallenge = await context.identity.createCaptchaChallenge()
    await expect(
      context.identity.registerAgent({
        ...registrationInput(
          overflowChallenge.id,
          'overflow_bot',
          overflowChallenge.prompt,
        ),
        captchaAnswer: '9'.repeat(400),
      }),
    ).rejects.toThrow('Captcha answer did not match the challenge.')

    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'delta_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')

    await expect(
      context.identity.verifyOwnerByClaimTweet('claim_missing', {
        tweetUrl: 'https://x.com/owner/status/1',
      }),
    ).rejects.toThrow('Claim not found.')

    await expect(
      context.identity.verifyOwnerByClaimTweet(claimToken, {
        tweetUrl: 'https://x.com/owner/status/1',
      }),
    ).rejects.toThrow(
      'Attach an owner email before finishing X verification.',
    )

    await context.identity.claimOwnerByClaimToken(claimToken, 'owner@example.com')
    await expect(
      context.identity.verifyOwnerByClaimTweet(claimToken, {
        tweetUrl: 'https://x.com/owner/status/1',
      }),
    ).rejects.toThrow(
      'Confirm the owner email from the claim link before finishing X verification.',
    )
    await verifyClaimEmail(context, claimToken)
    await connectClaimX(context, registration.agent.id)

    await expect(
      context.identity.verifyOwnerByClaimTweet(claimToken, {
        xHandle: '   ',
        tweetUrl: 'https://x.com/owner/status/1',
      }),
    ).rejects.toThrow('X handle is required.')

    await expect(
      context.identity.verifyOwnerByClaimTweet(claimToken, {
        xHandle: 'other',
        tweetUrl: 'https://x.com/owner/status/1',
      }),
    ).rejects.toThrow(
      'Tweet URL and connected X account must point to the same handle.',
    )

    await expect(
      context.identity.verifyOwnerByClaimTweet(claimToken, {
        xHandle: 'not valid!',
        tweetUrl: 'https://x.com/owner/status/1',
      }),
    ).rejects.toThrow('Enter a valid X handle.')

    await expect(
      context.identity.verifyOwnerByClaimTweet(claimToken, {
        tweetUrl: 'not-a-url',
      }),
    ).rejects.toThrow('Tweet URL must be a valid public X status link.')

    await expect(
      context.identity.verifyOwnerByClaimTweet(claimToken, {
        tweetUrl: 'https://example.com/owner/status/1',
      }),
    ).rejects.toThrow('Tweet URL must point to x.com or twitter.com.')

    await expect(
      context.identity.verifyOwnerByClaimTweet(claimToken, {
        tweetUrl: 'https://x.com/owner/post/1',
      }),
    ).rejects.toThrow('Tweet URL must look like x.com/<handle>/status/<id>.')

    await expect(
      context.identity.verifyOwnerByClaimTweet(claimToken, {
        xHandle: '@owner',
        tweetUrl: 'https://x.com/other/status/1',
      }),
    ).rejects.toThrow(
      'Tweet URL and connected X account must point to the same handle.',
    )

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('missing', { status: 404 })),
    )

    await expect(
      context.identity.verifyOwnerByClaimTweet(claimToken, {
        tweetUrl: 'https://x.com/owner/status/1',
      }),
    ).rejects.toThrow('Could not verify that public X post through the X API.')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        createTweetLookupResponse({
          tweetId: '1',
          authorId: 'wrong-x-user',
          username: 'owner',
          text: `Claiming @delta_bot on LemonSuk. Human verification code: ${registration.agent.ownerVerificationCode}`,
        }),
      ),
    )

    await expect(
      context.identity.verifyOwnerByClaimTweet(claimToken, {
        tweetUrl: 'https://x.com/owner/status/1',
      }),
    ).rejects.toThrow('Tweet author and connected X account did not match.')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        createTweetLookupResponse({
          tweetId: '1',
          authorId: 'x-user-1',
          username: 'differentowner',
          text: `Claiming @delta_bot on LemonSuk. Human verification code: ${registration.agent.ownerVerificationCode}`,
        }),
      ),
    )

    await expect(
      context.identity.verifyOwnerByClaimTweet(claimToken, {
        xHandle: 'owner',
        tweetUrl: 'https://x.com/owner/status/1',
      }),
    ).rejects.toThrow('Tweet author and connected X account did not match.')

    const claimView = await context.identity.readClaimView(claimToken)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        createTweetLookupResponse({
          tweetId: '2',
          authorId: 'x-user-1',
          username: 'owner',
          text: `Claiming @delta_bot on LemonSuk. Human verification code: ${claimView?.agent.ownerVerificationCode}`,
        }),
      ),
    )

    await context.identity.verifyOwnerByClaimTweet(claimToken, {
      tweetUrl: 'https://x.com/owner/status/2',
    })

    const verifiedClaimView = await context.identity.readClaimView(claimToken)
    expect(verifiedClaimView?.agent.ownerVerificationStatus).toBe('verified')
    expect(verifiedClaimView?.claimInstructions).toContain(
      'already has a human owner verified through the claim flow',
    )
    expect(verifiedClaimView?.tweetVerificationInstructions).toBeNull()

    await context.pool.end()
  })

  it('fails loudly when X post lookup is not configured for tweet verification', async () => {
    delete process.env.X_BEARER_TOKEN
    delete process.env.TWITTER_BEARER_TOKEN
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'kappa_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')

    await context.identity.claimOwnerByClaimToken(claimToken, 'owner@example.com')
    await verifyClaimEmail(context, claimToken)
    await connectClaimX(context, registration.agent.id)

    await expect(
      context.identity.verifyOwnerByClaimTweet(claimToken, {
        tweetUrl: 'https://x.com/owner/status/1',
      }),
    ).rejects.toThrow('X post verification is not configured right now.')

    await context.pool.end()
  })

  it('rejects incomplete X tweet payloads during claim tweet verification', async () => {
    enableXPostVerification()
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'tweet_payload_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')

    await context.identity.claimOwnerByClaimToken(claimToken, 'owner@example.com')
    await verifyClaimEmail(context, claimToken)
    await connectClaimX(context, registration.agent.id)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: {
              id: '123',
              text: '  ',
              author_id: 'x-user-1',
            },
          }),
          { status: 200 },
        ),
      ),
    )

    await expect(
      context.identity.verifyOwnerByClaimTweet(claimToken, {
        tweetUrl: 'https://x.com/owner/status/123',
      }),
    ).rejects.toThrow('X API tweet payload was incomplete.')

    await context.pool.end()
  })

  it('accepts canonical twitter.com verification URLs and strips tracking fragments', async () => {
    enableXPostVerification()
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'juliet_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')
    const claimView = await context.identity.claimOwnerByClaimToken(
      claimToken,
      'owner@example.com',
    )
    await verifyClaimEmail(context, claimToken)
    await connectClaimX(context, registration.agent.id)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        createTweetLookupResponse({
          tweetId: '77',
          authorId: 'x-user-1',
          username: 'owner',
          text: `\n  CLAIMING @JULIET_BOT ON LEMONSUK.\n  HUMAN VERIFICATION CODE: ${claimView.agent.ownerVerificationCode}\n`,
        }),
      ),
    )

    const loginLink = await context.identity.verifyOwnerByClaimTweet(claimToken, {
      tweetUrl: 'https://twitter.com/owner/status/77?s=20&t=test#fragment',
    })
    expect(loginLink.ownerEmail).toBe('owner@example.com')

    const verifiedClaimView = await context.identity.readClaimView(claimToken)
    expect(verifiedClaimView?.agent.ownerVerificationStatus).toBe('verified')
    expect(verifiedClaimView?.agent.ownerVerificationTweetUrl).toBe(
      'https://twitter.com/owner/status/77',
    )

    await context.pool.end()
  })

  it('rejects X connection completion when the claim no longer exists or has no owner email', async () => {
    process.env.X_CLIENT_ID = 'x-client-id'
    process.env.X_CLIENT_SECRET = 'x-client-secret'
    const context = await setupApiContext()

    const now = '2026-03-16T00:00:00.000Z'

    await context.pool.query(
      `
        INSERT INTO owner_verification_x_states (
          state,
          claim_token,
          code_verifier,
          created_at,
          expires_at,
          consumed_at
        )
        VALUES ($1, $2, $3, $4, $5, NULL)
      `,
      [
        'state-missing-claim',
        'claim_missing',
        'code-verifier',
        now,
        '2099-03-16T01:00:00.000Z',
      ],
    )

    await expect(
      context.identity.completeOwnerClaimXConnection({
        state: 'state-missing-claim',
        code: 'auth-code',
      }),
    ).rejects.toThrow('Claim not found.')

    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'echo_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')

    await context.pool.query(
      `
        INSERT INTO owner_verification_x_states (
          state,
          claim_token,
          code_verifier,
          created_at,
          expires_at,
          consumed_at
        )
        VALUES ($1, $2, $3, $4, $5, NULL)
      `,
      [
        'state-missing-owner',
        claimToken,
        'code-verifier',
        now,
        '2099-03-16T01:00:00.000Z',
      ],
    )

    await expect(
      context.identity.completeOwnerClaimXConnection({
        state: 'state-missing-owner',
        code: 'auth-code',
      }),
    ).rejects.toThrow('Attach an owner email before connecting X.')

    const expiredChallenge = await context.identity.createCaptchaChallenge()
    const expiredRegistration = await context.identity.registerAgent(
      registrationInput(
        expiredChallenge.id,
        'expired_connect_bot',
        expiredChallenge.prompt,
      ),
    )
    const expiredClaimToken = expiredRegistration.agent.claimUrl.replace('/?claim=', '')
    await context.identity.claimOwnerByClaimToken(
      expiredClaimToken,
      'owner@example.com',
    )
    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_verification_started_at = '2026-03-15T00:00:00.000Z',
            updated_at = '2026-03-15T00:00:00.000Z'
        WHERE id = $1
      `,
      [expiredRegistration.agent.id],
    )
    await context.pool.query(
      `
        INSERT INTO owner_verification_x_states (
          state,
          claim_token,
          code_verifier,
          created_at,
          expires_at,
          consumed_at
        )
        VALUES ($1, $2, $3, $4, $5, NULL)
      `,
      [
        'state-expired-claim',
        expiredClaimToken,
        'code-verifier',
        now,
        '2099-03-16T01:00:00.000Z',
      ],
    )

    await expect(
      context.identity.completeOwnerClaimXConnection({
        state: 'state-expired-claim',
        code: 'auth-code',
      }),
    ).rejects.toThrow('Claim not found.')
    expect(
      await context.pool.query(
        `SELECT COUNT(*)::int AS count FROM agent_accounts WHERE id = $1`,
        [expiredRegistration.agent.id],
      ),
    ).toMatchObject({ rows: [{ count: 0 }] })

    await context.pool.end()
  })

  it('rejects X connect-url creation when the claim is no longer waiting on X verification and rejects expired X states', async () => {
    process.env.X_CLIENT_ID = 'x-client-id'
    process.env.X_CLIENT_SECRET = 'x-client-secret'
    const context = await setupApiContext()

    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'foxtrot_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')

    await expect(
      context.identity.createOwnerClaimXConnectUrl(claimToken),
    ).rejects.toThrow('Attach an owner email before connecting X.')

    const claimView = await context.identity.claimOwnerByClaimToken(
      claimToken,
      'owner@example.com',
    )
    await verifyClaimEmail(context, claimToken)

    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_verification_code = NULL
        WHERE id = $1
      `,
      [registration.agent.id],
    )

    await expect(
      context.identity.createOwnerClaimXConnectUrl(claimToken),
    ).rejects.toThrow('This claim is not waiting on X verification.')

    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_verification_code = $2
        WHERE id = $1
      `,
      [registration.agent.id, claimView.agent.ownerVerificationCode],
    )

    await context.pool.query(
      `
        INSERT INTO owner_verification_x_states (
          state,
          claim_token,
          code_verifier,
          created_at,
          expires_at,
          consumed_at
        )
        VALUES ($1, $2, $3, $4, $5, NULL)
      `,
      [
        'expired-state',
        claimToken,
        'code-verifier',
        '2026-03-16T00:00:00.000Z',
        '2000-01-01T00:00:00.000Z',
      ],
    )

    await expect(
      context.identity.completeOwnerClaimXConnection({
        state: 'expired-state',
        code: 'auth-code',
      }),
    ).rejects.toThrow(
      'That X verification session has expired. Start again from the claim link.',
    )

    const expiredClaimChallenge = await context.identity.createCaptchaChallenge()
    const expiredClaimRegistration = await context.identity.registerAgent(
      registrationInput(
        expiredClaimChallenge.id,
        'stale_xconnect_bot',
        expiredClaimChallenge.prompt,
      ),
    )
    const expiredClaimToken = expiredClaimRegistration.agent.claimUrl.replace(
      '/?claim=',
      '',
    )
    await context.identity.claimOwnerByClaimToken(
      expiredClaimToken,
      'owner@example.com',
    )
    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_verification_started_at = '2026-03-15T00:00:00.000Z',
            updated_at = '2026-03-15T00:00:00.000Z'
        WHERE id = $1
      `,
      [expiredClaimRegistration.agent.id],
    )

    await expect(
      context.identity.createOwnerClaimXConnectUrl(expiredClaimToken),
    ).rejects.toThrow('Claim not found.')
    expect(
      await context.pool.query(
        `SELECT COUNT(*)::int AS count FROM agent_accounts WHERE id = $1`,
        [expiredClaimRegistration.agent.id],
      ),
    ).toMatchObject({ rows: [{ count: 0 }] })

    await context.pool.end()
  })

  it('returns a claim redirect for already-verified owners and rejects missing X-connect claims', async () => {
    process.env.X_CLIENT_ID = 'x-client-id'
    process.env.X_CLIENT_SECRET = 'x-client-secret'
    enableXPostVerification()
    const context = await setupApiContext()

    await expect(
      context.identity.createOwnerClaimXConnectUrl('claim_missing'),
    ).rejects.toThrow('Claim not found.')

    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'golf_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')
    const claimView = await context.identity.claimOwnerByClaimToken(
      claimToken,
      'owner@example.com',
    )
    await verifyClaimEmail(context, claimToken)
    await connectClaimX(context, registration.agent.id)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        createTweetLookupResponse({
          tweetId: '99',
          authorId: 'x-user-1',
          username: 'owner',
          text: `Claiming @golf_bot on LemonSuk. Human verification code: ${claimView.agent.ownerVerificationCode}`,
        }),
      ),
    )

    await context.identity.verifyOwnerByClaimTweet(claimToken, {
      tweetUrl: 'https://x.com/owner/status/99',
    })

    await expect(
      context.identity.createOwnerClaimXConnectUrl(claimToken),
    ).resolves.toBe(`http://localhost:5173/?claim=${claimToken}`)

    await context.pool.end()
  })

  it('rejects incomplete X-user payloads and keeps subtract captcha prompts ordered after swapping', async () => {
    process.env.X_CLIENT_ID = 'x-client-id'
    process.env.X_CLIENT_SECRET = 'x-client-secret'
    const context = await setupApiContext()

    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'hotel_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')
    await context.identity.claimOwnerByClaimToken(claimToken, 'owner@example.com')
    await verifyClaimEmail(context, claimToken)

    const authorizeUrl = await context.identity.createOwnerClaimXConnectUrl(
      claimToken,
    )
    const state = new URL(authorizeUrl).searchParams.get('state')
    if (!state) {
      throw new Error('Expected X state in authorize URL.')
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          input instanceof URL
            ? input.toString()
            : input instanceof Request
              ? input.url
              : input
        if (url.includes('/oauth2/token')) {
          return new Response(
            JSON.stringify({
              access_token: 'x-access-token',
              token_type: 'bearer',
            }),
            { status: 200 },
          )
        }

        return new Response(
          JSON.stringify({
            data: {
              id: 'x-user-1',
            },
          }),
          { status: 200 },
        )
      }),
    )

    await expect(
      context.identity.completeOwnerClaimXConnection({
        state,
        code: 'auth-code',
      }),
    ).rejects.toThrow('Connected X account payload was incomplete.')

    const randomSpy = vi
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.3)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99)

    const subtractChallenge = await context.identity.createCaptchaChallenge()
    expect(subtractChallenge.prompt.match(/\d+/g)?.slice(0, 2)).toEqual([
      '10',
      '6',
    ])
    randomSpy.mockRestore()

    await context.pool.end()
  })

  it('maps X token-exchange and connected-user fetch failures', async () => {
    process.env.X_CLIENT_ID = 'x-client-id'
    process.env.X_CLIENT_SECRET = 'x-client-secret'
    const context = await setupApiContext()

    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'india_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')
    await context.identity.claimOwnerByClaimToken(claimToken, 'owner@example.com')
    await verifyClaimEmail(context, claimToken)

    const firstAuthorizeUrl = await context.identity.createOwnerClaimXConnectUrl(
      claimToken,
    )
    const firstState = new URL(firstAuthorizeUrl).searchParams.get('state')
    if (!firstState) {
      throw new Error('Expected first X state in authorize URL.')
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 401 })),
    )

    await expect(
      context.identity.completeOwnerClaimXConnection({
        state: firstState,
        code: 'auth-code',
      }),
    ).rejects.toThrow('Could not complete X authorization.')

    const secondAuthorizeUrl = await context.identity.createOwnerClaimXConnectUrl(
      claimToken,
    )
    const secondState = new URL(secondAuthorizeUrl).searchParams.get('state')
    if (!secondState) {
      throw new Error('Expected second X state in authorize URL.')
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          input instanceof URL
            ? input.toString()
            : input instanceof Request
              ? input.url
              : input
        if (url.includes('/oauth2/token')) {
          return new Response(
            JSON.stringify({
              access_token: 'x-access-token',
              token_type: 'bearer',
            }),
            { status: 200 },
          )
        }

        return new Response('nope', { status: 403 })
      }),
    )

    await expect(
      context.identity.completeOwnerClaimXConnection({
        state: secondState,
        code: 'auth-code',
      }),
    ).rejects.toThrow('Could not read the connected X account.')

    await context.pool.end()
  })

  it('rethrows non-constraint update failures during X connection completion', async () => {
    process.env.X_CLIENT_ID = 'x-client-id'
    process.env.X_CLIENT_SECRET = 'x-client-secret'
    const context = await setupApiContext()

    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'juliet_fail_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')
    await context.identity.claimOwnerByClaimToken(claimToken, 'owner@example.com')
    await verifyClaimEmail(context, claimToken)

    const authorizeUrl = await context.identity.createOwnerClaimXConnectUrl(
      claimToken,
    )
    const state = new URL(authorizeUrl).searchParams.get('state')
    if (!state) {
      throw new Error('Expected X state in authorize URL.')
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          input instanceof URL
            ? input.toString()
            : input instanceof Request
              ? input.url
              : input
        if (url.includes('/oauth2/token')) {
          return new Response(
            JSON.stringify({
              access_token: 'x-access-token',
              token_type: 'bearer',
            }),
            { status: 200 },
          )
        }

        return new Response(
          JSON.stringify({
            data: {
              id: 'x-user-1',
              username: 'owner',
            },
          }),
          { status: 200 },
        )
      }),
    )

    const originalConnect = context.pool.connect.bind(context.pool)
    const connectSpy = vi
      .spyOn(context.pool, 'connect')
      .mockImplementation(async () => {
        const client = await originalConnect()
        const originalQuery = client.query.bind(client)
        let injected = false

        client.query = (async (...args: Parameters<typeof originalQuery>) => {
          const [text] = args
          if (
            !injected &&
            typeof text === 'string' &&
            text.includes('UPDATE agent_accounts') &&
            text.includes('owner_verification_x_user_id')
          ) {
            injected = true
            throw new Error('simulated x update failure')
          }

          return originalQuery(...args)
        }) as typeof client.query

        return client
      })

    await expect(
      context.identity.completeOwnerClaimXConnection({
        state,
        code: 'auth-code',
      }),
    ).rejects.toThrow('simulated x update failure')

    connectSpy.mockRestore()
    await context.pool.end()
  })

  it('maps raced X-owner uniqueness collisions into the one-agent-per-X error', async () => {
    process.env.X_CLIENT_ID = 'x-client-id'
    process.env.X_CLIENT_SECRET = 'x-client-secret'
    const context = await setupApiContext()

    const existingChallenge = await context.identity.createCaptchaChallenge()
    const existingRegistration = await context.identity.registerAgent(
      registrationInput(
        existingChallenge.id,
        'race_existing_bot',
        existingChallenge.prompt,
      ),
    )
    const existingClaimToken = existingRegistration.agent.claimUrl.replace('/?claim=', '')
    await context.identity.claimOwnerByClaimToken(
      existingClaimToken,
      'owner@example.com',
    )
    await verifyClaimEmail(context, existingClaimToken)

    const targetChallenge = await context.identity.createCaptchaChallenge()
    const targetRegistration = await context.identity.registerAgent(
      registrationInput(targetChallenge.id, 'race_target_bot', targetChallenge.prompt),
    )
    const targetClaimToken = targetRegistration.agent.claimUrl.replace('/?claim=', '')
    await context.identity.claimOwnerByClaimToken(
      targetClaimToken,
      'owner2@example.com',
    )
    await verifyClaimEmail(context, targetClaimToken)

    const authorizeUrl = await context.identity.createOwnerClaimXConnectUrl(
      targetClaimToken,
    )
    const state = new URL(authorizeUrl).searchParams.get('state')
    if (!state) {
      throw new Error('Expected X state in authorize URL.')
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          input instanceof URL
            ? input.toString()
            : input instanceof Request
              ? input.url
              : input
        if (url.includes('/oauth2/token')) {
          return new Response(
            JSON.stringify({
              access_token: 'x-access-token',
              token_type: 'bearer',
            }),
            { status: 200 },
          )
        }

        return new Response(
          JSON.stringify({
            data: {
              id: 'x-user-race',
              username: 'owner',
            },
          }),
          { status: 200 },
        )
      }),
    )

    const originalConnect = context.pool.connect.bind(context.pool)
    const connectSpy = vi
      .spyOn(context.pool, 'connect')
      .mockImplementation(async () => {
        const client = await originalConnect()
        const originalQuery = client.query.bind(client)
        let injected = false

        client.query = (async (...args: Parameters<typeof originalQuery>) => {
          const [text] = args
          if (
            !injected &&
            typeof text === 'string' &&
            text.includes('UPDATE agent_accounts') &&
            text.includes('owner_verification_x_user_id')
          ) {
            injected = true
            await originalQuery(
              `
                UPDATE agent_accounts
                SET owner_verification_x_handle = 'owner',
                    owner_verification_x_user_id = 'x-user-race',
                    owner_verification_x_connected_at = '2026-03-16T00:00:00.000Z',
                    updated_at = '2026-03-16T00:00:00.000Z'
                WHERE id = $1
              `,
              [existingRegistration.agent.id],
            )
            const error = Object.assign(new Error('duplicate key value'), {
              code: '23505',
              constraint: 'uniq_agent_accounts_active_x_owner',
            })
            throw error
          }

          return originalQuery(...args)
        }) as typeof client.query

        return client
      })

    await expect(
      context.identity.completeOwnerClaimXConnection({
        state,
        code: 'auth-code',
      }),
    ).rejects.toThrow(
      'That X account is already linked to @race_existing_bot. One X account can only verify one agent.',
    )

    connectSpy.mockRestore()
    await context.pool.end()
  })

  it('rejects replaying a consumed X callback state after a successful connection', async () => {
    process.env.X_CLIENT_ID = 'x-client-id'
    process.env.X_CLIENT_SECRET = 'x-client-secret'
    const context = await setupApiContext()

    const challenge = await context.identity.createCaptchaChallenge()
    const registration = await context.identity.registerAgent(
      registrationInput(challenge.id, 'kilo_bot', challenge.prompt),
    )
    const claimToken = registration.agent.claimUrl.replace('/?claim=', '')
    await context.identity.claimOwnerByClaimToken(claimToken, 'owner@example.com')
    await verifyClaimEmail(context, claimToken)

    const authorizeUrl = await context.identity.createOwnerClaimXConnectUrl(
      claimToken,
    )
    const state = new URL(authorizeUrl).searchParams.get('state')
    if (!state) {
      throw new Error('Expected X state in authorize URL.')
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          input instanceof URL
            ? input.toString()
            : input instanceof Request
              ? input.url
              : input
        if (url.includes('/oauth2/token')) {
          return new Response(
            JSON.stringify({
              access_token: 'x-access-token',
              token_type: 'bearer',
            }),
            { status: 200 },
          )
        }

        return new Response(
          JSON.stringify({
            data: {
              id: 'x-user-1',
              username: 'owner',
            },
          }),
          { status: 200 },
        )
      }),
    )

    const firstCompletion = await context.identity.completeOwnerClaimXConnection({
      state,
      code: 'auth-code',
    })
    expect(firstCompletion).toEqual({
      claimToken,
      xHandle: 'owner',
    })

    await expect(
      context.identity.completeOwnerClaimXConnection({
        state,
        code: 'auth-code',
      }),
    ).rejects.toThrow(
      'That X verification session has expired. Start again from the claim link.',
    )

    await context.pool.end()
  })

  it('rejects connecting an X account that is already verified on another agent', async () => {
    process.env.X_CLIENT_ID = 'x-client-id'
    process.env.X_CLIENT_SECRET = 'x-client-secret'
    const context = await setupApiContext()

    const existingChallenge = await context.identity.createCaptchaChallenge()
    const existingRegistration = await context.identity.registerAgent(
      registrationInput(
        existingChallenge.id,
        'existing_owner_bot',
        existingChallenge.prompt,
      ),
    )
    const existingClaimToken = existingRegistration.agent.claimUrl.replace('/?claim=', '')
    await context.identity.claimOwnerByClaimToken(
      existingClaimToken,
      'owner@example.com',
    )
    await verifyClaimEmail(context, existingClaimToken)
    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_verification_status = 'verified',
            owner_verification_x_handle = 'owner',
            owner_verification_x_user_id = 'x-user-1',
            owner_verification_x_connected_at = '2026-03-16T00:00:00.000Z',
            owner_verified_at = '2026-03-16T00:05:00.000Z',
            updated_at = '2026-03-16T00:05:00.000Z'
        WHERE id = $1
      `,
      [existingRegistration.agent.id],
    )

    const newChallenge = await context.identity.createCaptchaChallenge()
    const newRegistration = await context.identity.registerAgent(
      registrationInput(newChallenge.id, 'new_owner_bot', newChallenge.prompt),
    )
    const newClaimToken = newRegistration.agent.claimUrl.replace('/?claim=', '')
    await context.identity.claimOwnerByClaimToken(newClaimToken, 'owner2@example.com')
    await verifyClaimEmail(context, newClaimToken)

    const authorizeUrl = await context.identity.createOwnerClaimXConnectUrl(
      newClaimToken,
    )
    const state = new URL(authorizeUrl).searchParams.get('state')
    if (!state) {
      throw new Error('Expected X state in authorize URL.')
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          input instanceof URL
            ? input.toString()
            : input instanceof Request
              ? input.url
              : input
        if (url.includes('/oauth2/token')) {
          return new Response(
            JSON.stringify({
              access_token: 'x-access-token',
              token_type: 'bearer',
            }),
            { status: 200 },
          )
        }

        return new Response(
          JSON.stringify({
            data: {
              id: 'x-user-1',
              username: 'owner',
            },
          }),
          { status: 200 },
        )
      }),
    )

    await expect(
      context.identity.completeOwnerClaimXConnection({
        state,
        code: 'auth-code',
      }),
    ).rejects.toThrow(
      'That X account is already linked to @existing_owner_bot. One X account can only verify one agent.',
    )

    const newAgent = (
      await context.pool.query(
        `
          SELECT owner_verification_x_user_id, owner_verification_x_handle
          FROM agent_accounts
          WHERE id = $1
        `,
        [newRegistration.agent.id],
      )
    ).rows[0]
    expect(newAgent).toEqual({
      owner_verification_x_user_id: null,
      owner_verification_x_handle: null,
    })

    await context.pool.end()
  })

  it('evicts stale pending X-linked claims before letting that X account connect to a new agent', async () => {
    process.env.X_CLIENT_ID = 'x-client-id'
    process.env.X_CLIENT_SECRET = 'x-client-secret'
    const context = await setupApiContext()

    const staleChallenge = await context.identity.createCaptchaChallenge()
    const staleRegistration = await context.identity.registerAgent(
      registrationInput(
        staleChallenge.id,
        'stale_x_owner_bot',
        staleChallenge.prompt,
      ),
    )
    const staleClaimToken = staleRegistration.agent.claimUrl.replace('/?claim=', '')
    await context.identity.claimOwnerByClaimToken(
      staleClaimToken,
      'owner@example.com',
    )
    await verifyClaimEmail(context, staleClaimToken)
    await context.pool.query(
      `
        UPDATE agent_accounts
        SET owner_verification_x_handle = 'owner',
            owner_verification_x_user_id = 'x-user-1',
            owner_verification_x_connected_at = '2026-03-16T00:00:00.000Z',
            owner_verification_started_at = '2026-03-01T00:00:00.000Z',
            updated_at = '2026-03-01T00:00:00.000Z'
        WHERE id = $1
      `,
      [staleRegistration.agent.id],
    )

    const freshChallenge = await context.identity.createCaptchaChallenge()
    const freshRegistration = await context.identity.registerAgent(
      registrationInput(freshChallenge.id, 'fresh_x_owner_bot', freshChallenge.prompt),
    )
    const freshClaimToken = freshRegistration.agent.claimUrl.replace('/?claim=', '')
    await context.identity.claimOwnerByClaimToken(
      freshClaimToken,
      'owner2@example.com',
    )
    await verifyClaimEmail(context, freshClaimToken)

    const authorizeUrl = await context.identity.createOwnerClaimXConnectUrl(
      freshClaimToken,
    )
    const state = new URL(authorizeUrl).searchParams.get('state')
    if (!state) {
      throw new Error('Expected X state in authorize URL.')
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          input instanceof URL
            ? input.toString()
            : input instanceof Request
              ? input.url
              : input
        if (url.includes('/oauth2/token')) {
          return new Response(
            JSON.stringify({
              access_token: 'x-access-token',
              token_type: 'bearer',
            }),
            { status: 200 },
          )
        }

        return new Response(
          JSON.stringify({
            data: {
              id: 'x-user-1',
              username: 'owner',
            },
          }),
          { status: 200 },
        )
      }),
    )

    await expect(
      context.identity.completeOwnerClaimXConnection({
        state,
        code: 'auth-code',
      }),
    ).resolves.toEqual({
      claimToken: freshClaimToken,
      xHandle: 'owner',
    })

    expect(
      await context.pool.query(
        `SELECT COUNT(*)::int AS count FROM agent_accounts WHERE id = $1`,
        [staleRegistration.agent.id],
      ),
    ).toMatchObject({ rows: [{ count: 0 }] })

    expect(
      await context.pool.query(
        `
          SELECT owner_verification_x_user_id, owner_verification_x_handle
          FROM agent_accounts
          WHERE id = $1
        `,
        [freshRegistration.agent.id],
      ),
    ).toMatchObject({
      rows: [
        {
          owner_verification_x_user_id: 'x-user-1',
          owner_verification_x_handle: 'owner',
        },
      ],
    })

    await context.pool.end()
  })

  it('cleans up an uploaded avatar if registration fails after ingestion', async () => {
    const context = await setupApiContext()
    const challenge = await context.identity.createCaptchaChallenge()
    avatarStorageMocks.ingestAgentAvatarFromUrl.mockResolvedValueOnce(
      'https://cdn.lemonsuk.test/agent-avatars/duplicate_bot/uploaded.png',
    )

    await context.identity.registerAgent(
      registrationInput(challenge.id, 'duplicate_bot', challenge.prompt),
    )

    const secondChallenge = await context.identity.createCaptchaChallenge()
    await expect(
      context.identity.registerAgent({
        ...registrationInput(
          secondChallenge.id,
          'duplicate_bot',
          secondChallenge.prompt,
        ),
        avatarUrl: 'https://example.com/duplicate-bot.png',
      }),
    ).rejects.toThrow('That agent handle is already taken.')

    expect(avatarStorageMocks.deleteManagedAvatarUrl).toHaveBeenCalledWith(
      'https://cdn.lemonsuk.test/agent-avatars/duplicate_bot/uploaded.png',
    )

    await context.pool.end()
  })
})
