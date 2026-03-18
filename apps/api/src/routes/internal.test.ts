import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

describe('createInternalRouter', () => {
  function buildLead(id: string) {
    return {
      id,
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
    }
  }

  function buildLeadQueue() {
    return {
      pendingCount: 1,
      items: [buildLead('lead_1')],
    }
  }

  async function buildRouteApp() {
    const { createInternalRouter } = await import('./internal')
    const app = express()
    app.use(express.json())
    app.use('/api/v1', createInternalRouter())
    app.use(
      (
        error: unknown,
        _request: express.Request,
        response: express.Response,
        _next: express.NextFunction,
      ) => {
        response.status(500).json({
          message:
            error instanceof Error ? error.message : 'Internal server error.',
        })
      },
    )
    return app
  }

  it('requires auth and supports lead inbox/detail/status/result routes', async () => {
    vi.resetModules()

    const readPendingPredictionLeads = vi.fn(async () => buildLeadQueue())
    const readPredictionLeadForInternal = vi.fn(async (leadId: string) =>
      leadId === 'missing' ? null : buildLead(leadId),
    )
    const readPredictionLeadInspectionForInternal = vi.fn(async (leadId: string) =>
      leadId === 'missing'
        ? null
        : {
            lead: buildLead(leadId),
            relatedPendingLeads: [],
            recentReviewedLeads: [],
            recentReviewResults: [],
          },
    )
    const updatePredictionLeadStatusForInternal = vi.fn(async () => ({
      ...buildLead('lead_1'),
      status: 'in_review',
      reviewNotes: 'Picked up.',
    }))
    const applyPredictionLeadReviewResultForInternal = vi.fn(async () => ({
      lead: {
        ...buildLead('lead_1'),
        status: 'accepted',
        linkedMarketId: 'optimus-customizable-2026',
        reviewedAt: '2026-03-17T00:00:30.000Z',
      },
      reviewResult: {
        runId: 'run_2',
      },
    }))
    const publishCurrentOperationalSnapshot = vi.fn(async () => ({}))

    vi.doMock('../services/lead-intake', () => ({
      readPendingPredictionLeads,
    }))
    vi.doMock('../services/lead-review-workflow', () => ({
      readPredictionLeadForInternal,
      readPredictionLeadInspectionForInternal,
      updatePredictionLeadStatusForInternal,
      applyPredictionLeadReviewResultForInternal,
    }))
    vi.doMock('./helpers', () => ({
      publishCurrentOperationalSnapshot,
    }))

    const app = await buildRouteApp()

    expect((await request(app).get('/api/v1/internal/leads')).statusCode).toBe(401)

    const authorization = {
      authorization: 'Bearer lemonsuk-dev-internal-service-token',
    }

    expect(
      (
        await request(app)
          .get('/api/v1/internal/leads?limit=40')
          .set(authorization)
      ).body.pendingCount,
    ).toBe(1)
    expect(readPendingPredictionLeads).toHaveBeenCalledWith({ limit: 40 })

    expect(
      (
        await request(app)
          .get('/api/v1/internal/leads/missing')
          .set(authorization)
      ).statusCode,
    ).toBe(404)

    expect(
      (
        await request(app)
          .get('/api/v1/internal/leads/lead_1')
          .set(authorization)
      ).body.id,
    ).toBe('lead_1')
    expect(
      (
        await request(app)
          .get('/api/v1/internal/leads/lead_1/inspect')
          .set(authorization)
      ).body.lead.id,
    ).toBe('lead_1')
    expect(
      (
        await request(app)
          .get('/api/v1/internal/leads/missing/inspect')
          .set(authorization)
      ).statusCode,
    ).toBe(404)

    expect(
      (
        await request(app)
          .post('/api/v1/internal/leads/lead_1/status')
          .set(authorization)
          .send({
            status: 'in_review',
            runId: 'run_1',
            note: 'Picked up.',
          })
      ).statusCode,
    ).toBe(200)
    expect(updatePredictionLeadStatusForInternal).toHaveBeenCalledWith(
      'lead_1',
      expect.objectContaining({
        status: 'in_review',
      }),
    )

    expect(
      (
        await request(app)
          .post('/api/v1/internal/leads/lead_1/review-result')
          .set(authorization)
          .send({
            runId: 'run_2',
            reviewer: 'eddie',
            verdict: 'accept',
            confidence: 0.8,
            summary:
              'This review result is long enough to validate and should be accepted by the route.',
            evidence: [
              {
                url: 'https://example.com/source',
                excerpt: 'This source should be accepted.',
              },
            ],
            needsHumanReview: false,
            linkedMarketId: 'optimus-customizable-2026',
          })
      ).statusCode,
    ).toBe(200)
    expect(applyPredictionLeadReviewResultForInternal).toHaveBeenCalledTimes(1)
    expect(publishCurrentOperationalSnapshot).toHaveBeenCalledTimes(2)
  })

  it('maps lead workflow errors and fallback messages', async () => {
    vi.resetModules()

    const publishCurrentOperationalSnapshot = vi.fn(async () => ({}))
    const readPendingPredictionLeads = vi.fn(async () => {
      throw 'queue-failed'
    })
    const readPredictionLeadForInternal = vi.fn(async () => {
      throw new Error('lead-read-failed')
    })
    const readPredictionLeadInspectionForInternal = vi.fn(async () => {
      throw new Error('lead-inspect-failed')
    })
    const updatePredictionLeadStatusForInternal = vi
      .fn()
      .mockRejectedValueOnce(new Error('Prediction lead not found.'))
      .mockRejectedValueOnce(
        new Error('Prediction lead is no longer pending review.'),
      )
      .mockRejectedValueOnce('status-failed')
    const applyPredictionLeadReviewResultForInternal = vi
      .fn()
      .mockRejectedValueOnce(new Error('Prediction lead not found.'))
      .mockRejectedValueOnce(new Error('Linked market not found.'))
      .mockRejectedValueOnce('result-failed')

    vi.doMock('../services/lead-intake', () => ({
      readPendingPredictionLeads,
    }))
    vi.doMock('../services/lead-review-workflow', () => ({
      readPredictionLeadForInternal,
      readPredictionLeadInspectionForInternal,
      updatePredictionLeadStatusForInternal,
      applyPredictionLeadReviewResultForInternal,
    }))
    vi.doMock('./helpers', () => ({
      publishCurrentOperationalSnapshot,
    }))

    const app = await buildRouteApp()
    const authorization = {
      authorization: 'Bearer lemonsuk-dev-internal-service-token',
    }

    expect(
      (
        await request(app)
          .get('/api/v1/internal/leads')
          .set(authorization)
      ).body.message,
    ).toBe('Internal server error.')

    expect(
      (
        await request(app)
          .get('/api/v1/internal/leads/lead_1')
          .set(authorization)
      ).body.message,
    ).toBe('lead-read-failed')
    expect(
      (
        await request(app)
          .get('/api/v1/internal/leads/lead_1/inspect')
          .set(authorization)
      ).body.message,
    ).toBe('lead-inspect-failed')

    expect(
      (
        await request(app)
          .post('/api/v1/internal/leads/lead_1/status')
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
          .post('/api/v1/internal/leads/lead_1/status')
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
          .post('/api/v1/internal/leads/lead_1/status')
          .set(authorization)
          .send({
            status: 'failed',
            note: 'fallback',
          })
      ).body.message,
    ).toBe('Could not update lead status.')

    expect(
      (
        await request(app)
          .post('/api/v1/internal/leads/lead_1/review-result')
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
          .post('/api/v1/internal/leads/lead_1/review-result')
          .set(authorization)
          .send({
            runId: 'run_2',
            reviewer: 'eddie',
            verdict: 'accept',
            confidence: 0.8,
            summary:
              'This review result is long enough to validate and should be accepted by the route.',
            evidence: [
              {
                url: 'https://example.com/source',
                excerpt: 'This source should be accepted.',
              },
            ],
            needsHumanReview: false,
            linkedMarketId: 'missing-market',
          })
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await request(app)
          .post('/api/v1/internal/leads/lead_1/review-result')
          .set(authorization)
          .send({
            runId: 'run_3',
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
    ).toBe('Could not apply prediction lead review result.')

    expect(publishCurrentOperationalSnapshot).not.toHaveBeenCalled()
  })
})
