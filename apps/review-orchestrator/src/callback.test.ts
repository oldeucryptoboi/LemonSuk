import { createHmac } from 'node:crypto'

import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

import type { InternalPredictionLead } from '../../../packages/shared/src/types'

describe('EDDIE callback handling', () => {
  function buildLead(
    overrides: Partial<InternalPredictionLead> = {},
  ): InternalPredictionLead {
    return {
      id: 'lead_1',
      leadType: 'structured_agent_lead',
      submittedByAgentId: 'agent_1',
      submittedByOwnerEmail: null,
      sourceUrl: 'https://example.com/source',
      normalizedSourceUrl: 'https://example.com/source',
      sourceLabel: 'example.com',
      sourceDomain: 'example.com',
      sourceType: 'blog',
      sourceNote: null,
      sourcePublishedAt: null,
      claimedHeadline: 'Queued headline',
      claimedSubject: 'Queued subject',
      claimedCategory: 'social',
      familyId: null,
      familySlug: null,
      familyDisplayName: null,
      primaryEntityId: null,
      primaryEntitySlug: null,
      primaryEntityDisplayName: null,
      eventGroupId: null,
      promisedDate: '2027-12-31T23:59:59.000Z',
      summary: 'Queued summary that is long enough for schema validation.',
      tags: [],
      status: 'pending',
      spamScore: 0,
      duplicateOfLeadId: null,
      duplicateOfMarketId: null,
      reviewNotes: null,
      linkedMarketId: null,
      reviewedAt: null,
      legacyAgentSubmissionId: 'submission_1',
      legacyHumanSubmissionId: null,
      createdAt: '2026-03-17T00:00:00.000Z',
      updatedAt: '2026-03-17T00:00:00.000Z',
      submittedBy: {
        id: 'agent_1',
        handle: 'alpha',
        displayName: 'Alpha',
      },
      ...overrides,
    }
  }

  function sign(rawBody: string, timestamp: string): string {
    return createHmac('sha256', 'lemonsuk-dev-eddie-webhook-secret')
      .update(`${timestamp}.${rawBody}`)
      .digest('hex')
  }

  it('verifies callback signatures', async () => {
    const { verifyEddieCallbackSignature } = await import('./callback')

    const rawBody = JSON.stringify({
      runId: 'run_1',
      leadId: 'lead_1',
      status: 'failed',
      errorMessage: 'Nope.',
    })
    const timestamp = String(Math.floor(Date.now() / 1000))

    expect(() =>
      verifyEddieCallbackSignature(rawBody, timestamp, sign(rawBody, timestamp)),
    ).not.toThrow()

    expect(() =>
      verifyEddieCallbackSignature(rawBody, timestamp, 'bad-signature'),
    ).toThrow('EDDIE callback signature is invalid.')

    expect(() =>
      verifyEddieCallbackSignature(rawBody, undefined, undefined),
    ).toThrow('Missing EDDIE callback signature headers.')

    expect(() =>
      verifyEddieCallbackSignature(
        rawBody,
        '1',
        sign(rawBody, '1'),
        new Date('2026-03-17T00:10:00.000Z').getTime(),
      ),
    ).toThrow('EDDIE callback timestamp is stale.')
  })

  it('handles completed and failed callbacks through the internal API', async () => {
    const submitInternalPredictionReviewResult = vi.fn(async () => ({
      lead: buildLead({ reviewedAt: '2026-03-17T00:10:00.000Z' }),
    }))
    const updateInternalPredictionLeadStatus = vi.fn(async () =>
      buildLead({
        id: 'lead_2',
        status: 'failed',
        reviewNotes: 'Provider timeout.',
        reviewedAt: '2026-03-17T00:11:00.000Z',
      }),
    )

    const { createEddieCallbackHandlerWithDependencies } = await import(
      './callback'
    )
    const app = express()
    app.post(
      '/review/callback/eddie',
      express.raw({ type: 'application/json' }),
      createEddieCallbackHandlerWithDependencies({
        submitReviewResult: submitInternalPredictionReviewResult,
        updateStatus: updateInternalPredictionLeadStatus,
      }),
    )

    const timestamp = String(Math.floor(Date.now() / 1000))
    const completedBody = JSON.stringify({
      runId: 'run_1',
      leadId: 'lead_1',
      legacySubmissionId: 'submission_1',
      status: 'completed',
      verdict: 'reject',
      confidence: 0.3,
      summary:
        'This callback carries a valid completed review payload for testing.',
      evidence: [
        {
          url: 'https://example.com/post',
          excerpt: 'Testing callback evidence.',
        },
      ],
      needsHumanReview: false,
    })

    expect(
      (
        await request(app)
          .post('/review/callback/eddie')
          .set('x-eddie-timestamp', timestamp)
          .set('x-eddie-signature', sign(completedBody, timestamp))
          .set('content-type', 'application/json')
          .send(completedBody)
      ).statusCode,
    ).toBe(202)
    expect(submitInternalPredictionReviewResult).toHaveBeenCalled()

    const failedBody = JSON.stringify({
      runId: 'run_2',
      leadId: 'lead_2',
      status: 'failed',
      errorMessage: 'Provider timeout.',
    })

    expect(
      (
        await request(app)
          .post('/review/callback/eddie')
          .set('x-eddie-timestamp', timestamp)
          .set('x-eddie-signature', sign(failedBody, timestamp))
          .set('content-type', 'application/json')
          .send(failedBody)
      ).statusCode,
    ).toBe(202)
    expect(updateInternalPredictionLeadStatus).toHaveBeenCalledWith(
      'lead_2',
      expect.objectContaining({
        status: 'failed',
      }),
    )

    const failedWithoutErrorMessage = JSON.stringify({
      runId: 'run_2b',
      leadId: 'lead_2b',
      status: 'failed',
    })

    expect(
      (
        await request(app)
          .post('/review/callback/eddie')
          .set('x-eddie-timestamp', timestamp)
          .set('x-eddie-signature', sign(failedWithoutErrorMessage, timestamp))
          .set('content-type', 'application/json')
          .send(failedWithoutErrorMessage)
      ).statusCode,
    ).toBe(202)
    expect(updateInternalPredictionLeadStatus).toHaveBeenLastCalledWith(
      'lead_2b',
      expect.objectContaining({
        note: 'EDDIE review failed.',
      }),
    )

    expect(
      (
        await request(app)
          .post('/review/callback/eddie')
          .set('x-eddie-timestamp', timestamp)
          .set('x-eddie-signature', 'bad-signature')
          .set('content-type', 'application/json')
          .send(failedBody)
      ).body.message,
    ).toBe('EDDIE callback signature is invalid.')
  })

  it('creates the default callback handler and returns fallback error copy for non-Error failures', async () => {
    const { createEddieCallbackHandler, createEddieCallbackHandlerWithDependencies } =
      await import('./callback')

    expect(typeof createEddieCallbackHandler()).toBe('function')

    const app = express()
    app.use(express.json())
    app.post(
      '/review/callback/eddie',
      createEddieCallbackHandlerWithDependencies({
        submitReviewResult: vi.fn(async () => {
          throw 'bad-callback'
        }),
      }),
    )

    const timestamp = String(Math.floor(Date.now() / 1000))
    const completedBody = JSON.stringify({
      runId: 'run_3',
      leadId: 'lead_3',
      status: 'completed',
      verdict: 'accept',
      confidence: 0.7,
      summary:
        'This callback payload is intentionally routed through express.json.',
    })

    expect(
      (
        await request(app)
          .post('/review/callback/eddie')
          .set('x-eddie-timestamp', timestamp)
          .set('x-eddie-signature', sign(completedBody, timestamp))
          .send(JSON.parse(completedBody))
      ).body.message,
    ).toBe('Could not process EDDIE callback.')

    const emptyBody = '{}'
    expect(
      (
        await request(app)
          .post('/review/callback/eddie')
          .set('x-eddie-timestamp', timestamp)
          .set('x-eddie-signature', sign(emptyBody, timestamp))
          .send()
      ).body.message,
    ).toContain('Invalid input')
  })
})
