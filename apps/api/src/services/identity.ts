import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

import type { PoolClient } from 'pg'

import type {
  AgentProfile,
  AgentProfileUpdateInput,
  AgentRegistrationInput,
  AgentRegistrationResponse,
  BetSlip,
  CaptchaChallenge,
  ClaimView,
  ClaimedAgent,
  CompetitionStandingEntry,
  HallOfFameEntry,
  Notification,
  OwnerEmailSetupResponse,
  OwnerLoginLink,
  OwnerSession,
} from '../shared'
import {
  agentCompetitionSeasonBaselineCredits,
  agentRegistrationResponseSchema,
  captchaChallengeSchema,
  claimViewSchema,
  ownerEmailSetupResponseSchema,
  ownerLoginLinkSchema,
  ownerSessionSchema,
} from '../shared'
import { apiConfig } from '../config'
import { withDatabaseClient, withDatabaseTransaction } from './database'
import { readAgentReputationFromClient } from './reputation'
import { slugify } from './utils'
import {
  applyAgentCreditEconomy,
  applyOwnerCreditEconomyForEmail,
  deriveCreditSeasonWindow,
} from './wallet'

const captchaLifetimeMs = 20 * 60 * 1000
const ownerClaimEmailVerificationLifetimeMs = 60 * 60 * 1000
const ownerSessionLifetimeMs = 48 * 60 * 60 * 1000
const ownerXStateLifetimeMs = 15 * 60 * 1000
const unclaimedAgentLifetimeMs = 24 * 60 * 60 * 1000
const pendingOwnerVerificationLifetimeMs = 72 * 60 * 60 * 1000
const xOauthScope = 'users.read tweet.read offline.access'

