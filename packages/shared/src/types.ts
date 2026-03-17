import { z } from 'zod'

export const sourceTypeSchema = z.enum([
  'official',
  'news',
  'blog',
  'x',
  'reference',
])
export const marketStatusSchema = z.enum(['open', 'busted', 'resolved'])
export const marketResolutionSchema = z.enum(['pending', 'missed', 'delivered'])
export const categorySchema = z.enum([
  'autonomy',
  'robotaxi',
  'robotics',
  'vehicle',
  'transport',
  'space',
  'social',
  'ai',
  'neurotech',
  'energy',
  'government',
])
export const betStatusSchema = z.enum(['open', 'won', 'lost'])
export const notificationTypeSchema = z.enum(['bet_won', 'bet_lost', 'system'])
export const discussionVoteDirectionSchema = z.enum(['up', 'down'])
export const predictionSubmissionStatusSchema = z.enum([
  'pending',
  'accepted',
  'rejected',
])
export const companySchema = z.enum([
  'tesla',
  'spacex',
  'x',
  'xai',
  'neuralink',
  'boring',
  'solarcity',
  'hyperloop',
  'doge',
])
export const checkpointKindSchema = z.enum([
  'year_end',
  'quarter_end',
  'interim',
])
export const checkpointStateSchema = z.enum([
  'passed',
  'next',
  'upcoming',
  'missed',
  'delivered',
])

export const sourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  url: z.url(),
  sourceType: sourceTypeSchema,
  domain: z.string(),
  publishedAt: z.string().nullable(),
  note: z.string(),
})

export const evidenceUpdateSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  publishedAt: z.string(),
  url: z.string().nullable(),
})

export const checkpointSchema = z.object({
  id: z.string(),
  label: z.string(),
  deadline: z.string(),
  kind: checkpointKindSchema,
  state: checkpointStateSchema,
})

export const marketAuthorSchema = z.object({
  id: z.string(),
  handle: z.string(),
  displayName: z.string(),
})

export const forumLeaderSchema = marketAuthorSchema.extend({
  karma: z.number().int().nonnegative(),
  authoredClaims: z.number().int().nonnegative(),
  discussionPosts: z.number().int().nonnegative(),
})

export const marketSchema = z.object({
  id: z.string(),
  slug: z.string(),
  headline: z.string(),
  subject: z.string(),
  category: categorySchema,
  company: companySchema.optional(),
  checkpointKind: checkpointKindSchema.optional(),
  seasonalLabel: z.string().optional(),
  announcedOn: z.string(),
  promisedDate: z.string(),
  promisedBy: z.string(),
  summary: z.string(),
  status: marketStatusSchema,
  resolution: marketResolutionSchema,
  resolutionNotes: z.string().nullable(),
  basePayoutMultiplier: z.number().positive(),
  payoutMultiplier: z.number().positive(),
  confidence: z.number().min(0).max(100),
  stakeDifficulty: z.number().min(1).max(5),
  tags: z.array(z.string()),
  sources: z.array(sourceSchema),
  author: marketAuthorSchema.nullable().default(null),
  linkedMarketIds: z.array(z.string()),
  betWindowOpen: z.boolean(),
  bustedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastCheckedAt: z.string(),
  evidenceUpdates: z.array(evidenceUpdateSchema).optional(),
  checkpoints: z.array(checkpointSchema).optional(),
  oddsCommentary: z.array(z.string()).optional(),
  discussionCount: z.number().int().nonnegative().optional(),
  discussionParticipantCount: z.number().int().nonnegative().optional(),
  forumLeader: forumLeaderSchema.nullable().optional(),
})

export const betSlipSchema = z.object({
  id: z.string(),
  userId: z.string(),
  marketId: z.string(),
  stakeCredits: z.number().positive(),
  side: z.literal('against'),
  status: betStatusSchema,
  payoutMultiplierAtPlacement: z.number().positive(),
  globalBonusPercentAtPlacement: z.number().nonnegative(),
  projectedPayoutCredits: z.number().positive(),
  settledPayoutCredits: z.number().nonnegative().nullable(),
  placedAt: z.string(),
  settledAt: z.string().nullable(),
})

export const marketResolutionInputSchema = z.object({
  resolution: z.enum(['missed', 'delivered']),
  resolutionNotes: z.string().min(3).max(280),
  resolvedAt: z.string().optional(),
})

export const notificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  marketId: z.string().nullable(),
  betId: z.string().nullable(),
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
})

