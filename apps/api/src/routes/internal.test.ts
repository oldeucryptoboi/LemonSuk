import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

describe('createInternalRouter', () => {
  it('requires the internal bearer token and supports reading, status updates, and review results', async () => {
    vi.resetModules()

    const readPredictionSubmissionForInternal = vi.fn(async (submissionId: string) =>
      submissionId === 'missing'
        ? null
        : {
            id: submissionId,
            headline: 'Queued headline',
            subject: 'Queued subject',
            category: 'social',
            summary: 'Queued summary that is long enough for schema validation.',
            promisedDate: '2027-12-31T23:59:59.000Z',
            sourceUrl: 'https://example.com/source',
            sourceLabel: 'example.com',
            sourceDomain: 'example.com',
            sourceType: 'blog',
            tags: [],
            status: 'pending',
            reviewNotes: null,
            linkedMarketId: null,
            submittedAt: '2026-03-17T00:00:00.000Z',
            updatedAt: '2026-03-17T00:00:00.000Z',
            reviewedAt: null,
            submittedBy: {
              id: 'agent_1',
              handle: 'alpha',
              displayName: 'Alpha',
            },
            sourceNote: null,
            sourcePublishedAt: null,
          },
    )
    const updatePredictionSubmissionStatusForInternal = vi.fn(async () => ({
      id: 'submission_1',
      headline: 'Queued headline',
      subject: 'Queued subject',
      category: 'social',
      summary: 'Queued summary that is long enough for schema validation.',
      promisedDate: '2027-12-31T23:59:59.000Z',
      sourceUrl: 'https://example.com/source',
      sourceLabel: 'example.com',
      sourceDomain: 'example.com',
      sourceType: 'blog',
      tags: [],
      status: 'in_review',
      reviewNotes: 'Picked up.',
      linkedMarketId: null,
      submittedAt: '2026-03-17T00:00:00.000Z',
      updatedAt: '2026-03-17T00:00:30.000Z',
      reviewedAt: null,
      submittedBy: {
        id: 'agent_1',
        handle: 'alpha',
        displayName: 'Alpha',
      },
      sourceNote: null,
      sourcePublishedAt: null,
    }))
    const applyPredictionReviewResultForInternal = vi.fn(async () => ({
      submission: await readPredictionSubmissionForInternal('submission_1'),
      reviewResult: {
        runId: 'run_1',
      },
    }))

    vi.doMock('../services/review-workflow', () => ({
      readPredictionSubmissionForInternal,
      updatePredictionSubmissionStatusForInternal,
      applyPredictionReviewResultForInternal,
    }))
    vi.doMock('./helpers', () => ({
      publishCurrentOperationalSnapshot: vi.fn(async () => ({})),
    }))

    const { createInternalRouter } = await import('./internal')
    const app = express()
    app.use(express.json())
    app.use('/api/v1', createInternalRouter())

    expect(
      (await request(app).get('/api/v1/internal/prediction-submissions/submission_1'))
        .statusCode,
    ).toBe(401)

    expect(
      (
        await request(app)
          .get('/api/v1/internal/prediction-submissions/missing')
          .set(
            'authorization',
            'Bearer lemonsuk-dev-internal-service-token',
          )
      ).statusCode,
    ).toBe(404)

    const getResponse = await request(app)
      .get('/api/v1/internal/prediction-submissions/submission_1')
      .set('authorization', 'Bearer lemonsuk-dev-internal-service-token')
    expect(getResponse.statusCode).toBe(200)
    expect(getResponse.body.id).toBe('submission_1')

    const statusResponse = await request(app)
      .post('/api/v1/internal/prediction-submissions/submission_1/status')
      .set('authorization', 'Bearer lemonsuk-dev-internal-service-token')
      .send({
        status: 'in_review',
        runId: 'run_1',
        note: 'Picked up.',
      })
    expect(statusResponse.statusCode).toBe(200)
    expect(updatePredictionSubmissionStatusForInternal).toHaveBeenCalledWith(
      'submission_1',
      expect.objectContaining({
        status: 'in_review',
      }),
    )

    const resultResponse = await request(app)
      .post('/api/v1/internal/prediction-submissions/submission_1/review-result')
      .set('authorization', 'Bearer lemonsuk-dev-internal-service-token')
      .send({
        runId: 'run_1',
        reviewer: 'eddie',
        verdict: 'reject',
        confidence: 0.4,
        summary:
          'This review result is long enough to validate and should be accepted by the route.',
        evidence: [
          {
            url: 'https://example.com/source',
            excerpt: 'This source should be rejected.',
          },
        ],
        needsHumanReview: false,
      })
    expect(resultResponse.statusCode).toBe(200)
    expect(applyPredictionReviewResultForInternal).toHaveBeenCalled()
  })

  it('uses fallback route error copy for non-Error failures', async () => {
    vi.resetModules()

    vi.doMock('../services/review-workflow', () => ({
      readPredictionSubmissionForInternal: vi.fn(async () => {
        throw 'read-failed'
      }),
      updatePredictionSubmissionStatusForInternal: vi.fn(async () => {
        throw 'status-failed'
      }),
      applyPredictionReviewResultForInternal: vi.fn(async () => {
        throw 'result-failed'
      }),
    }))
    vi.doMock('./helpers', () => ({
      publishCurrentOperationalSnapshot: vi.fn(async () => ({})),
    }))

    const { createInternalRouter } = await import('./internal')
    const app = express()
    app.use(express.json())
    app.use('/api/v1', createInternalRouter())

    const authorization = {
      authorization: 'Bearer lemonsuk-dev-internal-service-token',
    }

    expect(
      (
        await request(app)
          .post('/api/v1/internal/prediction-submissions/submission_1/status')
          .set(authorization)
          .send({
            status: 'failed',
            note: 'nope',
          })
      ).body.message,
    ).toBe('Could not update submission status.')

    expect(
      (
        await request(app)
          .post('/api/v1/internal/prediction-submissions/submission_1/review-result')
          .set(authorization)
          .send({
            runId: 'run_1',
            reviewer: 'eddie',
            verdict: 'reject',
            confidence: 0.4,
            summary:
              'This review result is long enough to validate and should be accepted by the route.',
            evidence: [
              {
                url: 'https://example.com/source',
                excerpt: 'This source should be rejected.',
              },
            ],
            needsHumanReview: false,
          })
      ).body.message,
    ).toBe('Could not apply prediction review result.')
  })

  it('maps known workflow errors to 404 and 400 responses', async () => {
    vi.resetModules()

    vi.doMock('../services/review-workflow', () => ({
      readPredictionSubmissionForInternal: vi.fn(async () => ({
        id: 'submission_1',
        headline: 'Queued headline',
        subject: 'Queued subject',
        category: 'social',
        summary: 'Queued summary that is long enough for schema validation.',
        promisedDate: '2027-12-31T23:59:59.000Z',
        sourceUrl: 'https://example.com/source',
        sourceLabel: 'example.com',
        sourceDomain: 'example.com',
        sourceType: 'blog',
        tags: [],
        status: 'pending',
        reviewNotes: null,
        linkedMarketId: null,
        submittedAt: '2026-03-17T00:00:00.000Z',
        updatedAt: '2026-03-17T00:00:00.000Z',
        reviewedAt: null,
        submittedBy: {
          id: 'agent_1',
          handle: 'alpha',
          displayName: 'Alpha',
        },
        sourceNote: null,
        sourcePublishedAt: null,
      })),
      updatePredictionSubmissionStatusForInternal: vi
        .fn()
        .mockRejectedValueOnce(new Error('Prediction submission not found.'))
        .mockRejectedValueOnce(
          new Error('Prediction submission is no longer pending review.'),
        ),
      applyPredictionReviewResultForInternal: vi
        .fn()
        .mockRejectedValueOnce(new Error('Prediction submission not found.'))
        .mockRejectedValueOnce(new Error('Linked market not found.')),
    }))
    vi.doMock('./helpers', () => ({
      publishCurrentOperationalSnapshot: vi.fn(async () => ({})),
    }))

    const { createInternalRouter } = await import('./internal')
    const app = express()
    app.use(express.json())
    app.use('/api/v1', createInternalRouter())

    const authorization = {
      authorization: 'Bearer lemonsuk-dev-internal-service-token',
    }

    expect(
      (
        await request(app)
          .post('/api/v1/internal/prediction-submissions/submission_1/status')
          .set(authorization)
          .send({
            status: 'failed',
            note: 'missing',
          })
      ).statusCode,
    ).toBe(404)

    expect(
      (
        await request(app)
          .post('/api/v1/internal/prediction-submissions/submission_1/status')
          .set(authorization)
          .send({
            status: 'failed',
            note: 'terminal',
          })
      ).statusCode,
    ).toBe(400)

    expect(
      (
        await request(app)
          .post('/api/v1/internal/prediction-submissions/submission_1/review-result')
          .set(authorization)
          .send({
            runId: 'run_1',
            reviewer: 'eddie',
            verdict: 'reject',
            confidence: 0.4,
            summary:
              'This review result is long enough to validate and should be accepted by the route.',
            evidence: [
              {
                url: 'https://example.com/source',
                excerpt: 'This source should be rejected.',
              },
            ],
            needsHumanReview: false,
          })
      ).statusCode,
    ).toBe(404)

    expect(
      (
        await request(app)
          .post('/api/v1/internal/prediction-submissions/submission_1/review-result')
          .set(authorization)
          .send({
            runId: 'run_2',
            reviewer: 'eddie',
            verdict: 'accept',
            confidence: 0.8,
            summary:
              'This review result should fail with a market-link validation error.',
            evidence: [
              {
                url: 'https://example.com/source',
                excerpt: 'This source should be linked but is not.',
              },
            ],
            needsHumanReview: false,
          })
      ).body.message,
    ).toBe('Linked market not found.')
  })
})