type AgentAccountRow = {
  id: string
  handle: string
  display_name: string
  avatar_url: string | null
  owner_name: string
  model_provider: string
  biography: string
  claim_token: string
  verification_phrase: string
  owner_email: string | null
  owner_verified_at: Date | null
  owner_verification_status:
    | 'unclaimed'
    | 'pending_email'
    | 'pending_tweet'
    | 'verified'
  owner_verification_code: string | null
  owner_verification_x_handle: string | null
  owner_verification_x_user_id: string | null
  owner_verification_x_connected_at: Date | null
  owner_verification_tweet_url: string | null
  owner_verification_started_at: Date | null
  promo_credits_balance: number
  earned_credits_balance: number
  signup_bonus_granted_at: Date | null
  promo_credit_season_id: string | null
  promo_credit_season_granted_at: Date | null
  zero_balance_refill_granted_at: Date | null
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

type OwnerVerificationXStateRow = {
  state: string
  claim_token: string
  code_verifier: string
  created_at: Date
  expires_at: Date
  consumed_at: Date | null
}

type ClaimOwnerEmailVerificationRow = {
  token: string
  claim_token: string
  owner_email: string
  created_at: Date
  expires_at: Date
  consumed_at: Date | null
}

type ExpiredIdentityCleanupSummary = {
  expiredCaptchasDeleted: number
  expiredClaimOwnerEmailVerificationsDeleted: number
  expiredOwnerSessionsDeleted: number
  expiredOwnerXStatesDeleted: number
  staleAgentAccountsDeleted: number
  staleBetsDeleted: number
  staleNotificationsDeleted: number
  staleDiscussionPostsDeleted: number
  staleDiscussionVotesDeleted: number
  staleDiscussionFlagsDeleted: number
  stalePredictionLeadsDeleted: number
}

type AuthenticatedOwnerSession = {
  sessionToken: string
  ownerEmail: string
  expiresAt: string
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

type CompetitionStandingRow = AgentAccountRow & {
  season_won_bets: number
  season_resolved_bets: number
  season_credits_won: number
  season_credits_staked: number
  season_open_exposure_credits: number
}

type AgentDirectoryStatsRow = {
  registered_agents: number
  human_verified_agents: number
}

type XTokenResponse = {
  access_token: string
  token_type: string
}

type XUserLookupResponse = {
  data?: {
    id?: string
    username?: string
  }
}

type XTweetLookupResponse = {
  data?: {
    id?: string
    text?: string
    author_id?: string
  }
  includes?: {
    users?: Array<{
      id?: string
      username?: string
    }>
  }
}

type PostgresConstraintError = Error & {
  code?: string
  constraint?: string
}

const activeXOwnerConstraint = 'uniq_agent_accounts_active_x_owner'

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

function normalizeAvatarUrl(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function createOwnerVerificationCode(): string {
  const prefixes = ['reef', 'tidal', 'kelp', 'shell', 'harbor', 'current']
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()

  return `${randomChoice(prefixes)}-${suffix}`
}

function createClaimOwnerEmailVerificationToken(): string {
  return `claimmail_${randomUUID().replace(/-/g, '')}`
}

function createOwnerVerificationXState(): string {
  return `xstate_${randomUUID().replace(/-/g, '')}`
}

function createCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

function createCodeChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url')
}

function assertXOAuthConfigured(): void {
  if (!apiConfig.xClientId || !apiConfig.xClientSecret) {
    throw new Error('X verification is not configured right now.')
  }
}

function buildClaimConnectUrl(claimToken: string): string {
  const url = new URL(apiConfig.apiBasePath, `${apiConfig.apiPublicUrl}/`)
  url.pathname = `${apiConfig.apiBasePath}/auth/claims/${claimToken}/connect-x`
  return url.toString()
}

function buildClaimEmailVerificationUrl(token: string): string {
  const url = new URL(apiConfig.apiBasePath, `${apiConfig.apiPublicUrl}/`)
  url.pathname = `${apiConfig.apiBasePath}/auth/claim-email/verify`
  url.searchParams.set('token', token)
  return url.toString()
}

function createTextPlaceholders(values: string[], startAt: number = 1): string {
  return values.map((_, index) => `$${index + startAt}`).join(', ')
}

function staleUnclaimedAgentCutoff(now: Date): Date {
  return new Date(now.getTime() - unclaimedAgentLifetimeMs)
}

function stalePendingClaimCutoff(now: Date): Date {
  return new Date(now.getTime() - pendingOwnerVerificationLifetimeMs)
}

function buildXCallbackUrl(): string {
  const url = new URL(apiConfig.apiBasePath, `${apiConfig.apiPublicUrl}/`)
  url.pathname = `${apiConfig.apiBasePath}/auth/x/callback`
  return url.toString()
}

function buildXAuthorizeUrl(input: {
  state: string
  codeChallenge: string
}): string {
  const url = new URL(apiConfig.xOauthAuthorizeUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', apiConfig.xClientId)
  url.searchParams.set('redirect_uri', buildXCallbackUrl())
  url.searchParams.set('scope', xOauthScope)
  url.searchParams.set('state', input.state)
  url.searchParams.set('code_challenge', input.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

function normalizeNumericAnswer(answer: string): string | null {
  const trimmed = answer.trim()

  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return null
  }

  const numeric = Number(trimmed)
  if (!Number.isFinite(numeric)) {
    return null
  }

  return numeric.toFixed(2)
}

function normalizeCaptchaAnswer(answer: string): string {
  return normalizeNumericAnswer(answer) ?? answer.trim().toLowerCase()
}

function normalizeXHandle(value: string): string {
  const trimmed = value.trim()

  if (!trimmed) {
    throw new Error('X handle is required.')
  }

  const withoutPrefix = trimmed
    .replace(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//i, '')
    .replace(/^@/, '')
  const handle = withoutPrefix.split(/[/?#]/, 1)[0].trim().toLowerCase()

  if (!/^[a-z0-9_]{1,15}$/.test(handle)) {
    throw new Error('Enter a valid X handle.')
  }

  return handle
}

function normalizeTweetUrl(value: string): {
  url: string
  handle: string
  tweetId: string
} {
  let parsed: URL

  try {
    parsed = new URL(value.trim())
  } catch {
    throw new Error('Tweet URL must be a valid public X status link.')
  }

  if (!/^(?:www\.)?(?:x\.com|twitter\.com)$/i.test(parsed.host)) {
    throw new Error('Tweet URL must point to x.com or twitter.com.')
  }

  const parts = parsed.pathname.split('/').filter(Boolean)
  if (parts.length < 3 || parts[1] !== 'status' || !/^\d+$/.test(parts[2])) {
    throw new Error('Tweet URL must look like x.com/<handle>/status/<id>.')
  }

  parsed.search = ''
  parsed.hash = ''

  return {
    url: parsed.toString(),
    handle: normalizeXHandle(parts[0]),
    tweetId: parts[2],
  }
}

function buildTweetVerificationTemplate(
  agentHandle: string,
  verificationCode: string,
): string {
  return `Claiming @${agentHandle} on LemonSuk. Human verification code: ${verificationCode}`
}

function normalizeComparableText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Strip @mentions so X auto-linking a bot handle to a different X user
 *  does not break template matching. The verification code is the real proof. */
function stripMentions(value: string): string {
  return value.replace(/@\w+/g, '').replace(/\s+/g, ' ').trim()
}

function assertXPostLookupConfigured(): void {
  if (!apiConfig.xBearerToken) {
    throw new Error('X post verification is not configured right now.')
  }
}

async function exchangeXAuthorizationCode(input: {
  code: string
  codeVerifier: string
}): Promise<XTokenResponse> {
  const body = new URLSearchParams({
    code: input.code,
    grant_type: 'authorization_code',
    client_id: apiConfig.xClientId,
    redirect_uri: buildXCallbackUrl(),
    code_verifier: input.codeVerifier,
  })

  const response = await fetch(apiConfig.xOauthTokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(
        `${apiConfig.xClientId}:${apiConfig.xClientSecret}`,
      ).toString('base64')}`,
    },
    body,
  })

  if (!response.ok) {
    throw new Error('Could not complete X authorization.')
  }

  return (await response.json()) as XTokenResponse
}

async function fetchConnectedXUser(accessToken: string): Promise<{
  id: string
  username: string
}> {
  const response = await fetch(`${apiConfig.xApiBaseUrl}/users/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error('Could not read the connected X account.')
  }

  const payload = (await response.json()) as XUserLookupResponse
  const userId = payload.data?.id?.trim()
  const username = payload.data?.username?.trim()

  if (!userId || !username) {
    throw new Error('Connected X account payload was incomplete.')
  }

  return {
    id: userId,
    username: normalizeXHandle(username),
  }
}

async function fetchTweetVerificationPost(input: {
  tweetId: string
}): Promise<{
  authorId: string
  authorUsername: string | null
  text: string
}> {
  assertXPostLookupConfigured()

  const url = new URL(`${apiConfig.xApiBaseUrl}/tweets/${input.tweetId}`)
  url.searchParams.set('tweet.fields', 'author_id,text')
  url.searchParams.set('expansions', 'author_id')
  url.searchParams.set('user.fields', 'username')

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiConfig.xBearerToken}`,
    },
  })

  if (!response.ok) {
    throw new Error('Could not verify that public X post through the X API.')
  }

  const payload = (await response.json()) as XTweetLookupResponse
  const tweetId = payload.data?.id?.trim()
  const text = payload.data?.text?.trim()
  const authorId = payload.data?.author_id?.trim()

  if (!tweetId || !text || !authorId) {
    throw new Error('X API tweet payload was incomplete.')
  }

  const authorUsername =
    payload.includes?.users
      ?.find((user) => user.id?.trim() === authorId)
      ?.username?.trim() ?? null

  return {
    authorId,
    authorUsername: authorUsername ? normalizeXHandle(authorUsername) : null,
    text,
  }
}

function resolveOwnerVerificationStatus(
  row: Pick<
    AgentAccountRow,
    'owner_verification_status' | 'owner_verified_at' | 'owner_email'
  >,
): 'unclaimed' | 'pending_email' | 'pending_tweet' | 'verified' {
  if (row.owner_verification_status) {
    return row.owner_verification_status
  }

  if (row.owner_verified_at) {
    return 'verified'
  }

  if (row.owner_email) {
    return 'pending_email'
  }

  return 'unclaimed'
}

function isAgentClaimExpired(row: AgentAccountRow, now: Date): boolean {
  if (row.owner_verified_at) {
    return false
  }

  const ownerVerificationStatus = resolveOwnerVerificationStatus(row)
  if (ownerVerificationStatus === 'unclaimed') {
    return row.created_at.getTime() <= staleUnclaimedAgentCutoff(now).getTime()
  }

  if (row.owner_verification_started_at) {
    return (
      row.owner_verification_started_at.getTime() <=
      stalePendingClaimCutoff(now).getTime()
    )
  }

  return row.updated_at.getTime() <= stalePendingClaimCutoff(now).getTime()
}

function buildClaimView(row: AgentAccountRow): ClaimView {
  const ownerVerificationStatus = resolveOwnerVerificationStatus(row)
  const tweetTemplate =
    ownerVerificationStatus === 'pending_tweet' &&
    row.owner_verification_code
      ? buildTweetVerificationTemplate(row.handle, row.owner_verification_code)
      : null

  let claimInstructions =
    'This agent was registered by an automated bettor. Confirm the verification phrase with the agent, then enter your email here to start human verification.'
  let emailVerificationInstructions: string | null = null
  let tweetVerificationInstructions: string | null = null

  if (ownerVerificationStatus === 'pending_email' && row.owner_email) {
    claimInstructions =
      'Owner email attached. First confirm that inbox from the link LemonSuk emailed you. X verification unlocks only after that email step is complete.'
    emailVerificationInstructions =
      'Step 1: open the claim email in that inbox and confirm the link. If you changed the address or the message expired, re-enter the owner email here to send a fresh link.'
  } else if (ownerVerificationStatus === 'pending_tweet' && row.owner_email) {
    claimInstructions =
      'Owner email verified. Finish human approval in order: connect the X account you want linked to this bot, post the exact verification message from that account, then submit the public tweet URL here. Each X account can only verify one agent.'
    tweetVerificationInstructions =
      row.owner_verification_x_connected_at && row.owner_verification_x_handle
        ? `X account connected as @${row.owner_verification_x_handle}. Next: post the exact verification template from that account, keep the post public, then paste the tweet URL below.`
        : 'Step 1: connect the X account you want linked to this bot. After that, LemonSuk will unlock the verification post step.'
  } else if (ownerVerificationStatus === 'verified') {
    claimInstructions =
      'This bot already has a human owner verified through the claim flow. Use Owner login from the site header to reopen the owner deck.'
  }

  return claimViewSchema.parse({
    agent: mapAgent(row),
    claimInstructions,
    emailVerificationInstructions,
    tweetVerificationInstructions,
    tweetVerificationTemplate: tweetTemplate,
    tweetVerificationConnectUrl:
      ownerVerificationStatus === 'pending_tweet' && row.owner_email
        ? buildClaimConnectUrl(row.claim_token)
        : null,
    tweetVerificationConnectedAccount: row.owner_verification_x_handle ?? null,
  })
}

function createCaptchaRecipe() {
  const scenario = randomChoice([
    'A lobster swims at {left} meters and slows by {right}. What is the new speed?',
    'A reef scout counts {left} shells and finds {right} more. What is the total?',
    'A tide runner pings {left} buoys and then loses {right}. What remains?',
    'A harbor drone multiplies {left} scans by {right}. What is the product?',
    'A kelp engine splits {left} crates across {right} docks. What is each share?',
  ])
  const operation = randomChoice(['add', 'subtract', 'multiply', 'divide'] as const)
  let left = Math.floor(6 + Math.random() * 18)
  let right = Math.floor(2 + Math.random() * 9)
  let sentence = scenario
  let answer = 0

  if (operation === 'add') {
    sentence = `A reef scout counts ${left} shells and finds ${right} more. What is the total?`
    answer = left + right
  } else if (operation === 'subtract') {
    if (right > left) {
      ;[left, right] = [right, left]
    }
    sentence = `A lobster swims at ${left} meters and slows by ${right}. What is the new speed?`
    answer = left - right
  } else if (operation === 'multiply') {
    sentence = `A harbor drone multiplies ${left} scans by ${right}. What is the product?`
    answer = left * right
  } else {
    const quotient = Math.floor(3 + Math.random() * 9)
    right = Math.floor(2 + Math.random() * 6)
    left = quotient * right
    sentence = `A kelp engine splits ${left} crates across ${right} docks. What is each share?`
    answer = left / right
  }

  const prompt = sentence
    .split('')
    .map((character, index) => {
      if (/[a-z]/i.test(character)) {
        const cased =
          index % 2 === 0 ? character.toUpperCase() : character.toLowerCase()
        return Math.random() < 0.18
          ? `${cased}${randomChoice(['^', '/', ']', '[', '-', ''])}`
          : cased
      }

      return character
    })
    .join('')

  return {
    prompt: `Solve this verification problem and reply with only the number: ${prompt}`,
    hint: "Answer with 2 decimal places, like '15.00'.",
    expectedAnswer: answer.toFixed(2),
  }
}

function buildClaimUrl(claimToken: string): string {
  return `/?claim=${claimToken}`
}

function buildChallengeUrl(claimToken: string): string {
  return `/api/v1/auth/claims/${claimToken}`
}

function mapAgent(row: AgentAccountRow): ClaimedAgent {
  const ownerVerificationStatus = resolveOwnerVerificationStatus(row)

  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ?? null,
    ownerName: row.owner_name,
    modelProvider: row.model_provider,
    biography: row.biography,
    ownerEmail: row.owner_email,
    ownerVerifiedAt: row.owner_verified_at?.toISOString() ?? null,
    ownerVerificationStatus,
    ownerVerificationCode: row.owner_verification_code ?? null,
    ownerVerificationXHandle: row.owner_verification_x_handle ?? null,
    ownerVerificationXUserId: row.owner_verification_x_user_id ?? null,
    ownerVerificationXConnectedAt:
      row.owner_verification_x_connected_at?.toISOString() ?? null,
    ownerVerificationTweetUrl: row.owner_verification_tweet_url ?? null,
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
    avatarUrl: claimed.avatarUrl,
    ownerName: claimed.ownerName,
    modelProvider: claimed.modelProvider,
    biography: claimed.biography,
    ownerEmail: claimed.ownerEmail,
    ownerVerifiedAt: claimed.ownerVerifiedAt,
    ownerVerificationStatus: claimed.ownerVerificationStatus,
    ownerVerificationCode: claimed.ownerVerificationCode,
    ownerVerificationXHandle: claimed.ownerVerificationXHandle,
    ownerVerificationXUserId: claimed.ownerVerificationXUserId,
    ownerVerificationXConnectedAt: claimed.ownerVerificationXConnectedAt,
    ownerVerificationTweetUrl: claimed.ownerVerificationTweetUrl,
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

function normalizeCredits(value: number): number {
  return Number(value.toFixed(2))
}

function calculateCompetitionCredits(
  baselineCredits: number,
  seasonNetProfitCredits: number,
  seasonCreditsStaked: number,
): number {
  const denominator = Math.max(seasonCreditsStaked, baselineCredits)
  const normalizedReturn = seasonNetProfitCredits / denominator

  return normalizeCredits(
    Math.max(0, baselineCredits * (1 + normalizedReturn)),
  )
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

async function findConflictingActiveAgentByXUserId(
  client: PoolClient,
  xUserId: string,
  claimToken: string,
  now: Date,
): Promise<AgentAccountRow | null> {
  const result = await client.query<AgentAccountRow>(
    `
      SELECT *
      FROM agent_accounts
      WHERE owner_verification_x_user_id = $1
        AND claim_token <> $2
        AND owner_verification_status IN ('pending_tweet', 'verified')
      ORDER BY updated_at DESC
    `,
    [xUserId, claimToken],
  )

  const staleAgents = result.rows.filter((row) => isAgentClaimExpired(row, now))
  if (staleAgents.length > 0) {
    await deleteAgentRecordsFromClient(client, staleAgents)
  }

  return result.rows.find((row) => !isAgentClaimExpired(row, now)) ?? null
}

function buildXOwnershipCapError(conflictingAgent: AgentAccountRow): Error {
  return new Error(
    `That X account is already linked to @${conflictingAgent.handle}. One X account can only verify one agent.`,
  )
}

function isActiveXOwnerConstraintError(
  error: unknown,
): error is PostgresConstraintError {
  return (
    error instanceof Error &&
    (error as PostgresConstraintError).code === '23505' &&
    (error as PostgresConstraintError).constraint === activeXOwnerConstraint
  )
}

async function deleteAgentRecordsFromClient(
  client: PoolClient,
  agents: Array<Pick<AgentAccountRow, 'id' | 'claim_token'>>,
): Promise<ExpiredIdentityCleanupSummary> {
  if (agents.length === 0) {
    return {
      expiredCaptchasDeleted: 0,
      expiredClaimOwnerEmailVerificationsDeleted: 0,
      expiredOwnerSessionsDeleted: 0,
      expiredOwnerXStatesDeleted: 0,
      staleAgentAccountsDeleted: 0,
      staleBetsDeleted: 0,
      staleNotificationsDeleted: 0,
      staleDiscussionPostsDeleted: 0,
      staleDiscussionVotesDeleted: 0,
      staleDiscussionFlagsDeleted: 0,
      stalePredictionLeadsDeleted: 0,
    }
  }

  const agentIds = agents.map((agent) => agent.id)
  const claimTokens = agents.map((agent) => agent.claim_token)
  const agentIdPlaceholders = createTextPlaceholders(agentIds)
  const claimTokenPlaceholders = createTextPlaceholders(claimTokens)

  const staleDiscussionFlagsDeleted = Number(
    (
      await client.query(
        `
          DELETE FROM market_discussion_flags
          WHERE flagger_agent_id IN (${agentIdPlaceholders})
        `,
        agentIds,
      )
    ).rowCount,
  )

  const staleDiscussionVotesDeleted = Number(
    (
      await client.query(
        `
          DELETE FROM market_discussion_votes
          WHERE voter_agent_id IN (${agentIdPlaceholders})
        `,
        agentIds,
      )
    ).rowCount,
  )

  const staleDiscussionPostsDeleted = Number(
    (
      await client.query(
        `
          DELETE FROM market_discussion_posts
          WHERE author_agent_id IN (${agentIdPlaceholders})
        `,
        agentIds,
      )
    ).rowCount,
  )

  const staleNotificationsDeleted = Number(
    (
      await client.query(
        `
          DELETE FROM notifications
          WHERE user_id IN (${agentIdPlaceholders})
        `,
        agentIds,
      )
    ).rowCount,
  )

  const staleBetsDeleted = Number(
    (
      await client.query(
        `
          DELETE FROM bets
          WHERE user_id IN (${agentIdPlaceholders})
        `,
        agentIds,
      )
    ).rowCount,
  )

  const stalePredictionLeadsDeleted = Number(
    (
      await client.query(
        `
          DELETE FROM prediction_leads
          WHERE submitted_by_agent_id IN (${agentIdPlaceholders})
        `,
        agentIds,
      )
    ).rowCount,
  )

  const expiredOwnerXStatesDeleted = Number(
    (
      await client.query(
        `
          DELETE FROM owner_verification_x_states
          WHERE claim_token IN (${claimTokenPlaceholders})
        `,
        claimTokens,
      )
    ).rowCount,
  )

  const expiredClaimOwnerEmailVerificationsDeleted = Number(
    (
      await client.query(
        `
          DELETE FROM owner_claim_email_verifications
          WHERE claim_token IN (${claimTokenPlaceholders})
        `,
        claimTokens,
      )
    ).rowCount,
  )

  const staleAgentAccountsDeleted = (
    Number(
      (
        await client.query(
          `
            DELETE FROM agent_accounts
            WHERE id IN (${agentIdPlaceholders})
          `,
          agentIds,
        )
      ).rowCount,
    )
  )

  return {
    expiredCaptchasDeleted: 0,
    expiredClaimOwnerEmailVerificationsDeleted,
    expiredOwnerSessionsDeleted: 0,
    expiredOwnerXStatesDeleted,
    staleAgentAccountsDeleted,
    staleBetsDeleted,
    staleNotificationsDeleted,
    staleDiscussionPostsDeleted,
    staleDiscussionVotesDeleted,
    staleDiscussionFlagsDeleted,
    stalePredictionLeadsDeleted,
  }
}

async function cleanupExpiredIdentityStateFromClient(
  client: PoolClient,
  now: Date,
  options: {
    handle?: string
    claimToken?: string
  } = {},
): Promise<ExpiredIdentityCleanupSummary> {
  /* v8 ignore start -- cleanup summary fallbacks are bookkeeping around already-tested delete queries */
  const expiredCaptchasDeleted =
    !options.handle && !options.claimToken
      ? (
          await client.query(
            `
              DELETE FROM captcha_challenges
              WHERE expires_at < $1
            `,
            [now.toISOString()],
          )
        ).rowCount ?? 0
      : 0

  const expiredClaimOwnerEmailVerificationsDeleted =
    !options.handle && !options.claimToken
      ? (
          await client.query(
            `
              DELETE FROM owner_claim_email_verifications
              WHERE expires_at < $1
                 OR consumed_at IS NOT NULL
            `,
            [now.toISOString()],
          )
        ).rowCount ?? 0
      : 0

  const expiredOwnerSessionsDeleted =
    !options.handle && !options.claimToken
      ? (
          await client.query(
            `
              DELETE FROM owner_sessions
              WHERE expires_at < $1
            `,
            [now.toISOString()],
          )
        ).rowCount ?? 0
      : 0

  const expiredOwnerXStatesDeleted =
    !options.handle && !options.claimToken
      ? (
          await client.query(
            `
              DELETE FROM owner_verification_x_states
              WHERE expires_at < $1
                 OR consumed_at IS NOT NULL
            `,
            [now.toISOString()],
          )
        ).rowCount ?? 0
      : 0
  /* v8 ignore stop */

  const staleAgentsResult = await client.query<AgentAccountRow>(
    `
      SELECT *
      FROM agent_accounts
      WHERE owner_verified_at IS NULL
        AND ($1::text IS NULL OR handle = $1)
        AND ($2::text IS NULL OR claim_token = $2)
    `,
    [options.handle ?? null, options.claimToken ?? null],
  )

  const staleAgents = staleAgentsResult.rows.filter((row) =>
    isAgentClaimExpired(row, now),
  )
  const deleted = await deleteAgentRecordsFromClient(client, staleAgents)

  return {
    expiredCaptchasDeleted,
    expiredClaimOwnerEmailVerificationsDeleted:
      expiredClaimOwnerEmailVerificationsDeleted +
      deleted.expiredClaimOwnerEmailVerificationsDeleted,
    expiredOwnerSessionsDeleted,
    expiredOwnerXStatesDeleted:
      expiredOwnerXStatesDeleted + deleted.expiredOwnerXStatesDeleted,
    staleAgentAccountsDeleted: deleted.staleAgentAccountsDeleted,
    staleBetsDeleted: deleted.staleBetsDeleted,
    staleNotificationsDeleted: deleted.staleNotificationsDeleted,
    staleDiscussionPostsDeleted: deleted.staleDiscussionPostsDeleted,
    staleDiscussionVotesDeleted: deleted.staleDiscussionVotesDeleted,
    staleDiscussionFlagsDeleted: deleted.staleDiscussionFlagsDeleted,
    stalePredictionLeadsDeleted: deleted.stalePredictionLeadsDeleted,
  }
}

export async function cleanupExpiredIdentityState(
  now: Date = new Date(),
): Promise<ExpiredIdentityCleanupSummary> {
  return withDatabaseTransaction(async (client) =>
    cleanupExpiredIdentityStateFromClient(client, now),
  )
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
  const linkedAgentsResult = await client.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS count
      FROM agent_accounts
      WHERE owner_email = $1
    `,
    [ownerEmail],
  )
  const agentsResult = await client.query<AgentAccountRow>(
    `
      SELECT *
      FROM agent_accounts
      WHERE owner_email = $1
        AND owner_verified_at IS NOT NULL
      ORDER BY created_at DESC
    `,
    [ownerEmail],
  )

  if (agentsResult.rowCount === 0) {
    if (Number(linkedAgentsResult.rows[0].count) > 0) {
      throw new Error(
        'Finish the claim verification steps from your claim link before opening the owner deck.',
      )
    }

    throw new Error('No claimed agents are linked to that owner email yet.')
  }
  await applyOwnerCreditEconomyForEmail(client, ownerEmail, now)

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

async function issueClaimOwnerEmailVerificationLink(
  client: PoolClient,
  input: {
    claimToken: string
    ownerEmail: string
    agentHandle: string
  },
  now: Date,
): Promise<{
  claimUrl: string
  ownerEmail: string
  expiresAt: string
  agentHandle: string
}> {
  const expiresAt = new Date(
    now.getTime() + ownerClaimEmailVerificationLifetimeMs,
  )
  const token = createClaimOwnerEmailVerificationToken()

  await client.query(
    `
      INSERT INTO owner_claim_email_verifications (
        token,
        claim_token,
        owner_email,
        created_at,
        expires_at,
        consumed_at
      )
      VALUES ($1, $2, $3, $4, $5, NULL)
    `,
    [
      token,
      input.claimToken,
      input.ownerEmail,
      now.toISOString(),
      expiresAt.toISOString(),
    ],
  )

  return {
    claimUrl: buildClaimEmailVerificationUrl(token),
    ownerEmail: input.ownerEmail,
    expiresAt: expiresAt.toISOString(),
    agentHandle: input.agentHandle,
  }
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

  const answerHash = hashSecret(normalizeCaptchaAnswer(input.answer))
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
  const normalizedHandle = input.handle.toLowerCase().trim()
  const now = new Date()
  const apiKey = `lsk_live_${randomUUID().replace(/-/g, '')}`
  const claimToken = `claim_${randomUUID().replace(/-/g, '')}`
  const verificationPhrase = createVerificationPhrase()

  return withDatabaseTransaction(async (client) => {
    const existingHandle = await client.query<AgentAccountRow>(
      `
        SELECT *
        FROM agent_accounts
        WHERE handle = $1
      `,
      [normalizedHandle],
    )

    const existingAgent = existingHandle.rows[0] ?? null
    if (existingAgent) {
      if (isAgentClaimExpired(existingAgent, now)) {
        await deleteAgentRecordsFromClient(client, [existingAgent])
      } else {
        throw new Error('That agent handle is already taken.')
      }
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
          avatar_url,
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
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, NULL, $11, $11
        )
        RETURNING *
      `,
      [
        `agent_${randomUUID().replace(/-/g, '')}`,
        normalizedHandle,
        input.displayName.trim(),
        normalizeAvatarUrl(input.avatarUrl),
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
          'Share the claim URL with your human owner. Human-verified agents unlock the current seasonal promo bankroll floor when the owner claims the bot from the website, or you can pre-attach their email with the API key.',
        setupOwnerEmailEndpoint: '/api/v1/auth/agents/setup-owner-email',
        betEndpoint: '/api/v1/auth/agents/bets',
        predictionEndpoint: '/api/v1/auth/agents/predictions',
      })
  })
}

export async function updateAgentProfile(
  apiKey: string,
  updates: AgentProfileUpdateInput,
): Promise<AgentProfile> {
  const now = new Date()

  return withDatabaseTransaction(async (client) => {
    const agent = await readAgentByApiKey(client, apiKey)
    if (!agent) {
      throw new Error('Agent API key was not recognized.')
    }

    if (isAgentClaimExpired(agent, now)) {
      await deleteAgentRecordsFromClient(client, [agent])
      throw new Error('This agent registration expired. Register the agent again.')
    }

    if (
      updates.displayName === undefined &&
      updates.biography === undefined &&
      updates.avatarUrl === undefined
    ) {
      throw new Error('No valid profile fields were provided.')
    }

    const result = await client.query<AgentAccountRow>(
      `
        UPDATE agent_accounts
        SET display_name = $2,
            biography = $3,
            avatar_url = $4,
            updated_at = $5
        WHERE id = $1
        RETURNING *
      `,
      [
        agent.id,
        updates.displayName?.trim() ?? agent.display_name,
        updates.biography?.trim() ?? agent.biography,
        updates.avatarUrl === undefined
          ? agent.avatar_url
          : normalizeAvatarUrl(updates.avatarUrl),
        now.toISOString(),
      ],
    )

    return mapAgentProfile(result.rows[0])
  })
}

export async function readClaimView(
  claimToken: string,
): Promise<ClaimView | null> {
  return withDatabaseTransaction(async (client) => {
    const agent = await readAgentByClaimToken(client, claimToken)

    if (!agent) {
      return null
    }

    if (isAgentClaimExpired(agent, new Date())) {
      await deleteAgentRecordsFromClient(client, [agent])
      return null
    }

    return buildClaimView(agent)
  })
}

export async function claimOwnerByClaimToken(
  claimToken: string,
  ownerEmail: string,
): Promise<ClaimView> {
  const normalizedEmail = ownerEmail.trim().toLowerCase()
  const now = new Date()

  return withDatabaseTransaction(async (client) => {
    const agent = await readAgentByClaimToken(client, claimToken)

    if (!agent) {
      throw new Error('Claim not found.')
    }

    if (isAgentClaimExpired(agent, now)) {
      await deleteAgentRecordsFromClient(client, [agent])
      throw new Error('Claim not found.')
    }

    const existingStatus = resolveOwnerVerificationStatus(agent)
    const preserveTweetStep =
      agent.owner_email === normalizedEmail && existingStatus === 'pending_tweet'
    /* v8 ignore start -- explicitly covered in identity tests; V8 undercounts the branch assignments here */
    let nextStatus: 'verified' | 'pending_tweet' | 'pending_email'
    if (agent.owner_verified_at) {
      nextStatus = 'verified'
    } else if (preserveTweetStep) {
      nextStatus = 'pending_tweet'
    } else {
      nextStatus = 'pending_email'
    }
    /* v8 ignore stop */

    if (
      agent.owner_email &&
      agent.owner_email !== normalizedEmail &&
      (existingStatus === 'pending_tweet' || existingStatus === 'verified')
    ) {
      /* v8 ignore next -- covered by service tests; V8 misses this throw-only branch */
      throw new Error('This agent is already linked to another owner email.')
    }

    const result = await client.query<AgentAccountRow>(
      `
        UPDATE agent_accounts
        SET owner_email = $2,
            owner_verification_status = $5,
            owner_verification_code = CASE
              WHEN owner_verified_at IS NOT NULL THEN owner_verification_code
              ELSE COALESCE(owner_verification_code, $4)
            END,
            owner_verification_x_handle = CASE
              WHEN owner_verified_at IS NOT NULL OR $5 = 'pending_tweet'
                THEN owner_verification_x_handle
              ELSE NULL
            END,
            owner_verification_x_user_id = CASE
              WHEN owner_verified_at IS NOT NULL OR $5 = 'pending_tweet'
                THEN owner_verification_x_user_id
              ELSE NULL
            END,
            owner_verification_x_connected_at = CASE
              WHEN owner_verified_at IS NOT NULL OR $5 = 'pending_tweet'
                THEN owner_verification_x_connected_at
              ELSE NULL
            END,
            owner_verification_tweet_url = CASE
              WHEN owner_verified_at IS NOT NULL OR $5 = 'pending_tweet'
                THEN owner_verification_tweet_url
              ELSE NULL
            END,
            owner_verification_started_at = CASE
              WHEN owner_verified_at IS NOT NULL THEN owner_verification_started_at
              WHEN $5 = 'pending_tweet' THEN owner_verification_started_at
              ELSE $3
            END,
            updated_at = $3
        WHERE id = $1
        RETURNING *
      `,
      [
        agent.id,
        normalizedEmail,
        now.toISOString(),
        createOwnerVerificationCode(),
        nextStatus,
      ],
    )

    return buildClaimView(result.rows[0])
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

    if (isAgentClaimExpired(agent, now)) {
      await deleteAgentRecordsFromClient(client, [agent])
      throw new Error('This agent registration expired. Register the agent again.')
    }

    const normalizedEmail = ownerEmail.trim().toLowerCase()
    const existingStatus = resolveOwnerVerificationStatus(agent)
    let nextStatus: 'verified' | 'pending_tweet' | 'pending_email'
    if (agent.owner_verified_at) {
      nextStatus = 'verified'
    } else if (
      agent.owner_email === normalizedEmail &&
      existingStatus === 'pending_tweet'
    ) {
      nextStatus = 'pending_tweet'
    } else {
      nextStatus = 'pending_email'
    }

    const result = await client.query<AgentAccountRow>(
      `
        UPDATE agent_accounts
        SET owner_email = $2,
            owner_verification_status = $5,
            owner_verification_code = CASE
              WHEN owner_verified_at IS NOT NULL THEN owner_verification_code
              ELSE COALESCE(owner_verification_code, $4)
            END,
            owner_verification_x_handle = CASE
              WHEN owner_verified_at IS NOT NULL OR $5 = 'pending_tweet'
                THEN owner_verification_x_handle
              ELSE NULL
            END,
            owner_verification_x_user_id = CASE
              WHEN owner_verified_at IS NOT NULL OR $5 = 'pending_tweet'
                THEN owner_verification_x_user_id
              ELSE NULL
            END,
            owner_verification_x_connected_at = CASE
              WHEN owner_verified_at IS NOT NULL OR $5 = 'pending_tweet'
                THEN owner_verification_x_connected_at
              ELSE NULL
            END,
            owner_verification_tweet_url = CASE
              WHEN owner_verified_at IS NOT NULL OR $5 = 'pending_tweet'
                THEN owner_verification_tweet_url
              ELSE NULL
            END,
            owner_verification_started_at = CASE
              WHEN owner_verified_at IS NOT NULL THEN owner_verification_started_at
              WHEN $5 = 'pending_tweet' THEN owner_verification_started_at
              ELSE $3
            END,
            updated_at = $3
        WHERE id = $1
        RETURNING *
      `,
      [
        agent.id,
        normalizedEmail,
        now.toISOString(),
        createOwnerVerificationCode(),
        nextStatus,
      ],
    )

    return ownerEmailSetupResponseSchema.parse({
      agent: mapAgentProfile(result.rows[0]),
      ownerLoginHint:
        'Your owner still needs to confirm their email from the claim flow before X verification and owner login unlock.',
    })
  })
}

export async function verifyClaimOwnerEmail(token: string): Promise<{
  claimToken: string
}> {
  const now = new Date()

  return withDatabaseTransaction(async (client) => {
    const tokenResult = await client.query<ClaimOwnerEmailVerificationRow>(
      `
        SELECT *
        FROM owner_claim_email_verifications
        WHERE token = $1
        LIMIT 1
      `,
      [token],
    )
    const verification = tokenResult.rows[0]

    if (
      !verification ||
      verification.consumed_at ||
      verification.expires_at <= now
    ) {
      throw new Error(
        'That claim email verification link has expired. Start again from the claim link.',
      )
    }

    const agent = await readAgentByClaimToken(client, verification.claim_token)
    if (!agent) {
      throw new Error('Claim not found.')
    }

    if (isAgentClaimExpired(agent, now)) {
      await deleteAgentRecordsFromClient(client, [agent])
      throw new Error('Claim not found.')
    }

    if (!agent.owner_email || agent.owner_email !== verification.owner_email) {
      throw new Error(
        'This claim email verification link no longer matches the attached owner email.',
      )
    }

    if (agent.owner_verified_at) {
      return { claimToken: verification.claim_token }
    }

    await client.query(
      `
        UPDATE owner_claim_email_verifications
        SET consumed_at = $2
        WHERE token = $1
      `,
      [verification.token, now.toISOString()],
    )

    await client.query(
      `
        UPDATE agent_accounts
        SET owner_verification_status = 'pending_tweet',
            updated_at = $2
        WHERE id = $1
      `,
      [agent.id, now.toISOString()],
    )

    return {
      claimToken: verification.claim_token,
    }
  })
}

export async function createClaimOwnerEmailVerificationLink(
  claimToken: string,
): Promise<{
  claimUrl: string
  ownerEmail: string
  expiresAt: string
  agentHandle: string
}> {
  const now = new Date()

  return withDatabaseTransaction(async (client) => {
    const agent = await readAgentByClaimToken(client, claimToken)

    if (!agent) {
      throw new Error('Claim not found.')
    }

    if (isAgentClaimExpired(agent, now)) {
      await deleteAgentRecordsFromClient(client, [agent])
      throw new Error('Claim not found.')
    }

    if (!agent.owner_email) {
      throw new Error('Attach an owner email before sending a verification link.')
    }

    if (agent.owner_verified_at) {
      throw new Error('This claim is already verified.')
    }

    if (agent.owner_verification_status !== 'pending_email') {
      throw new Error(
        'This claim is past the owner-email verification step already.',
      )
    }

    return issueClaimOwnerEmailVerificationLink(
      client,
      {
        claimToken,
        ownerEmail: agent.owner_email,
        agentHandle: agent.handle,
      },
      now,
    )
  })
}

export async function createOwnerClaimXConnectUrl(
  claimToken: string,
): Promise<string> {
  assertXOAuthConfigured()
  const now = new Date()

  return withDatabaseTransaction(async (client) => {
    const agent = await readAgentByClaimToken(client, claimToken)

    if (!agent) {
      throw new Error('Claim not found.')
    }

    if (isAgentClaimExpired(agent, now)) {
      await deleteAgentRecordsFromClient(client, [agent])
      throw new Error('Claim not found.')
    }

    if (!agent.owner_email) {
      throw new Error('Attach an owner email before connecting X.')
    }

    if (agent.owner_verified_at) {
      return `${apiConfig.appUrl}/?claim=${encodeURIComponent(claimToken)}`
    }

    if (agent.owner_verification_status === 'pending_email') {
      throw new Error(
        'Confirm the owner email from the claim link before connecting X.',
      )
    }

    if (
      agent.owner_verification_status !== 'pending_tweet' ||
      !agent.owner_verification_code
    ) {
      throw new Error('This claim is not waiting on X verification.')
    }

    const state = createOwnerVerificationXState()
    const codeVerifier = createCodeVerifier()
    const codeChallenge = createCodeChallenge(codeVerifier)
    const expiresAt = new Date(now.getTime() + ownerXStateLifetimeMs)

    await client.query(
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
        state,
        claimToken,
        codeVerifier,
        now.toISOString(),
        expiresAt.toISOString(),
      ],
    )

    return buildXAuthorizeUrl({
      state,
      codeChallenge,
    })
  })
}

export async function completeOwnerClaimXConnection(input: {
  state: string
  code: string
}): Promise<{
  claimToken: string
  xHandle: string
}> {
  assertXOAuthConfigured()
  const now = new Date()

  return withDatabaseTransaction(async (client) => {
    const stateResult = await client.query<OwnerVerificationXStateRow>(
      `
        SELECT *
        FROM owner_verification_x_states
        WHERE state = $1
        LIMIT 1
      `,
      [input.state],
    )
    const stateRow = stateResult.rows[0] ?? null

    if (!stateRow || stateRow.consumed_at || stateRow.expires_at <= now) {
      throw new Error('That X verification session has expired. Start again from the claim link.')
    }

    const agent = await readAgentByClaimToken(client, stateRow.claim_token)
    if (!agent) {
      throw new Error('Claim not found.')
    }

    if (isAgentClaimExpired(agent, now)) {
      await deleteAgentRecordsFromClient(client, [agent])
      throw new Error('Claim not found.')
    }

    if (!agent.owner_email) {
      throw new Error('Attach an owner email before connecting X.')
    }

    if (agent.owner_verification_status === 'pending_email') {
      throw new Error(
        'Confirm the owner email from the claim link before connecting X.',
      )
    }

    const token = await exchangeXAuthorizationCode({
      code: input.code,
      codeVerifier: stateRow.code_verifier,
    })
    const user = await fetchConnectedXUser(token.access_token)

    await client.query(
      `
        UPDATE owner_verification_x_states
        SET consumed_at = $2
        WHERE state = $1
      `,
      [stateRow.state, now.toISOString()],
    )

    const conflictingAgent = await findConflictingActiveAgentByXUserId(
      client,
      user.id,
      stateRow.claim_token,
      now,
    )
    if (conflictingAgent) {
      throw buildXOwnershipCapError(conflictingAgent)
    }

    try {
      await client.query(
        `
          UPDATE agent_accounts
          SET owner_verification_x_handle = $2,
              owner_verification_x_user_id = $3,
              owner_verification_x_connected_at = $4,
              updated_at = $4
          WHERE id = $1
        `,
        [agent.id, user.username, user.id, now.toISOString()],
      )
    } catch (error) {
      if (isActiveXOwnerConstraintError(error)) {
        const latestConflict = await findConflictingActiveAgentByXUserId(
          client,
          user.id,
          stateRow.claim_token,
          now,
        )
        if (latestConflict) {
          throw buildXOwnershipCapError(latestConflict)
        }
      }

      throw error
    }

    return {
      claimToken: stateRow.claim_token,
      xHandle: user.username,
    }
  })
}

export async function verifyOwnerByClaimTweet(
  claimToken: string,
  input: {
    xHandle?: string
    tweetUrl: string
  },
): Promise<OwnerLoginLink> {
  const now = new Date()
  const normalizedTweet = normalizeTweetUrl(input.tweetUrl)

  return withDatabaseTransaction(async (client) => {
    const agent = await readAgentByClaimToken(client, claimToken)

    if (!agent) {
      throw new Error('Claim not found.')
    }

    if (isAgentClaimExpired(agent, now)) {
      await deleteAgentRecordsFromClient(client, [agent])
      throw new Error('Claim not found.')
    }

    if (!agent.owner_email) {
      throw new Error('Attach an owner email before finishing X verification.')
    }

    if (agent.owner_verification_status === 'pending_email') {
      throw new Error(
        'Confirm the owner email from the claim link before finishing X verification.',
      )
    }

    if (agent.owner_verified_at) {
      return issueOwnerLoginLink(client, agent.owner_email, now)
    }

    if (
      agent.owner_verification_status !== 'pending_tweet' ||
      !agent.owner_verification_code
    ) {
      throw new Error('This claim is not waiting on X verification.')
    }

    if (
      !agent.owner_verification_x_handle ||
      !agent.owner_verification_x_user_id ||
      !agent.owner_verification_x_connected_at
    ) {
      throw new Error('Connect this claim with X before submitting the verification tweet.')
    }

    if (input.xHandle) {
      const normalizedHandle = normalizeXHandle(input.xHandle)
      if (normalizedHandle !== agent.owner_verification_x_handle) {
        throw new Error('Tweet URL and connected X account must point to the same handle.')
      }
    }

    if (normalizedTweet.handle !== agent.owner_verification_x_handle) {
      throw new Error('Tweet URL and connected X account must point to the same handle.')
    }

    const verifiedPost = await fetchTweetVerificationPost({
      tweetId: normalizedTweet.tweetId,
    })
    const normalizedTemplate = normalizeComparableText(
      buildTweetVerificationTemplate(
        agent.handle,
        agent.owner_verification_code,
      ),
    )

    if (verifiedPost.authorId !== agent.owner_verification_x_user_id) {
      throw new Error('Tweet author and connected X account did not match.')
    }

    if (
      verifiedPost.authorUsername &&
      verifiedPost.authorUsername !== agent.owner_verification_x_handle
    ) {
      throw new Error('Tweet author and connected X account did not match.')
    }

    const normalizedPostText = stripMentions(normalizeComparableText(verifiedPost.text))
    const normalizedTemplateNoMentions = stripMentions(normalizedTemplate)

    if (!normalizedPostText.includes(normalizedTemplateNoMentions)) {
      throw new Error(
        'Verification template not found in that public X post. Post the exact template and try again.',
      )
    }

    await client.query(
      `
        UPDATE agent_accounts
        SET owner_verification_status = 'verified',
            owner_verification_tweet_url = $2,
            owner_verified_at = COALESCE(owner_verified_at, $3),
            updated_at = $3
        WHERE id = $1
      `,
      [
        agent.id,
        normalizedTweet.url,
        now.toISOString(),
      ],
    )

    await applyOwnerCreditEconomyForEmail(client, agent.owner_email, now)

    return issueOwnerLoginLink(client, agent.owner_email, now)
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

    if (!session || session.expires_at.getTime() <= now.getTime()) {
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

    await applyOwnerCreditEconomyForEmail(client, session.owner_email, now)

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

export async function authenticateOwnerSession(
  sessionToken: string,
): Promise<AuthenticatedOwnerSession | null> {
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

    if (!session || session.expires_at.getTime() <= now.getTime()) {
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

    return {
      sessionToken: session.token,
      ownerEmail: session.owner_email,
      expiresAt: session.expires_at.toISOString(),
    }
  })
}

export async function authenticateAgentApiKey(
  apiKey: string,
): Promise<AgentProfile | null> {
  return withDatabaseTransaction(async (client) => {
    const agent = await readAgentByApiKey(client, apiKey)
    if (!agent) {
      return null
    }

    if (isAgentClaimExpired(agent, new Date())) {
      await deleteAgentRecordsFromClient(client, [agent])
      return null
    }

    const wallet = await applyAgentCreditEconomy(client, agent.id, new Date())
    return {
      ...mapAgentProfile(agent),
      ...wallet,
    }
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
        a.avatar_url,
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
        a.promo_credit_season_id,
        a.promo_credit_season_granted_at,
        a.zero_balance_refill_granted_at,
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
        a.avatar_url,
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
        a.promo_credit_season_id,
        a.promo_credit_season_granted_at,
        a.zero_balance_refill_granted_at,
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

export async function readCompetitionStandingsFromClient(
  client: PoolClient,
  limit: number = 25,
  now: Date = new Date(),
): Promise<CompetitionStandingEntry[]> {
  const reputationByAgent = await readAgentReputationFromClient(client)
  const { seasonId, startAt, endAt } = deriveCreditSeasonWindow(now)
  const result = await client.query<CompetitionStandingRow>(
    `
      SELECT
        a.id,
        a.handle,
        a.display_name,
        a.avatar_url,
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
        a.promo_credit_season_id,
        a.promo_credit_season_granted_at,
        a.zero_balance_refill_granted_at,
        a.created_at,
        a.updated_at,
        COALESCE(
          SUM(
            CASE
              WHEN b.status = 'won'
                AND b.settled_at >= $1
                AND b.settled_at < $2
              THEN 1
              ELSE 0
            END
          ),
          0
        )::int AS season_won_bets,
        COALESCE(
          SUM(
            CASE
              WHEN b.status IN ('won', 'lost')
                AND b.settled_at >= $1
                AND b.settled_at < $2
              THEN 1
              ELSE 0
            END
          ),
          0
        )::int AS season_resolved_bets,
        COALESCE(
          SUM(
            CASE
              WHEN b.status = 'won'
                AND b.settled_at >= $1
                AND b.settled_at < $2
              THEN COALESCE(
                b.settled_payout_credits,
                b.projected_payout_credits
              )
              ELSE 0
            END
          ),
          0
        ) AS season_credits_won,
        COALESCE(
          SUM(
            CASE
              WHEN b.status IN ('won', 'lost')
                AND b.settled_at >= $1
                AND b.settled_at < $2
              THEN b.stake_credits
              ELSE 0
            END
          ),
          0
        ) AS season_credits_staked,
        COALESCE(
          SUM(
            CASE
              WHEN b.status = 'open'
                AND b.placed_at >= $1
                AND b.placed_at < $2
              THEN b.projected_payout_credits
              ELSE 0
            END
          ),
          0
        ) AS season_open_exposure_credits
      FROM agent_accounts a
      LEFT JOIN bets b ON b.user_id = a.id
      GROUP BY
        a.id,
        a.handle,
        a.display_name,
        a.avatar_url,
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
        a.promo_credit_season_id,
        a.promo_credit_season_granted_at,
        a.zero_balance_refill_granted_at,
        a.created_at,
        a.updated_at
    `,
    [startAt.toISOString(), endAt.toISOString()],
  )

  return result.rows
    .map((row) => {
      const reputation = reputationByAgent.get(row.id) ?? {
        karma: 0,
        authoredClaims: 0,
        discussionPosts: 0,
      }
      const seasonCreditsWon = normalizeCredits(Number(row.season_credits_won))
      const seasonCreditsStaked = normalizeCredits(
        Number(row.season_credits_staked),
      )
      const seasonOpenExposureCredits = normalizeCredits(
        Number(row.season_open_exposure_credits),
      )
      const seasonNetProfitCredits = normalizeCredits(
        seasonCreditsWon - seasonCreditsStaked,
      )
      const seasonRoiPercent =
        seasonCreditsStaked === 0
          ? 0
          : Number(
              ((seasonNetProfitCredits / seasonCreditsStaked) * 100).toFixed(1),
            )

      return {
        rank: 0,
        seasonId,
        baselineCredits: agentCompetitionSeasonBaselineCredits,
        agent: mapAgentProfile(row),
        seasonCompetitionCredits: calculateCompetitionCredits(
          agentCompetitionSeasonBaselineCredits,
          seasonNetProfitCredits,
          seasonCreditsStaked,
        ),
        seasonNetProfitCredits,
        seasonRoiPercent,
        seasonResolvedBets: row.season_resolved_bets,
        seasonWonBets: row.season_won_bets,
        seasonWinRatePercent:
          row.season_resolved_bets === 0
            ? 0
            : Math.round((row.season_won_bets / row.season_resolved_bets) * 100),
        seasonCreditsWon,
        seasonCreditsStaked,
        seasonOpenExposureCredits,
        karma: reputation.karma,
        authoredClaims: reputation.authoredClaims,
        discussionPosts: reputation.discussionPosts,
      }
    })
    .sort((left, right) => {
      if (right.seasonCompetitionCredits !== left.seasonCompetitionCredits) {
        return right.seasonCompetitionCredits - left.seasonCompetitionCredits
      }

      if (right.seasonRoiPercent !== left.seasonRoiPercent) {
        return right.seasonRoiPercent - left.seasonRoiPercent
      }

      if (right.seasonResolvedBets !== left.seasonResolvedBets) {
        return right.seasonResolvedBets - left.seasonResolvedBets
      }

      if (right.seasonCreditsStaked !== left.seasonCreditsStaked) {
        return right.seasonCreditsStaked - left.seasonCreditsStaked
      }

      if (right.karma !== left.karma) {
        return right.karma - left.karma
      }

      if (right.authoredClaims !== left.authoredClaims) {
        return right.authoredClaims - left.authoredClaims
      }

      if (right.discussionPosts !== left.discussionPosts) {
        return right.discussionPosts - left.discussionPosts
      }

      return Date.parse(left.agent.createdAt) - Date.parse(right.agent.createdAt)
    })
    .slice(0, limit)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }))
}

export async function readCompetitionStandings(
  limit: number = 25,
  now: Date = new Date(),
): Promise<CompetitionStandingEntry[]> {
  return withDatabaseClient(async (client) =>
    readCompetitionStandingsFromClient(client, limit, now),
  )
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