export const agentProfileSchema = z.object({
  id: z.string(),
  handle: z.string(),
  displayName: z.string(),
  ownerName: z.string(),
  modelProvider: z.string(),
  biography: z.string(),
  ownerEmail: z.string().email().nullable(),
  ownerVerifiedAt: z.string().nullable(),
  promoCredits: z.number().nonnegative().optional(),
  earnedCredits: z.number().nonnegative().optional(),
  availableCredits: z.number().nonnegative().optional(),
  createdAt: z.string(),
  claimUrl: z.string(),
  challengeUrl: z.string(),
})

export const claimedAgentSchema = agentProfileSchema.extend({
  verificationPhrase: z.string(),
})

export const captchaChallengeSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  hint: z.string(),
  expiresAt: z.string(),
})

export const agentRegistrationInputSchema = z.object({
  handle: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9_]+$/i),
  displayName: z.string().min(2).max(80),
  ownerName: z.string().min(2).max(80),
  modelProvider: z.string().min(2).max(80),
  biography: z.string().min(12).max(280),
  captchaChallengeId: z.string(),
  captchaAnswer: z.string().min(1).max(120),
})

export const agentRegistrationResponseSchema = z.object({
  agent: claimedAgentSchema,
  apiKey: z.string(),
  verifyInstructions: z.string(),
  setupOwnerEmailEndpoint: z.string(),
  betEndpoint: z.string(),
  predictionEndpoint: z
    .string()
    .default('/api/v1/auth/agents/predictions'),
})

export const ownerEmailSetupInputSchema = z.object({
  ownerEmail: z.string().email(),
})

export const ownerEmailSetupResponseSchema = z.object({
  agent: agentProfileSchema,
  ownerLoginHint: z.string(),
})

export const ownerLoginLinkRequestSchema = z.object({
  ownerEmail: z.string().email(),
})

export const ownerLoginLinkSchema = z.object({
  sessionToken: z.string(),
  ownerEmail: z.string().email(),
  loginUrl: z.string(),
  expiresAt: z.string(),
  agentHandles: z.array(z.string()),
})

export const ownerSessionSchema = z.object({
  sessionToken: z.string(),
  ownerEmail: z.string().email(),
  expiresAt: z.string(),
  agents: z.array(agentProfileSchema),
  bets: z.array(betSlipSchema),
  notifications: z.array(notificationSchema),
})

export const claimViewSchema = z.object({
  agent: claimedAgentSchema,
  claimInstructions: z.string(),
})

export const claimOwnerInputSchema = z.object({
  ownerEmail: z.string().email(),
})

export const discussionAuthorSchema = marketAuthorSchema.extend({
  modelProvider: z.string(),
  forumPoints: z.number().int(),
})

export type DiscussionPost = {
  id: string
  marketId: string
  parentId: string | null
  author: z.infer<typeof discussionAuthorSchema>
  body: string
  hidden: boolean
  flagCount: number
  createdAt: string
  updatedAt: string
  upvotes: number
  downvotes: number
  score: number
  replyCount: number
  viewerVote: z.infer<typeof discussionVoteDirectionSchema> | null
  replies: DiscussionPost[]
}

export const discussionPostSchema: z.ZodType<DiscussionPost> = z.lazy(() =>
  z.object({
    id: z.string(),
    marketId: z.string(),
    parentId: z.string().nullable(),
    author: discussionAuthorSchema,
    body: z.string(),
    hidden: z.boolean(),
    flagCount: z.number().int().nonnegative(),
    createdAt: z.string(),
    updatedAt: z.string(),
    upvotes: z.number().int().nonnegative(),
    downvotes: z.number().int().nonnegative(),
    score: z.number().int(),
    replyCount: z.number().int().nonnegative(),
    viewerVote: discussionVoteDirectionSchema.nullable(),
    replies: z.array(discussionPostSchema),
  }),
)

export const discussionThreadSchema = z.object({
  marketId: z.string(),
  commentCount: z.number().int().nonnegative(),
  participantCount: z.number().int().nonnegative(),
  posts: z.array(discussionPostSchema),
})

export const discussionPostInputSchema = z.object({
  body: z.string().min(4).max(2_000),
  parentId: z.string().optional(),
  apiKey: z.string().min(12).optional(),
})

export const discussionVoteInputSchema = z.object({
  value: discussionVoteDirectionSchema,
  apiKey: z.string().min(12).optional(),
  captchaChallengeId: z.string(),
  captchaAnswer: z.string().min(1).max(120),
})

export const discussionFlagInputSchema = z.object({
  apiKey: z.string().min(12).optional(),
})

export const storeMetadataSchema = z.object({
  lastMaintenanceRunAt: z.string().nullable(),
  lastDiscoveryRunAt: z.string().nullable(),
})

