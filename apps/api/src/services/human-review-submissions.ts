import { createHash, randomUUID } from 'node:crypto'

import type { PoolClient } from 'pg'

import type {
  HumanReviewSubmissionInput,
  HumanReviewSubmissionReceipt,
} from '../shared'
import { humanReviewSubmissionReceiptSchema } from '../shared'
import { consumeCaptchaChallengeFromClient } from './identity'
import { withDatabaseTransaction } from './database'
import { domainFromUrl, normalizeSourceUrl } from './utils'

const minimumResubmitIntervalMs = 3 * 60 * 1_000
const maxHourlySubmissionsPerSubmitter = 4

type HumanReviewSubmissionRow = {
  id: string
  normalized_source_url: string
  source_url: string
  source_domain: string
  owner_email: string | null
  status: 'pending' | 'accepted' | 'rejected'
  created_at: Date
}

function hashSubmitterKey(submitterKey: string): string {
  return createHash('sha256').update(submitterKey).digest('hex')
}

async function assertNoPendingDuplicate(
  client: PoolClient,
  normalizedSourceUrl: string,
): Promise<void> {
  const result = await client.query<HumanReviewSubmissionRow>(
    `
      SELECT id, normalized_source_url, source_url, source_domain, status, created_at
      FROM human_review_submissions
      WHERE normalized_source_url = $1
        AND status = 'pending'
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
  submitterKeyHash: string,
  now: Date,
): Promise<void> {
  const result = await client.query<{ created_at: Date }>(
    `
      SELECT created_at
      FROM human_review_submissions
      WHERE submitter_key_hash = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [submitterKeyHash],
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
  submitterKeyHash: string,
  now: Date,
): Promise<void> {
  const windowStart = new Date(now.getTime() - 60 * 60 * 1_000).toISOString()
  const result = await client.query<{ count: number }>(
    `
      SELECT COUNT(*)::int AS count
      FROM human_review_submissions
      WHERE submitter_key_hash = $1
        AND created_at >= $2
    `,
    [submitterKeyHash, windowStart],
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
  const submitterKeyHash = hashSubmitterKey(normalizedOwnerEmail)
  const submissionId = `human_submission_${randomUUID().replace(/-/g, '')}`

  return withDatabaseTransaction(async (client) => {
    await consumeCaptchaChallengeFromClient(
      client,
      {
        challengeId: input.captchaChallengeId,
        answer: input.captchaAnswer,
      },
      now,
    )
    await assertNoPendingDuplicate(client, normalizedSourceUrl)
    await assertSubmitterCooldown(client, submitterKeyHash, now)
    await assertSubmitterHourlyLimit(client, submitterKeyHash, now)

    await client.query(
      `
        INSERT INTO human_review_submissions (
          id,
          normalized_source_url,
          source_url,
          source_domain,
          owner_email,
          submitter_note,
          submitter_key_hash,
          status,
          review_notes,
          reviewed_at,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          'pending', NULL, NULL, $8, $8
        )
      `,
      [
        submissionId,
        normalizedSourceUrl,
        input.sourceUrl,
        sourceDomain,
        normalizedOwnerEmail,
        input.note?.trim() || null,
        submitterKeyHash,
        now.toISOString(),
      ],
    )

    return humanReviewSubmissionReceiptSchema.parse({
      queued: true,
      submissionId,
      sourceUrl: input.sourceUrl,
      sourceDomain,
      submittedAt: now.toISOString(),
      reviewHint:
        'Queued for Eddie / Karnival offline review. Nothing goes live until the reviewer accepts it.',
    })
  })
}
