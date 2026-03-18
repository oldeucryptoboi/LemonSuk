import { describe, expect, it } from 'vitest'

describe('review orchestrator internal api client', () => {
  function buildLead(overrides: Record<string, unknown> = {}) {
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

  function buildQueue() {
    return {
      pendingCount: 1,
      items: [buildLead()],
    }
  }

  it('reads, updates, lists, and reviews lead records through the internal api', async () => {
    const client = await import('./internal-api')

    const okFetch: typeof fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url

      if (url.includes('/internal/leads?limit=10')) {
        return new Response(JSON.stringify(buildQueue()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url.endsWith('/internal/leads/lead_1/status')) {
        expect(init?.method).toBe('POST')
        return new Response(
          JSON.stringify(buildLead({ status: 'in_review', reviewNotes: 'Picked up.' })),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }

      if (url.endsWith('/internal/leads/lead_1/review-result')) {
        return new Response(
          JSON.stringify({
            lead: buildLead({
              status: 'accepted',
              reviewNotes: 'Accepted.',
              linkedMarketId: 'optimus-customizable-2026',
              reviewedAt: '2026-03-17T00:00:40.000Z',
            }),
            reviewResult: {
              runId: 'run_2',
              reviewer: 'eddie',
              verdict: 'accept',
              confidence: 0.74,
              summary: 'Accepted with clear matching evidence.',
              evidence: [],
              needsHumanReview: false,
              snapshotRef: null,
              linkedMarketId: 'optimus-customizable-2026',
              providerRunId: 'provider_2',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }

      if (url.endsWith('/internal/leads/missing')) {
        return new Response(
          JSON.stringify({ message: 'Prediction lead not found.' }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        )
      }

      return new Response(JSON.stringify(buildLead()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    await expect(
      client.readPendingInternalPredictionLeads(10, okFetch),
    ).resolves.toEqual(expect.objectContaining({ pendingCount: 1 }))
    await expect(
      client.readPendingInternalPredictionLeads(undefined, async (input) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url

        expect(url.endsWith('/internal/leads')).toBe(true)

        return new Response(JSON.stringify(buildQueue()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    ).resolves.toEqual(expect.objectContaining({ pendingCount: 1 }))
    await expect(client.readInternalPredictionLead('lead_1', okFetch)).resolves.toEqual(
      expect.objectContaining({ id: 'lead_1' }),
    )
    await expect(
      client.updateInternalPredictionLeadStatus(
        'lead_1',
        {
          status: 'in_review',
          note: 'Picked up.',
        },
        okFetch,
      ),
    ).resolves.toEqual(expect.objectContaining({ status: 'in_review' }))
    await expect(
      client.submitInternalPredictionLeadReviewResult(
        'lead_1',
        {
          runId: 'run_2',
          reviewer: 'eddie',
          verdict: 'accept',
          confidence: 0.74,
          summary: 'Accepted with clear matching evidence.',
          evidence: [],
          needsHumanReview: false,
          linkedMarketId: 'optimus-customizable-2026',
        },
        okFetch,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        lead: expect.objectContaining({
          status: 'accepted',
        }),
      }),
    )

    await expect(client.readInternalPredictionLead('missing', okFetch)).rejects.toThrow(
      'Prediction lead not found.',
    )
  })

  it('uses the global fetch implementation and falls back cleanly on sparse review results', async () => {
    const client = await import('./internal-api')
    const originalFetch = global.fetch

    global.fetch = (async (input) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url

      if (url.includes('/internal/leads?limit=5')) {
        return new Response(JSON.stringify(buildQueue()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      return new Response(JSON.stringify(buildLead({ id: 'lead_fetch' })), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    try {
      await expect(client.readPendingInternalPredictionLeads(5)).resolves.toEqual(
        expect.objectContaining({ pendingCount: 1 }),
      )
      await expect(client.readInternalPredictionLead('lead_fetch')).resolves.toEqual(
        expect.objectContaining({ id: 'lead_fetch' }),
      )
    } finally {
      global.fetch = originalFetch
    }

    await expect(
      client.submitInternalPredictionLeadReviewResult(
        'lead_2',
        {
          runId: 'run_3',
          reviewer: 'eddie',
          verdict: 'reject',
          confidence: 0.2,
          summary: 'Reject fallback coverage.',
          evidence: [
            {
              url: 'https://example.com/source',
              excerpt: 'Fallback evidence.',
            },
          ],
          needsHumanReview: false,
          snapshotRef: 'snapshot://fallback',
        },
        async () =>
          new Response(
            JSON.stringify({
              lead: buildLead({
                id: 'lead_2',
                status: 'rejected',
                reviewNotes: 'Reject fallback coverage.',
                reviewedAt: '2026-03-17T00:01:00.000Z',
              }),
              reviewResult: null,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        lead: expect.objectContaining({
          status: 'rejected',
        }),
      }),
    )

    await expect(
      client.readInternalPredictionLead(
        'bad',
        async () =>
          new Response('not json', {
            status: 500,
            headers: { 'content-type': 'text/plain' },
          }),
      ),
    ).rejects.toThrow('Internal API request failed with status 500.')
  })
})