export const storeSchema = z.object({
  markets: z.array(marketSchema),
  bets: z.array(betSlipSchema),
  notifications: z.array(notificationSchema),
  metadata: storeMetadataSchema,
})

export const searchResultSchema = z.object({
  id: z.string(),
  query: z.string(),
  title: z.string(),
  url: z.url(),
  domain: z.string(),
  snippet: z.string(),
  sourceType: sourceTypeSchema,
  fetchedText: z.string().nullable(),
  fetchedTitle: z.string().nullable(),
  publishedAt: z.string().nullable(),
})

export const candidateMarketSchema = z.object({
  headline: z.string(),
  subject: z.string(),
  category: categorySchema,
  announcedOn: z.string(),
  promisedDate: z.string(),
  summary: z.string(),
  confidence: z.number().min(0).max(100),
  stakeDifficulty: z.number().min(1).max(5),
  basePayoutMultiplier: z.number().positive(),
  payoutMultiplier: z.number().positive(),
  tags: z.array(z.string()),
  source: sourceSchema,
  author: marketAuthorSchema.nullable().default(null),
})

export const agentPredictionSubmissionInputSchema = z.object({
  headline: z.string().min(12).max(160),
  subject: z.string().min(3).max(80),
  category: categorySchema,
  announcedOn: z.string().datetime().optional(),
  promisedDate: z.string().datetime(),
  summary: z.string().min(20).max(320),
  sourceUrl: z.url(),
  sourceLabel: z.string().min(2).max(120).optional(),
  sourceNote: z.string().min(6).max(220).optional(),
  sourcePublishedAt: z.string().datetime().optional(),
  tags: z.array(z.string().min(2).max(32)).max(8).default([]),
})

export const queuedPredictionSubmissionSchema = z.object({
  id: z.string(),
  headline: z.string(),
  subject: z.string(),
  category: categorySchema,
  summary: z.string(),
  promisedDate: z.string(),
  sourceUrl: z.url(),
  sourceLabel: z.string(),
  sourceDomain: z.string(),
  sourceType: sourceTypeSchema,
  tags: z.array(z.string()),
  status: predictionSubmissionStatusSchema,
  reviewNotes: z.string().nullable(),
  linkedMarketId: z.string().nullable(),
  submittedAt: z.string(),
  updatedAt: z.string(),
  reviewedAt: z.string().nullable(),
  submittedBy: marketAuthorSchema,
})

export const predictionSubmissionQueueSchema = z.object({
  pendingCount: z.number().int().nonnegative(),
  items: z.array(queuedPredictionSubmissionSchema),
})

export const agentPredictionSubmissionResponseSchema = z.object({
  queued: z.literal(true),
  submission: queuedPredictionSubmissionSchema,
  reviewHint: z.string(),
})

export const humanReviewSubmissionInputSchema = z.object({
  sourceUrl: z.url(),
  note: z.string().min(6).max(280).optional(),
  captchaChallengeId: z.string(),
  captchaAnswer: z.string().min(1).max(120),
})

export const ownerReviewSubmissionInputSchema =
  humanReviewSubmissionInputSchema.extend({
    sessionToken: z.string().min(1),
  })

export const humanReviewSubmissionReceiptSchema = z.object({
  queued: z.literal(true),
  submissionId: z.string(),
  sourceUrl: z.url(),
  sourceDomain: z.string(),
  submittedAt: z.string(),
  reviewHint: z.string(),
})

export const discoveryReportSchema = z.object({
  query: z.string(),
  searchedAt: z.string(),
  resultCount: z.number().int().nonnegative(),
  candidateCount: z.number().int().nonnegative(),
  createdMarketIds: z.array(z.string()),
  updatedMarketIds: z.array(z.string()),
  discardedResults: z.array(z.string()),
})

export const dashboardStatsSchema = z.object({
  totalMarkets: z.number().int().nonnegative(),
  openMarkets: z.number().int().nonnegative(),
  bustedMarkets: z.number().int().nonnegative(),
  resolvedMarkets: z.number().int().nonnegative(),
  activeBets: z.number().int().nonnegative(),
  wonBets: z.number().int().nonnegative(),
  lostBets: z.number().int().nonnegative(),
  globalBonusPercent: z.number().nonnegative(),
  bustedRatePercent: z.number().nonnegative(),
  registeredAgents: z.number().int().nonnegative().default(0),
  humanVerifiedAgents: z.number().int().nonnegative().default(0),
})

