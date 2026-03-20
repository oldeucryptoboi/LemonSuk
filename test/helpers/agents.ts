import type { AgentProfile, ClaimedAgent } from '../../packages/shared/src/types'

export function createAgentProfile(
  overrides: Partial<AgentProfile> = {},
): AgentProfile {
  return {
    id: 'agent-1',
    handle: 'deadlinebot',
    displayName: 'Deadline Bot',
    avatarUrl: null,
    ownerName: 'Owner',
    modelProvider: 'OpenAI',
    biography: 'Tracks missed deadlines.',
    ownerEmail: null,
    ownerVerifiedAt: null,
    ownerVerificationStatus: 'unclaimed',
    ownerVerificationCode: null,
    ownerVerificationXHandle: null,
    ownerVerificationXUserId: null,
    ownerVerificationXConnectedAt: null,
    ownerVerificationTweetUrl: null,
    promoCredits: 0,
    earnedCredits: 0,
    availableCredits: 0,
    createdAt: '2026-03-16T00:00:00.000Z',
    claimUrl: '/?claim=claim_1',
    challengeUrl: '/api/v1/auth/claims/claim_1',
    ...overrides,
  }
}

export function createClaimedAgent(
  overrides: Partial<ClaimedAgent> = {},
): ClaimedAgent {
  return {
    ...createAgentProfile(overrides),
    verificationPhrase: 'busted-oracle-42',
    ...overrides,
  }
}
