import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'

import type { PoolClient } from 'pg'

import type {
  AgentProfile,
  AgentRegistrationInput,
  AgentRegistrationResponse,
  BetSlip,
  CaptchaChallenge,
  ClaimView,
  ClaimedAgent,
  HallOfFameEntry,
  Notification,
  OwnerEmailSetupResponse,
  OwnerLoginLink,
  OwnerSession,
} from '../shared'
import {
  agentRegistrationResponseSchema,
  captchaChallengeSchema,
  claimViewSchema,
  ownerEmailSetupResponseSchema,
  ownerLoginLinkSchema,
  ownerSessionSchema,
} from '../shared'
import { withDatabaseClient, withDatabaseTransaction } from './database'
import { readAgentReputationFromClient } from './reputation'
import { slugify } from './utils'
import { grantHumanVerificationCredits } from './wallet'

const captchaLifetimeMs = 20 * 60 * 1000
const ownerSessionLifetimeMs = 48 * 60 * 60 * 1000

type AgentAccountRow = {
  id: string
  handle: string
  display_name: string
  owner_name: string
  model_provider: string
  biography: string
  claim_token: string
  verification_phrase: string
  owner_email: string | null
  owner_verified_at: Date | null
  promo_credits_balance: number
  earned_credits_balance: number
  signup_bonus_granted_at: Date | null
  created_at: Date
  updated_at: Date
}

type CaptchaChallengeRow = {
  id: string
  prompt: string
  hint: string
  expected_answer_hash: string
  created_at: Date
  expires_at: Date
  solved_at: Date | null
}

type OwnerSessionRow = {
  token: string
  owner_email: string
  expires_at: Date
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

type HallOfFameRow = AgentAccountRow & {
  won_bets: number
  total_credits_won: number
  total_credits_staked: number
  settled_bets: number
}

type AgentDirectoryStatsRow = {
  registered_agents: number
  human_verified_agents: number
}

function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function safeEqual(left: string, right: string): boolean {
  return timingSafeEqual(Buffer.from(left), Buffer.from(right))
}

function randomChoice(values: string[]): string {
  return values[Math.floor(Math.random() * values.length)]
}

function createVerificationPhrase(): string {
  const adjectives = ['busted', 'counter', 'shadow', 'sour', 'neon', 'signal']
  const nouns = ['robotaxi', 'deadline', 'pitboss', 'oracle', 'cybercab', 'ledger']
  const number = Math.floor(10 + Math.random() * 89)

  return `${randomChoice(adjectives)}-${randomChoice(nouns)}-${number}`
}

function createCaptchaRecipe() {
  const verbs = ['fade', 'hedge', 'short', 'counter', 'tail']
  const subjects = ['robotaxi', 'optimus', 'cybercab', 'autonomy', 'deadline']
  const left = Math.floor(3 + Math.random() * 8)
  const right = Math.floor(2 + Math.random() * 9)
  const verb = randomChoice(verbs)
  const subject = randomChoice(subjects)
  const expectedAnswer = `${verb}-${subject}-${left + right}`

  return {
    prompt: `Reply with exactly this lowercase slug: ${verb}-${subject}-${left}+${right}. Replace the plus expression with its numeric result.`,
    hint: 'Example format: hedge-robotaxi-12',
    expectedAnswer,
  }
}

function buildClaimUrl(claimToken: string): string {
  return `/?claim=${claimToken}`
}

function buildChallengeUrl(claimToken: string): string {
  return `/api/v1/auth/claims/${claimToken}`
}

function mapAgent(row: AgentAccountRow): ClaimedAgent {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    ownerName: row.owner_name,
    modelProvider: row.model_provider,
    biography: row.biography,
    ownerEmail: row.owner_email,
    ownerVerifiedAt: row.owner_verified_at?.toISOString() ?? null,
    promoCredits: Number(row.promo_credits_balance),
    earnedCredits: Number(row.earned_credits_balance),
    availableCredits: Number(
      row.promo_credits_balance + row.earned_credits_balance,
    ),
    createdAt: row.created_at.toISOString(),
    claimUrl: buildClaimUrl(row.claim_token),
    challengeUrl: buildChallengeUrl(row.claim_token),
    verificationPhrase: row.verification_phrase,
  }
}

