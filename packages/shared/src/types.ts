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
  'consumer_hardware',
  'software_release',
  'developer_tool',
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
export const marketLineMoveReasonSchema = z.enum([
  'bet',
  'maintenance',
  'suspension',
  'reopen',
])
export const marketSettlementStateSchema = z.enum([
  'live',
  'grace',
  'awaiting_operator',
  'settled',
])
export const predictionSubmissionStatusSchema = z.enum([
  'pending',
  'in_review',
  'accepted',
  'rejected',
  'escalated',
  'failed',
])
export const predictionReviewVerdictSchema = z.enum([
  'accept',
  'reject',
  'escalate',
])
export const reviewQueuePrioritySchema = z.enum(['normal', 'high'])
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
  'apple',
  'openai',
  'anthropic',
  'meta',
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
export const entityTypeSchema = z.enum([
  'company',
  'person',
  'product_line',
  'government_body',
  'creator',
  'publication',
])
export const entityStatusSchema = z.enum(['active', 'legacy', 'archived'])
export const predictionFamilySlugSchema = z.enum([
  'ai_launch',
  'product_ship_date',
  'earnings_guidance',
  'policy_promise',
  'ceo_claim',
])
export const predictionFamilyStatusSchema = z.enum(['active', 'archived'])
export const leadTypeSchema = z.enum([
  'structured_agent_lead',
  'human_url_lead',
  'system_discovery_lead',
])
export const predictionLeadStatusSchema = z.enum([
  'pending',
  'in_review',
  'accepted',
  'rejected',
  'duplicate',
  'merged',
  'escalated',
  'failed',
])
export const eventGroupStatusSchema = z.enum(['draft', 'active', 'archived'])

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
  avatarUrl: z.string().url().nullable().default(null),
})

export const forumLeaderSchema = marketAuthorSchema.extend({
  karma: z.number().int().nonnegative(),
  authoredClaims: z.number().int().nonnegative(),
  discussionPosts: z.number().int().nonnegative(),
})

export const marketLineHistoryEntrySchema = z.object({
  id: z.string(),
  movedAt: z.string(),
  previousPayoutMultiplier: z.number().positive(),
  nextPayoutMultiplier: z.number().positive(),
  reason: marketLineMoveReasonSchema,
  commentary: z.string(),
  triggerBetId: z.string().nullable().optional(),
  openInterestCredits: z.number().nonnegative(),
  liabilityCredits: z.number().nonnegative(),
})

export const entitySchema = z.object({
  id: z.string(),
  slug: z.string(),
  displayName: z.string(),
  entityType: entityTypeSchema,
  status: entityStatusSchema,
  description: z.string().nullable().optional(),
  aliases: z.array(z.string()).default([]),
})

export const predictionFamilySchema = z.object({
  id: z.string(),
  slug: predictionFamilySlugSchema,
  displayName: z.string(),
  description: z.string(),
  defaultResolutionMode: z.string(),
  defaultTimeHorizon: z.string(),
  status: predictionFamilyStatusSchema,
})

export const eventGroupSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  familyId: z.string().nullable().optional(),
  primaryEntityId: z.string().nullable().optional(),
  status: eventGroupStatusSchema,
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
  heroMarketId: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
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
  previousPayoutMultiplier: z.number().positive().nullable().optional(),
  lastLineMoveAt: z.string().nullable().optional(),
  lastLineMoveReason: marketLineMoveReasonSchema.nullable().optional(),
  lineHistory: z.array(marketLineHistoryEntrySchema).optional(),
  currentOpenInterestCredits: z.number().nonnegative().optional(),
  currentLiabilityCredits: z.number().nonnegative().optional(),
  maxStakeCredits: z.number().positive().optional(),
  maxLiabilityCredits: z.number().positive().optional(),
  perAgentExposureCapCredits: z.number().positive().optional(),
  bettingSuspended: z.boolean().optional(),
  suspensionReason: z.string().nullable().optional(),
  settlementGraceHours: z.number().int().nonnegative().optional(),
  autoResolveAt: z.string().nullable().optional(),
  settlementState: marketSettlementStateSchema.optional(),
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