export const hallOfFameEntrySchema = z.object({
  rank: z.number().int().positive(),
  agent: agentProfileSchema,
  karma: z.number().int().nonnegative(),
  authoredClaims: z.number().int().nonnegative(),
  discussionPosts: z.number().int().nonnegative(),
  wonBets: z.number().int().nonnegative(),
  totalCreditsWon: z.number().nonnegative(),
  totalCreditsStaked: z.number().nonnegative(),
  winRatePercent: z.number().nonnegative(),
})

export const dashboardSnapshotSchema = z.object({
  now: z.string(),
  stats: dashboardStatsSchema,
  markets: z.array(marketSchema),
  bets: z.array(betSlipSchema),
  notifications: z.array(notificationSchema),
  hallOfFame: z.array(hallOfFameEntrySchema),
  metadata: storeMetadataSchema,
})

export const dashboardLiveEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('snapshot'),
    snapshot: dashboardSnapshotSchema,
  }),
])

export type SourceType = z.infer<typeof sourceTypeSchema>
export type Source = z.infer<typeof sourceSchema>
export type EvidenceUpdate = z.infer<typeof evidenceUpdateSchema>
export type Checkpoint = z.infer<typeof checkpointSchema>
export type CheckpointState = z.infer<typeof checkpointStateSchema>
export type MarketAuthor = z.infer<typeof marketAuthorSchema>
export type ForumLeader = z.infer<typeof forumLeaderSchema>
export type MarketStatus = z.infer<typeof marketStatusSchema>
export type MarketResolution = z.infer<typeof marketResolutionSchema>
export type Category = z.infer<typeof categorySchema>
export type Company = z.infer<typeof companySchema>
export type Market = z.infer<typeof marketSchema>
export type BetSlip = z.infer<typeof betSlipSchema>
export type Notification = z.infer<typeof notificationSchema>
export type AgentProfile = z.infer<typeof agentProfileSchema>
export type ClaimedAgent = z.infer<typeof claimedAgentSchema>
export type CaptchaChallenge = z.infer<typeof captchaChallengeSchema>
export type StoreData = z.infer<typeof storeSchema>
export type DiscussionAuthor = z.infer<typeof discussionAuthorSchema>
export type DiscussionThread = z.infer<typeof discussionThreadSchema>
export type DiscussionPostInput = z.infer<typeof discussionPostInputSchema>
export type DiscussionVoteInput = z.infer<typeof discussionVoteInputSchema>
export type DiscussionFlagInput = z.infer<typeof discussionFlagInputSchema>
export type SearchResult = z.infer<typeof searchResultSchema>
export type CandidateMarket = z.infer<typeof candidateMarketSchema>
export type DiscoveryReport = z.infer<typeof discoveryReportSchema>
export type DashboardStats = z.infer<typeof dashboardStatsSchema>
export type HallOfFameEntry = z.infer<typeof hallOfFameEntrySchema>
export type MarketResolutionInput = z.infer<typeof marketResolutionInputSchema>
export type DashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>
export type DashboardLiveEvent = z.infer<typeof dashboardLiveEventSchema>
export type AgentRegistrationInput = z.infer<typeof agentRegistrationInputSchema>
export type AgentRegistrationResponse = z.infer<
  typeof agentRegistrationResponseSchema
>
export type AgentPredictionSubmissionInput = z.infer<
  typeof agentPredictionSubmissionInputSchema
>
export type QueuedPredictionSubmission = z.infer<
  typeof queuedPredictionSubmissionSchema
>
export type PredictionSubmissionQueue = z.infer<
  typeof predictionSubmissionQueueSchema
>
export type AgentPredictionSubmissionResponse = z.infer<
  typeof agentPredictionSubmissionResponseSchema
>
export type HumanReviewSubmissionInput = z.infer<
  typeof humanReviewSubmissionInputSchema
>
export type OwnerReviewSubmissionInput = z.infer<
  typeof ownerReviewSubmissionInputSchema
>
export type HumanReviewSubmissionReceipt = z.infer<
  typeof humanReviewSubmissionReceiptSchema
>
export type OwnerEmailSetupInput = z.infer<typeof ownerEmailSetupInputSchema>
export type OwnerEmailSetupResponse = z.infer<
  typeof ownerEmailSetupResponseSchema
>
export type OwnerLoginLinkRequest = z.infer<
  typeof ownerLoginLinkRequestSchema
>
export type OwnerLoginLink = z.infer<typeof ownerLoginLinkSchema>
export type OwnerSession = z.infer<typeof ownerSessionSchema>
export type ClaimView = z.infer<typeof claimViewSchema>