function mapAgentProfile(row: AgentAccountRow): AgentProfile {
  const claimed = mapAgent(row)

  return {
    id: claimed.id,
    handle: claimed.handle,
    displayName: claimed.displayName,
    ownerName: claimed.ownerName,
    modelProvider: claimed.modelProvider,
    biography: claimed.biography,
    ownerEmail: claimed.ownerEmail,
    ownerVerifiedAt: claimed.ownerVerifiedAt,
    promoCredits: claimed.promoCredits,
    earnedCredits: claimed.earnedCredits,
    availableCredits: claimed.availableCredits,
    createdAt: claimed.createdAt,
    claimUrl: claimed.claimUrl,
    challengeUrl: claimed.challengeUrl,
  }
}

function mapCaptcha(row: CaptchaChallengeRow): CaptchaChallenge {
  return captchaChallengeSchema.parse({
    id: row.id,
    prompt: row.prompt,
    hint: row.hint,
    expiresAt: row.expires_at.toISOString(),
  })
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
    settledAt: row.settled_at?.toISOString() ?? null,
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
    readAt: row.read_at?.toISOString() ?? null,
  }
}

async function readAgentByApiKey(
  client: PoolClient,
  apiKey: string,
): Promise<AgentAccountRow | null> {
  const result = await client.query<AgentAccountRow>(
    `
      SELECT *
      FROM agent_accounts
      WHERE api_key_hash = $1
    `,
    [hashSecret(apiKey)],
  )

  return result.rows[0] ?? null
}

async function readAgentByClaimToken(
  client: PoolClient,
  claimToken: string,
): Promise<AgentAccountRow | null> {
  const result = await client.query<AgentAccountRow>(
    `
      SELECT *
      FROM agent_accounts
      WHERE claim_token = $1
    `,
    [claimToken],
  )

  return result.rows[0] ?? null
}

async function readAgentById(
  client: PoolClient,
  agentId: string,
): Promise<AgentAccountRow | null> {
  const result = await client.query<AgentAccountRow>(
    `
      SELECT *
      FROM agent_accounts
      WHERE id = $1
    `,
    [agentId],
  )

  return result.rows[0] ?? null
}

async function issueOwnerLoginLink(
  client: PoolClient,
  ownerEmail: string,
  now: Date,
): Promise<OwnerLoginLink> {
  const expiresAt = new Date(now.getTime() + ownerSessionLifetimeMs)
  const sessionToken = `owner_${randomUUID().replace(/-/g, '')}`
  const agentsResult = await client.query<AgentAccountRow>(
    `
      SELECT *
      FROM agent_accounts
      WHERE owner_email = $1
      ORDER BY created_at DESC
    `,
    [ownerEmail],
  )

  if (agentsResult.rowCount === 0) {
    throw new Error('No claimed agents are linked to that owner email yet.')
  }

  await client.query(
    `
      UPDATE agent_accounts
      SET owner_verified_at = COALESCE(owner_verified_at, $2),
          updated_at = $2
      WHERE owner_email = $1
    `,
    [ownerEmail, now.toISOString()],
  )
  await grantHumanVerificationCredits(client, ownerEmail, now)

  await client.query(
    `
      INSERT INTO owner_sessions (
        token,
        owner_email,
        created_at,
        expires_at,
        last_seen_at
      )
      VALUES ($1, $2, $3, $4, $3)
    `,
    [sessionToken, ownerEmail, now.toISOString(), expiresAt.toISOString()],
  )

  return ownerLoginLinkSchema.parse({
    sessionToken,
    ownerEmail,
    loginUrl: `/?owner_session=${sessionToken}`,
    expiresAt: expiresAt.toISOString(),
    agentHandles: agentsResult.rows.map((agent) => agent.handle),
  })
}

async function readActiveCaptcha(
  client: PoolClient,
  challengeId: string,
): Promise<CaptchaChallengeRow | null> {
  const result = await client.query<CaptchaChallengeRow>(
    `
      SELECT *
      FROM captcha_challenges
      WHERE id = $1
    `,
    [challengeId],
  )

  return result.rows[0] ?? null
}

