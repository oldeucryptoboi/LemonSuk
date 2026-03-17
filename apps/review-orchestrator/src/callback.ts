import { createHmac, timingSafeEqual } from 'node:crypto'

import type { RequestHandler } from 'express'

import {
  submitInternalPredictionReviewResult,
  updateInternalPredictionSubmissionStatus,
} from './internal-api'
import { reviewOrchestratorConfig } from './config'
import { eddieCallbackPayloadSchema, normalizedCallbackResultSchema } from './types'

const maxCallbackAgeMs = 5 * 60 * 1_000

function signCallback(timestamp: string, rawBody: string): string {
  return createHmac('sha256', reviewOrchestratorConfig.eddieWebhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')
}

export function verifyEddieCallbackSignature(
  rawBody: string,
  timestamp: string | undefined,
  signature: string | undefined,
  now = Date.now(),
): void {
  if (!timestamp || !signature) {
    throw new Error('Missing EDDIE callback signature headers.')
  }

  const callbackAgeMs = Math.abs(now - Number(timestamp) * 1_000)
  if (!Number.isFinite(callbackAgeMs) || callbackAgeMs > maxCallbackAgeMs) {
    throw new Error('EDDIE callback timestamp is stale.')
  }

  const expectedSignature = signCallback(timestamp, rawBody)
  const provided = Buffer.from(signature)
  const expected = Buffer.from(expectedSignature)

  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    throw new Error('EDDIE callback signature is invalid.')
  }
}

export function createEddieCallbackHandler(): RequestHandler {
  return createEddieCallbackHandlerWithDependencies({})
}

type CallbackDependencies = {
  submitReviewResult?: typeof submitInternalPredictionReviewResult
  updateStatus?: typeof updateInternalPredictionSubmissionStatus
}

export function createEddieCallbackHandlerWithDependencies(
  dependencies: CallbackDependencies,
): RequestHandler {
  const submitReviewResult =
    dependencies.submitReviewResult ?? submitInternalPredictionReviewResult
  const updateStatus =
    dependencies.updateStatus ?? updateInternalPredictionSubmissionStatus

  return async (request, response) => {
    try {
      const rawBody = Buffer.isBuffer(request.body)
        ? request.body.toString('utf8')
        : JSON.stringify(request.body ?? {})

      verifyEddieCallbackSignature(
        rawBody,
        request.header('x-eddie-timestamp'),
        request.header('x-eddie-signature'),
      )

      const payload = eddieCallbackPayloadSchema.parse(JSON.parse(rawBody))

      if (payload.status === 'failed') {
        await updateStatus(payload.submissionId, {
          status: 'failed',
          runId: payload.runId,
          providerRunId: payload.providerRunId,
          note: payload.errorMessage ?? 'EDDIE review failed.',
        })
        response.status(202).json({ ok: true })
        return
      }

      await submitReviewResult(
        payload.submissionId,
        normalizedCallbackResultSchema.parse({
          runId: payload.runId,
          reviewer: 'eddie',
          verdict: payload.verdict,
          confidence: payload.confidence,
          summary: payload.summary,
          evidence: payload.evidence ?? [],
          needsHumanReview: payload.needsHumanReview ?? false,
          snapshotRef: payload.snapshotRef ?? null,
          providerRunId: payload.providerRunId,
        }),
      )

      response.status(202).json({ ok: true })
    } catch (error) {
      response.status(400).json({
        message:
          error instanceof Error
            ? error.message
            : 'Could not process EDDIE callback.',
      })
    }
  }
}
