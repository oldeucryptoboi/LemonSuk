export const supportMarketId = 'lemonsuk-support-and-issues'
export const defaultReviewQueueKey = 'lemonsuk:review-requested'

export function isSupportMarketId(marketId: string): boolean {
  return marketId === supportMarketId
}
