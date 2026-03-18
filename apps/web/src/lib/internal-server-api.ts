import { timingSafeEqual } from 'node:crypto'

import {
  internalPredictionLeadDetailSchema,
  internalPredictionLeadSchema,
  internalPredictionSubmissionReviewResultInputSchema,
  internalPredictionSubmissionStatusInputSchema,
  predictionLeadQueueSchema,
  predictionReviewResultSchema,
  type PredictionLead,
  type InternalPredictionLead,
  type InternalPredictionLeadDetail,
  type InternalPredictionSubmissionReviewResultInput,
  type InternalPredictionSubmissionStatusInput,
  type PredictionLeadQueue,
  type PredictionReviewResult,
} from '../shared'

type InternalLeadFilters = {
  limit?: number
  leadType?: PredictionLead['leadType']
  familySlug?: 'ai_launch' | 'product_ship_date' | 'earnings_guidance' | 'policy_promise' | 'ceo_claim'
  entitySlug?: string
  sourceDomain?: string
}

function resolveInternalApiBaseUrl(): string {
  const candidates = [
    process.env.INTERNAL_API_BASE_URL,
    process.env.NEXT_PUBLIC_API_BASE_URL,
  ]
  const configured = candidates.find(
    (value): value is string => Boolean(value && value.trim().length > 0),
  )

  return configured ?? 'http://127.0.0.1:8787'
}

function resolveInternalServiceToken(): string {
  const token = process.env.INTERNAL_SERVICE_TOKEN?.trim()

  if (!token) {
    throw new Error('INTERNAL_SERVICE_TOKEN is required for the review console.')
  }

  return token
}

function resolveReviewConsoleKey(): string | null {
  const key = process.env.REVIEW_CONSOLE_ACCESS_KEY?.trim()
  return key ? key : null
}

function secureEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function isReviewConsoleAuthorized(
  reviewKey: string | null | undefined,
): boolean {
  const configuredKey = resolveReviewConsoleKey()

  if (!configuredKey) {
    return process.env.NODE_ENV !== 'production'
  }

  return Boolean(reviewKey && secureEquals(reviewKey, configuredKey))
}

async function requestInternal<T>(
  path: string,
  parse: (payload: unknown) => T,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(
    `${resolveInternalApiBaseUrl()}/api/v1${path}`,
    {
      cache: 'no-store',
      ...init,
      headers: {
        Authorization: `Bearer ${resolveInternalServiceToken()}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    },
  )

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as {
      message?: string
    } | null
    throw new Error(errorBody?.message ?? 'Request failed')
  }

  return parse(await response.json())
}

export async function fetchInternalLeadQueueServer(
  filters: InternalLeadFilters = {},
): Promise<PredictionLeadQueue> {
  const params = new URLSearchParams()

  if (filters.limit) {
    params.set('limit', String(filters.limit))
  }

  if (filters.leadType) {
    params.set('leadType', filters.leadType)
  }

  if (filters.familySlug) {
    params.set('familySlug', filters.familySlug)
  }

  if (filters.entitySlug) {
    params.set('entitySlug', filters.entitySlug)
  }

  if (filters.sourceDomain) {
    params.set('sourceDomain', filters.sourceDomain)
  }

  const query = params.toString()
  const path = query ? `/internal/leads?${query}` : '/internal/leads'

  return requestInternal(path, (payload) =>
    predictionLeadQueueSchema.parse(payload),
  )
}

export async function fetchInternalLeadInspectionServer(
  leadId: string,
): Promise<InternalPredictionLeadDetail> {
  return requestInternal(`/internal/leads/${leadId}/inspect`, (payload) =>
    internalPredictionLeadDetailSchema.parse(payload),
  )
}

export async function updateInternalLeadStatusServer(
  leadId: string,
  input: InternalPredictionSubmissionStatusInput,
): Promise<InternalPredictionLead> {
  return requestInternal(
    `/internal/leads/${leadId}/status`,
    (payload) => internalPredictionLeadSchema.parse(payload),
    {
      method: 'POST',
      body: JSON.stringify(
        internalPredictionSubmissionStatusInputSchema.parse(input),
      ),
    },
  )
}

export async function applyInternalLeadReviewResultServer(
  leadId: string,
  input: InternalPredictionSubmissionReviewResultInput,
): Promise<PredictionReviewResult> {
  return requestInternal(
    `/internal/leads/${leadId}/review-result`,
    (payload) => predictionReviewResultSchema.parse(payload),
    {
      method: 'POST',
      body: JSON.stringify(
        internalPredictionSubmissionReviewResultInputSchema.parse(input),
      ),
    },
  )
}
