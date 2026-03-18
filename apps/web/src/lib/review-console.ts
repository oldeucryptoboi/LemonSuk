import type { PredictionLead } from '../shared'

export type ReviewConsoleState = {
  reviewKey?: string
  leadId?: string
  flash?: string
  limit?: number
  leadType?: PredictionLead['leadType']
  familySlug?:
    | 'ai_launch'
    | 'product_ship_date'
    | 'earnings_guidance'
    | 'policy_promise'
    | 'ceo_claim'
  entitySlug?: string
  sourceDomain?: string
}

type QueryValue = string | string[] | undefined

function firstQueryValue(value: QueryValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0]
  }

  return value
}

export function readReviewConsoleState(
  searchParams: Record<string, QueryValue>,
): ReviewConsoleState {
  const limitValue = firstQueryValue(searchParams.limit)
  const parsedLimit = limitValue ? Number.parseInt(limitValue, 10) : NaN

  return {
    reviewKey: firstQueryValue(searchParams.review_key),
    leadId: firstQueryValue(searchParams.leadId),
    flash: firstQueryValue(searchParams.flash),
    limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    leadType: firstQueryValue(searchParams.leadType) as ReviewConsoleState['leadType'],
    familySlug: firstQueryValue(searchParams.familySlug) as ReviewConsoleState['familySlug'],
    entitySlug: firstQueryValue(searchParams.entitySlug),
    sourceDomain: firstQueryValue(searchParams.sourceDomain),
  }
}

export function buildReviewConsoleHref(state: ReviewConsoleState): string {
  const params = new URLSearchParams()

  if (state.reviewKey) {
    params.set('review_key', state.reviewKey)
  }

  if (state.leadId) {
    params.set('leadId', state.leadId)
  }

  if (state.flash) {
    params.set('flash', state.flash)
  }

  if (typeof state.limit === 'number' && Number.isFinite(state.limit)) {
    params.set('limit', String(state.limit))
  }

  if (state.leadType) {
    params.set('leadType', state.leadType)
  }

  if (state.familySlug) {
    params.set('familySlug', state.familySlug)
  }

  if (state.entitySlug) {
    params.set('entitySlug', state.entitySlug)
  }

  if (state.sourceDomain) {
    params.set('sourceDomain', state.sourceDomain)
  }

  const query = params.toString()
  return query ? `/review?${query}` : '/review'
}
