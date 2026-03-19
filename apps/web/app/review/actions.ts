'use server'

import { randomUUID } from 'node:crypto'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  applyInternalLeadReviewResultServer,
  isReviewConsoleAvailable,
  isReviewConsoleAuthorized,
  updateInternalLeadStatusServer,
} from '../../src/lib/internal-server-api'
import {
  buildReviewConsoleHref,
  type ReviewConsoleState,
} from '../../src/lib/review-console'
import type {
  InternalPredictionSubmissionReviewResultInput,
  InternalPredictionSubmissionStatusInput,
} from '../../src/shared'

function readString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readBaseState(formData: FormData): ReviewConsoleState {
  const limitValue = readString(formData, 'limit')
  const parsedLimit = limitValue ? Number.parseInt(limitValue, 10) : NaN

  return {
    reviewKey: readString(formData, 'review_key'),
    leadId: readString(formData, 'leadId'),
    limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    leadType: readString(formData, 'leadType') as ReviewConsoleState['leadType'],
    familySlug: readString(formData, 'familySlug') as ReviewConsoleState['familySlug'],
    entitySlug: readString(formData, 'entitySlug'),
    sourceDomain: readString(formData, 'sourceDomain'),
  }
}

function assertAuthorized(reviewKey: string | undefined): void {
  if (!isReviewConsoleAvailable()) {
    throw new Error('Review desk is unavailable.')
  }

  if (!isReviewConsoleAuthorized(reviewKey)) {
    throw new Error('Review desk access denied.')
  }
}

function redirectWithFlash(state: ReviewConsoleState, flash: string): never {
  redirect(
    buildReviewConsoleHref({
      ...state,
      flash,
    }),
  )
}

function normalizeStatusInput(
  formData: FormData,
): InternalPredictionSubmissionStatusInput {
  return {
    status: readString(formData, 'status') as InternalPredictionSubmissionStatusInput['status'],
    note: readString(formData, 'note'),
    runId: readString(formData, 'runId'),
    providerRunId: readString(formData, 'providerRunId'),
  }
}

function normalizeReviewInput(
  leadId: string,
  formData: FormData,
): InternalPredictionSubmissionReviewResultInput {
  const evidenceUrl = readString(formData, 'evidenceUrl')
  const evidenceExcerpt = readString(formData, 'evidenceExcerpt')
  const confidenceValue = Number.parseFloat(readString(formData, 'confidence') ?? '0')

  return {
    runId:
      readString(formData, 'runId') ??
      `manual_${leadId}_${randomUUID().replace(/-/g, '')}`,
    reviewer: readString(formData, 'reviewer') ?? 'LemonSuk operator',
    verdict: readString(formData, 'verdict') as InternalPredictionSubmissionReviewResultInput['verdict'],
    confidence: Number.isFinite(confidenceValue) ? confidenceValue : 0,
    summary: readString(formData, 'summary') ?? 'Manual review applied by the operator desk.',
    evidence:
      evidenceUrl && evidenceExcerpt
        ? [
            {
              url: evidenceUrl,
              excerpt: evidenceExcerpt,
            },
          ]
        : [],
    needsHumanReview: formData.get('needsHumanReview') === 'on',
    snapshotRef: readString(formData, 'snapshotRef') ?? null,
    linkedMarketId: readString(formData, 'linkedMarketId'),
    providerRunId: readString(formData, 'providerRunId'),
  }
}

export async function applyLeadStatusAction(formData: FormData): Promise<void> {
  const state = readBaseState(formData)
  const leadId = state.leadId

  assertAuthorized(state.reviewKey)

  if (!leadId) {
    redirectWithFlash(state, 'Lead id is required.')
  }

  let flash = 'Lead status updated.'

  try {
    await updateInternalLeadStatusServer(leadId, normalizeStatusInput(formData))
  } catch (error) {
    flash =
      error instanceof Error ? error.message : 'Could not update lead status.'
  }

  revalidatePath('/review')
  redirectWithFlash(state, flash)
}

export async function applyLeadReviewAction(formData: FormData): Promise<void> {
  const state = readBaseState(formData)
  const leadId = state.leadId

  assertAuthorized(state.reviewKey)

  if (!leadId) {
    redirectWithFlash(state, 'Lead id is required.')
  }

  let flash = 'Manual review applied.'

  try {
    await applyInternalLeadReviewResultServer(
      leadId,
      normalizeReviewInput(leadId, formData),
    )
  } catch (error) {
    flash =
      error instanceof Error ? error.message : 'Could not apply manual review.'
  }

  revalidatePath('/review')
  redirectWithFlash(state, flash)
}
