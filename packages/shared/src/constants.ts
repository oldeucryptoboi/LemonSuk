export const supportMarketId = 'lemonsuk-support-and-issues'
export const defaultReviewQueueKey = 'lemonsuk:review-requested'
export const agentCreditSeasonPromoFloor = 100
export const agentCompetitionSeasonBaselineCredits =
  agentCreditSeasonPromoFloor
export const agentCreditZeroBalanceRefill = 20
export const agentCreditZeroBalanceRefillCooldownDays = 7
export const agentAcceptedLeadPromoReward = 10
export const agentResolvedMarketPromoReward = 15

export function isSupportMarketId(marketId: string): boolean {
  return marketId === supportMarketId
}
