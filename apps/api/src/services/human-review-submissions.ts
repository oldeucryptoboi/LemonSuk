import type { PoolClient } from 'pg'

import type {
  HumanReviewSubmissionInput,
  HumanReviewSubmissionReceipt,
} from '../shared'
import {
  humanReviewSubmissionReceiptSchema,
  reviewRequestedEventSchema,
} from '../shared'
import { consumeCaptchaChallengeFromClient } from './identity'
import { withDatabaseTransaction } from './database'
import { createHumanLeadFromSubmission } from './lead-intake'
import { enqueueReviewRequestedEvent } from './review-events'
import { domainFromUrl, normalizeSourceUrl } from './utils'

const minimumResubmitIntervalMs = 3 * 60 * 1_000
const maxHourlySubmissionsPerSubmitter = 4

async function assertNoPendingDuplicate(
  client: PoolClient,
  normalizedSourceUrl: string,
): Promise<void> {
  const result = await client.query<{ id: string }>(
    `
      SELECT id
      FROM prediction_leads
      WHERE lead_type = 'human_url_lead'
        AND normalized_source_url = $1
        AND status IN ('pending', 'in_review', 'escalated')
      LIMIT 1
    `,
    [normalizedSourceUrl],
  )

  if (result.rowCount) {
    throw new Error('That source is already queued for offline review.')
  }
}

async function assertSubmitterCooldown(
  client: PoolClient,
  ownerEmail: string,
  now: Date,
): Promise<void> {
  const result = await client.query<{ created_at: Date }>(
    `
      SELECT created_at
      FROM prediction_leads
      WHERE lead_type = 'human_url_lead'
        AND submitted_by_owner_email = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [ownerEmail],
  )

  const lastSubmission = result.rows[0]
  if (!lastSubmission) {
    return
  }

  const msSinceLastSubmission =
    now.getTime() - lastSubmission.created_at.getTime()

  if (msSinceLastSubmission < minimumResubmitIntervalMs) {
    throw new Error('Wait a few minutes before sending another review lead.')
  }
}

async function assertSubmitterHourlyLimit(
  client: PoolClient,
  ownerEmail: string,
  now: Date,
): Promise<void> {
  const windowStart = new Date(now.getTime() - 60 * 60 * 1_000).toISOString()
  const result = await client.query<{ count: number }>(
    `
      SELECT COUNT(*)::int AS count
      FROM prediction_leads
      WHERE lead_type = 'human_url_lead'
        AND submitted_by_owner_email = $1
        AND created_at >= $2
    `,
    [ownerEmail, windowStart],
  )

  const count = result.rows[0]?.count ?? 0
  if (count >= maxHourlySubmissionsPerSubmitter) {
    throw new Error('Hourly review lead limit reached. Try again later.')
  }
}

export async function createHumanReviewSubmission(
  input: HumanReviewSubmissionInput,
  ownerEmail: string,
  now: Date = new Date(),
): Promise<HumanReviewSubmissionReceipt> {
  const normalizedSourceUrl = normalizeSourceUrl(input.sourceUrl)
  const sourceDomain = domainFromUrl(normalizedSourceUrl)
  const normalizedOwnerEmail = ownerEmail.trim().toLowerCase()

  const queuedLead = await withDatabaseTransaction(async (client) => {
    await consumeCaptchaChallengeFromClient(
      client,
      {
        challengeId: input.captchaChallengeId,
        answer: input.captchaAnswer,
      },
      now,
    )
    await assertNoPendingDuplicate(client, normalizedSourceUrl)
    await assertSubmitterCooldown(client, normalizedOwnerEmail, now)
    await assertSubmitterHourlyLimit(client, normalizedOwnerEmail, now)

    return createHumanLeadFromSubmission(client, {
      ownerEmail: normalizedOwnerEmail,
      submission: input,
      now,
    })
  })

  const reviewEvent = reviewRequestedEventSchema.parse({
    eventType: 'review.requested',
    leadId: queuedLead.id,
    submittedUrl: input.sourceUrl,
    ownerEmail: normalizedOwnerEmail,
    createdAt: now.toISOString(),
    priority: 'normal',
  })

  try {
    await enqueueReviewRequestedEvent(reviewEvent)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Could not queue submission for review.'

    await withDatabaseTransaction(async (client) => {
      const nowIso = now.toISOString()
      await client.query(
        `
          UPDATE prediction_leads
          SET
            status = 'failed',
            review_notes = $2,
            reviewed_at = $3,
            updated_at = $3
          WHERE id = $1
        `,
        [queuedLead.id, message, nowIso],
      )
    })

    throw new Error('Could not queue submission for review.')
  }

  return humanReviewSubmissionReceiptSchema.parse({
    queued: true,
    leadId: queuedLead.id,
    submissionId: queuedLead.id,
    sourceUrl: input.sourceUrl,
    sourceDomain,
    submittedAt: now.toISOString(),
    reviewHint:
      'Queued for Eddie / Karnival offline review. Nothing goes live until the reviewer accepts it.',
  })
}