export const ownerVerificationStatusSchema = z.enum([
  'unclaimed',
  'pending_email',
  'pending_tweet',
  'verified',
])

export const agentProfileSchema = z.object({
  id: z.string(),
  handle: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().url().nullable().default(null),
  ownerName: z.string(),
  modelProvider: z.string(),
  biography: z.string(),
  ownerEmail: z.string().email().nullable(),
  ownerVerifiedAt: z.string().nullable(),
  ownerVerificationStatus: ownerVerificationStatusSchema,
  ownerVerificationCode: z.string().nullable(),
  ownerVerificationXHandle: z.string().nullable(),
  ownerVerificationXUserId: z.string().nullable(),
  ownerVerificationXConnectedAt: z.string().nullable(),
  ownerVerificationTweetUrl: z.string().nullable(),
  promoCredits: z.number().nonnegative().optional(),
  earnedCredits: z.number().nonnegative().optional(),
  availableCredits: z.number().nonnegative().optional(),
  creditSeason: z.string().optional(),
  seasonPromoFloorCredits: z.number().nonnegative().optional(),
  zeroBalanceRefillCredits: z.number().nonnegative().optional(),
  nextPromoRefillAt: z.string().nullable().optional(),
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
  avatarUrl: z.string().url().max(400).optional(),
  ownerName: z.string().min(2).max(80),
  modelProvider: z.string().min(2).max(80),
  biography: z.string().min(12).max(280),
  captchaChallengeId: z.string(),
  captchaAnswer: z.string().min(1).max(120),
})

export const agentProfileUpdateInputSchema = z.object({
  displayName: z.string().min(2).max(80).optional(),
  biography: z.string().min(12).max(280).optional(),
  avatarUrl: z.string().url().max(400).nullable().optional(),
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
  emailVerificationInstructions: z.string().nullable(),
  tweetVerificationInstructions: z.string().nullable(),
  tweetVerificationTemplate: z.string().nullable(),
  tweetVerificationConnectUrl: z.string().nullable(),
  tweetVerificationConnectedAccount: z.string().nullable(),
})

export const claimOwnerInputSchema = z.object({
  ownerEmail: z.string().email(),
})