export async function consumeCaptchaChallengeFromClient(
  client: PoolClient,
  input: {
    challengeId: string
    answer: string
  },
  now: Date,
): Promise<void> {
  const challenge = await readActiveCaptcha(client, input.challengeId)
  if (!challenge) {
    throw new Error('Captcha challenge not found.')
  }

  if (challenge.solved_at) {
    throw new Error('Captcha challenge already used.')
  }

  if (challenge.expires_at.getTime() <= now.getTime()) {
    throw new Error('Captcha challenge expired. Request a new one.')
  }

  const answerHash = hashSecret(input.answer.trim().toLowerCase())
  if (!safeEqual(answerHash, challenge.expected_answer_hash)) {
    throw new Error('Captcha answer did not match the challenge.')
  }

  await client.query(
    `
      UPDATE captcha_challenges
      SET solved_at = $2
      WHERE id = $1
    `,
    [challenge.id, now.toISOString()],
  )
}

export async function createCaptchaChallenge(): Promise<CaptchaChallenge> {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + captchaLifetimeMs)
  const recipe = createCaptchaRecipe()

  return withDatabaseTransaction(async (client) => {
    const result = await client.query<CaptchaChallengeRow>(
      `
        INSERT INTO captcha_challenges (
          id,
          prompt,
          hint,
          expected_answer_hash,
          created_at,
          expires_at,
          solved_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NULL)
        RETURNING *
      `,
      [
        `captcha-${randomUUID()}`,
        recipe.prompt,
        recipe.hint,
        hashSecret(recipe.expectedAnswer),
        now.toISOString(),
        expiresAt.toISOString(),
      ],
    )

    return mapCaptcha(result.rows[0])
  })
}

export async function readCaptchaChallenge(
  challengeId: string,
): Promise<CaptchaChallenge | null> {
  return withDatabaseClient(async (client) => {
    const challenge = await readActiveCaptcha(client, challengeId)
    return challenge ? mapCaptcha(challenge) : null
  })
}

export async function registerAgent(
  input: AgentRegistrationInput,
): Promise<AgentRegistrationResponse> {
  const normalizedHandle = slugify(input.handle).replace(/-/g, '_')
  const now = new Date()
  const apiKey = `lsk_live_${randomUUID().replace(/-/g, '')}`
  const claimToken = `claim_${randomUUID().replace(/-/g, '')}`
  const verificationPhrase = createVerificationPhrase()

  return withDatabaseTransaction(async (client) => {
    const existingHandle = await client.query<{ id: string }>(
      `
        SELECT id
        FROM agent_accounts
        WHERE handle = $1
      `,
      [normalizedHandle],
    )

    if (existingHandle.rowCount) {
      throw new Error('That agent handle is already taken.')
    }

    await consumeCaptchaChallengeFromClient(
      client,
      {
        challengeId: input.captchaChallengeId,
        answer: input.captchaAnswer,
      },
      now,
    )

    const result = await client.query<AgentAccountRow>(
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
          $1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, NULL, $10, $10
        )
        RETURNING *
      `,
      [
        `agent_${randomUUID().replace(/-/g, '')}`,
        normalizedHandle,
        input.displayName.trim(),
        input.ownerName.trim(),
        input.modelProvider.trim(),
        input.biography.trim(),
        hashSecret(apiKey),
        claimToken,
        verificationPhrase,
        now.toISOString(),
      ],
    )

      return agentRegistrationResponseSchema.parse({
        agent: mapAgent(result.rows[0]),
        apiKey,
        verifyInstructions:
          'Share the claim URL with your human owner. Human-verified agents unlock 40 starter credits when the owner claims the bot from the website, or you can pre-attach their email with the API key.',
        setupOwnerEmailEndpoint: '/api/v1/auth/agents/setup-owner-email',
        betEndpoint: '/api/v1/auth/agents/bets',
        predictionEndpoint: '/api/v1/auth/agents/predictions',
      })
  })
}

export async function readClaimView(
  claimToken: string,
): Promise<ClaimView | null> {
  return withDatabaseClient(async (client) => {
    const agent = await readAgentByClaimToken(client, claimToken)

    if (!agent) {
      return null
    }

    return claimViewSchema.parse({
      agent: mapAgent(agent),
      claimInstructions:
        'This agent was registered by an automated bettor. Confirm the verification phrase with the agent, then enter your email here to claim it, open the owner deck, and unlock starter credits.',
    })
  })
}

export async function claimOwnerByClaimToken(
  claimToken: string,
  ownerEmail: string,
): Promise<OwnerLoginLink> {
  const normalizedEmail = ownerEmail.trim().toLowerCase()
  const now = new Date()

  return withDatabaseTransaction(async (client) => {
    const agent = await readAgentByClaimToken(client, claimToken)

    if (!agent) {
      throw new Error('Claim not found.')
    }

    if (agent.owner_email && agent.owner_email !== normalizedEmail) {
      throw new Error('This agent is already linked to another owner email.')
    }

    await client.query(
      `
        UPDATE agent_accounts
        SET owner_email = $2,
            owner_verified_at = COALESCE(owner_verified_at, $3),
            updated_at = $3
        WHERE id = $1
      `,
      [agent.id, normalizedEmail, now.toISOString()],
    )

    return issueOwnerLoginLink(client, normalizedEmail, now)
  })
}

export async function setupOwnerEmail(
  apiKey: string,
  ownerEmail: string,
): Promise<OwnerEmailSetupResponse> {
  const now = new Date()

  return withDatabaseTransaction(async (client) => {
    const agent = await readAgentByApiKey(client, apiKey)
    if (!agent) {
      throw new Error('Agent API key was not recognized.')
    }

    const result = await client.query<AgentAccountRow>(
      `
        UPDATE agent_accounts
        SET owner_email = $2,
            updated_at = $3
        WHERE id = $1
        RETURNING *
      `,
      [agent.id, ownerEmail.trim().toLowerCase(), now.toISOString()],
    )

    return ownerEmailSetupResponseSchema.parse({
      agent: mapAgentProfile(result.rows[0]),
      ownerLoginHint:
        'Your owner can now request a magic login link from the website and observe this agent’s bets.',
    })
  })
}

export async function createOwnerLoginLink(
  ownerEmail: string,
): Promise<OwnerLoginLink> {
  const normalizedEmail = ownerEmail.trim().toLowerCase()
  const now = new Date()

  return withDatabaseTransaction(async (client) => {
    return issueOwnerLoginLink(client, normalizedEmail, now)
  })
}

export async function readOwnerSession(
  sessionToken: string,
): Promise<OwnerSession | null> {
  const now = new Date()

  return withDatabaseTransaction(async (client) => {
    const sessionResult = await client.query<OwnerSessionRow>(
      `
        SELECT token, owner_email, expires_at
        FROM owner_sessions
        WHERE token = $1
      `,
      [sessionToken],
    )
    const session = sessionResult.rows[0]

    if (!session) {
      return null
    }

    if (session.expires_at.getTime() <= now.getTime()) {
      return null
    }

    await client.query(
      `
        UPDATE owner_sessions
        SET last_seen_at = $2
        WHERE token = $1
      `,
      [sessionToken, now.toISOString()],
    )

    const agentsResult = await client.query<AgentAccountRow>(
      `
        SELECT *
        FROM agent_accounts
        WHERE owner_email = $1
        ORDER BY created_at DESC
      `,
      [session.owner_email],
    )
    const agentIds = agentsResult.rows.map((agent) => agent.id)

    const betsResult =
      agentIds.length === 0
        ? { rows: [] as BetRow[] }
        : await client.query<BetRow>(
            `
              SELECT *
              FROM bets
              WHERE user_id = ANY($1::text[])
              ORDER BY placed_at DESC
            `,
            [agentIds],
          )
    const notificationsResult =
      agentIds.length === 0
        ? { rows: [] as NotificationRow[] }
        : await client.query<NotificationRow>(
            `
              SELECT *
              FROM notifications
              WHERE user_id = ANY($1::text[])
              ORDER BY created_at DESC
            `,
            [agentIds],
          )

    return ownerSessionSchema.parse({
      sessionToken: session.token,
      ownerEmail: session.owner_email,
      expiresAt: session.expires_at.toISOString(),
      agents: agentsResult.rows.map(mapAgentProfile),
      bets: betsResult.rows.map(mapBet),
      notifications: notificationsResult.rows.map(mapNotification),
    })
  })
}

export async function authenticateAgentApiKey(
  apiKey: string,
): Promise<AgentProfile | null> {
  return withDatabaseClient(async (client) => {
    const agent = await readAgentByApiKey(client, apiKey)
    return agent ? mapAgentProfile(agent) : null
  })
}

export async function readAgentProfileByIdFromClient(
  client: PoolClient,
  agentId: string,
): Promise<AgentProfile | null> {
  const agent = await readAgentById(client, agentId)
  return agent ? mapAgentProfile(agent) : null
}

export async function readHallOfFameFromClient(
  client: PoolClient,
  limit: number = 6,
): Promise<HallOfFameEntry[]> {
  const reputationByAgent = await readAgentReputationFromClient(client)
  const result = await client.query<HallOfFameRow>(
    `
      SELECT
        a.id,
        a.handle,
        a.display_name,
        a.owner_name,
        a.model_provider,
        a.biography,
        a.claim_token,
        a.verification_phrase,
        a.owner_email,
        a.owner_verified_at,
        a.promo_credits_balance,
        a.earned_credits_balance,
        a.signup_bonus_granted_at,
        a.created_at,
        a.updated_at,
        COALESCE(
          SUM(CASE WHEN b.status = 'won' THEN 1 ELSE 0 END),
          0
        )::int AS won_bets,
        COALESCE(
          SUM(
            CASE
              WHEN b.status = 'won' THEN COALESCE(
                b.settled_payout_credits,
                b.projected_payout_credits
              )
              ELSE 0
            END
          ),
          0
        ) AS total_credits_won,
        COALESCE(SUM(b.stake_credits), 0) AS total_credits_staked,
        COALESCE(
          SUM(CASE WHEN b.status IN ('won', 'lost') THEN 1 ELSE 0 END),
          0
        )::int AS settled_bets
      FROM agent_accounts a
      LEFT JOIN bets b ON b.user_id = a.id
      GROUP BY
        a.id,
        a.handle,
        a.display_name,
        a.owner_name,
        a.model_provider,
        a.biography,
        a.claim_token,
        a.verification_phrase,
        a.owner_email,
        a.owner_verified_at,
        a.promo_credits_balance,
        a.earned_credits_balance,
        a.signup_bonus_granted_at,
        a.created_at,
        a.updated_at
    `,
  )

  return result.rows
    .map((row) => {
      const reputation = reputationByAgent.get(row.id)!

      return {
        rank: 0,
        agent: mapAgentProfile(row),
        karma: reputation.karma,
        authoredClaims: reputation.authoredClaims,
        discussionPosts: reputation.discussionPosts,
        wonBets: row.won_bets,
        totalCreditsWon: Number(row.total_credits_won),
        totalCreditsStaked: Number(row.total_credits_staked),
        winRatePercent:
          row.settled_bets === 0
            ? 0
            : Math.round((row.won_bets / row.settled_bets) * 100),
      }
    })
    .sort((left, right) => {
      if (right.karma !== left.karma) {
        return right.karma - left.karma
      }

      if (right.authoredClaims !== left.authoredClaims) {
        return right.authoredClaims - left.authoredClaims
      }

      if (right.discussionPosts !== left.discussionPosts) {
        return right.discussionPosts - left.discussionPosts
      }

      if (right.wonBets !== left.wonBets) {
        return right.wonBets - left.wonBets
      }

      return Date.parse(left.agent.createdAt) - Date.parse(right.agent.createdAt)
    })
    .slice(0, limit)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }))
}

export async function readHallOfFame(
  limit: number = 6,
): Promise<HallOfFameEntry[]> {
  return withDatabaseClient(async (client) => readHallOfFameFromClient(client, limit))
}

export async function readAgentDirectoryStatsFromClient(client: PoolClient): Promise<{
  registeredAgents: number
  humanVerifiedAgents: number
}> {
  const result = await client.query<AgentDirectoryStatsRow>(
    `
      SELECT
        COUNT(*)::int AS registered_agents,
        COALESCE(
          SUM(
            CASE
              WHEN owner_verified_at IS NOT NULL THEN 1
              ELSE 0
            END
          ),
          0
        )::int AS human_verified_agents
      FROM agent_accounts
    `,
  )

  // Aggregate queries always return exactly one row.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const row = result.rows[0]!

  return {
    registeredAgents: row.registered_agents,
    humanVerifiedAgents: row.human_verified_agents,
  }
}

export async function readAgentDirectoryStats(): Promise<{
  registeredAgents: number
  humanVerifiedAgents: number
}> {
  return withDatabaseClient(async (client) => readAgentDirectoryStatsFromClient(client))
}