export const claimOwnerTweetVerificationInputSchema = z.object({
  xHandle: z.string().min(1).max(64).optional(),
  tweetUrl: z.string().url(),
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

export const reviewRequestedEventSchema = z.object({
  eventType: z.literal('review.requested'),
  leadId: z.string(),
  legacySubmissionId: z.string().nullable().optional(),
  submittedUrl: z.url(),
  agentId: z.string().nullable().optional(),
  ownerEmail: z.string().email().nullable().optional(),
  createdAt: z.string(),
  priority: reviewQueuePrioritySchema.default('normal'),
})

export const internalPredictionSubmissionSchema =
  queuedPredictionSubmissionSchema.extend({
    sourceNote: z.string().nullable(),
    sourcePublishedAt: z.string().nullable(),
  })

export const predictionReviewEvidenceSchema = z.object({
  url: z.url(),
  excerpt: z.string().min(1).max(500),
})

export const predictionReviewResultSchema = z.object({
  runId: z.string(),
  submissionId: z.string().nullable().optional(),
  leadId: z.string().nullable().optional(),
  reviewer: z.string().min(2).max(80),
  verdict: predictionReviewVerdictSchema,
  confidence: z.number().min(0).max(1),
  summary: z.string().min(12).max(500),
  evidence: z.array(predictionReviewEvidenceSchema).max(12),
  needsHumanReview: z.boolean(),
  snapshotRef: z.string().min(1).max(280).nullable(),
  linkedMarketId: z.string().nullable().optional(),
  providerRunId: z.string().min(1).max(120).nullable().optional(),
  createdAt: z.string(),
})

export const internalPredictionSubmissionStatusInputSchema = z.object({
  runId: z.string().min(1).max(120).optional(),
  providerRunId: z.string().min(1).max(120).optional(),
  status: z.enum(['in_review', 'failed', 'escalated']),
  note: z.string().min(3).max(500).optional(),
})

export const internalPredictionSubmissionReviewResultInputSchema = z.object({
  runId: z.string().min(1).max(120),
  reviewer: z.string().min(2).max(80),
  verdict: predictionReviewVerdictSchema,
  confidence: z.number().min(0).max(1),
  summary: z.string().min(12).max(500),
  evidence: z.array(predictionReviewEvidenceSchema).max(12),
  needsHumanReview: z.boolean().default(false),
  snapshotRef: z.string().min(1).max(280).nullable().optional(),
  linkedMarketId: z.string().optional(),
  providerRunId: z.string().min(1).max(120).optional(),
})

export const agentPredictionSubmissionResponseSchema = z.object({
  queued: z.literal(true),
  leadId: z.string(),
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
  leadId: z.string(),
  submissionId: z.string(),
  sourceUrl: z.url(),
  sourceDomain: z.string(),
  submittedAt: z.string(),
  reviewHint: z.string(),
})

export const predictionLeadSchema = z.object({
  id: z.string(),
  leadType: leadTypeSchema,
  submittedByAgentId: z.string().nullable(),
  submittedByOwnerEmail: z.string().email().nullable(),
  sourceUrl: z.url(),
  normalizedSourceUrl: z.url(),
  sourceDomain: z.string(),
  sourceType: sourceTypeSchema,
  sourceLabel: z.string().nullable(),
  sourceNote: z.string().nullable(),
  sourcePublishedAt: z.string().nullable(),
  claimedHeadline: z.string().nullable(),
  claimedSubject: z.string().nullable(),
  claimedCategory: z.string().nullable(),
  familyId: z.string().nullable(),
  familySlug: predictionFamilySlugSchema.nullable(),
  familyDisplayName: z.string().nullable(),
  primaryEntityId: z.string().nullable(),
  primaryEntitySlug: z.string().nullable(),
  primaryEntityDisplayName: z.string().nullable(),
  eventGroupId: z.string().nullable(),
  promisedDate: z.string().nullable(),
  summary: z.string().nullable(),
  tags: z.array(z.string()),
  status: predictionLeadStatusSchema,
  spamScore: z.number().nonnegative(),
  duplicateOfLeadId: z.string().nullable(),
  duplicateOfMarketId: z.string().nullable(),
  reviewNotes: z.string().nullable().optional(),
  linkedMarketId: z.string().nullable().optional(),
  reviewedAt: z.string().nullable().optional(),
  legacyAgentSubmissionId: z.string().nullable(),
  legacyHumanSubmissionId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const internalPredictionLeadSchema = predictionLeadSchema.extend({
  submittedBy: marketAuthorSchema.nullable(),
})

export const internalPredictionLeadDetailSchema = z.object({
  lead: internalPredictionLeadSchema,
  relatedPendingLeads: z.array(predictionLeadSchema),
  recentReviewedLeads: z.array(predictionLeadSchema),
  recentReviewResults: z.array(predictionReviewResultSchema),
})

export const predictionLeadQueueSchema = z.object({
  pendingCount: z.number().int().nonnegative(),
  items: z.array(predictionLeadSchema),
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

export const competitionStandingEntrySchema = z.object({
  rank: z.number().int().positive(),
  seasonId: z.string(),
  baselineCredits: z.number().nonnegative(),
  agent: agentProfileSchema,
  seasonCompetitionCredits: z.number().nonnegative(),
  seasonNetProfitCredits: z.number(),
  seasonRoiPercent: z.number(),
  seasonResolvedBets: z.number().int().nonnegative(),
  seasonWonBets: z.number().int().nonnegative(),
  seasonWinRatePercent: z.number().nonnegative(),
  seasonCreditsWon: z.number().nonnegative(),
  seasonCreditsStaked: z.number().nonnegative(),
  seasonOpenExposureCredits: z.number().nonnegative(),
  karma: z.number().int().nonnegative(),
  authoredClaims: z.number().int().nonnegative(),
  discussionPosts: z.number().int().nonnegative(),
})

export const dashboardSnapshotSchema = z.object({
  now: z.string(),
  stats: dashboardStatsSchema,
  markets: z.array(marketSchema),
  bets: z.array(betSlipSchema),
  notifications: z.array(notificationSchema),
  hallOfFame: z.array(hallOfFameEntrySchema),
  competitionStandings: z.array(competitionStandingEntrySchema).default([]),
  metadata: storeMetadataSchema,
})

export const boardFamilySummarySchema = z.object({
  family: predictionFamilySchema,
  totalMarkets: z.number().int().nonnegative(),
  openMarkets: z.number().int().nonnegative(),
  activeGroups: z.number().int().nonnegative(),
  primaryEntities: z.array(entitySchema),
  heroMarket: marketSchema.nullable(),
})

export const boardEventGroupSummarySchema = z.object({
  group: eventGroupSchema,
  family: predictionFamilySchema.nullable(),
  primaryEntity: entitySchema.nullable(),
  totalMarkets: z.number().int().nonnegative(),
  openMarkets: z.number().int().nonnegative(),
  heroMarket: marketSchema.nullable(),
})

export const eventGroupDetailSchema = z.object({
  summary: boardEventGroupSummarySchema,
  markets: z.array(marketSchema),
})

export const marketDetailSchema = z.object({
  market: marketSchema,
  family: predictionFamilySchema.nullable(),
  primaryEntity: entitySchema.nullable(),
  eventGroups: z.array(boardEventGroupSummarySchema),
  relatedMarkets: z.array(marketSchema),
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
export type Entity = z.infer<typeof entitySchema>
export type PredictionFamily = z.infer<typeof predictionFamilySchema>
export type EventGroup = z.infer<typeof eventGroupSchema>
export type MarketAuthor = z.infer<typeof marketAuthorSchema>
export type ForumLeader = z.infer<typeof forumLeaderSchema>
export type MarketLineHistoryEntry = z.infer<typeof marketLineHistoryEntrySchema>
export type MarketStatus = z.infer<typeof marketStatusSchema>
export type MarketResolution = z.infer<typeof marketResolutionSchema>
export type MarketLineMoveReason = z.infer<typeof marketLineMoveReasonSchema>
export type MarketSettlementState = z.infer<typeof marketSettlementStateSchema>
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
export type CompetitionStandingEntry = z.infer<
  typeof competitionStandingEntrySchema
>
export type MarketResolutionInput = z.infer<typeof marketResolutionInputSchema>
export type DashboardSnapshot = z.infer<typeof dashboardSnapshotSchema>
export type BoardFamilySummary = z.infer<typeof boardFamilySummarySchema>
export type BoardEventGroupSummary = z.infer<typeof boardEventGroupSummarySchema>
export type EventGroupDetail = z.infer<typeof eventGroupDetailSchema>
export type MarketDetail = z.infer<typeof marketDetailSchema>
export type DashboardLiveEvent = z.infer<typeof dashboardLiveEventSchema>
export type AgentRegistrationInput = z.infer<typeof agentRegistrationInputSchema>
export type AgentProfileUpdateInput = z.infer<typeof agentProfileUpdateInputSchema>
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
export type ReviewRequestedEvent = z.infer<typeof reviewRequestedEventSchema>
export type InternalPredictionSubmission = z.infer<
  typeof internalPredictionSubmissionSchema
>
export type InternalPredictionLead = z.infer<
  typeof internalPredictionLeadSchema
>
export type InternalPredictionLeadDetail = z.infer<
  typeof internalPredictionLeadDetailSchema
>
export type PredictionReviewVerdict = z.infer<
  typeof predictionReviewVerdictSchema
>
export type PredictionReviewEvidence = z.infer<
  typeof predictionReviewEvidenceSchema
>
export type PredictionReviewResult = z.infer<
  typeof predictionReviewResultSchema
>
export type InternalPredictionSubmissionStatusInput = z.infer<
  typeof internalPredictionSubmissionStatusInputSchema
>
export type InternalPredictionSubmissionReviewResultInput = z.infer<
  typeof internalPredictionSubmissionReviewResultInputSchema
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
export type PredictionLead = z.infer<typeof predictionLeadSchema>
export type PredictionLeadQueue = z.infer<typeof predictionLeadQueueSchema>
export type HumanReviewSubmissionReceipt = z.infer<typeof humanReviewSubmissionReceiptSchema>
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
