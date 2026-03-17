import { describe, expect, it } from 'vitest'

describe('review orchestrator internal api client', () => {
  it('reads submissions, posts status updates, posts review results, and surfaces API failures', async () => {
    const client = await import('./internal-api')

    const okFetch: typeof fetch = async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url

      if (url.endsWith('/status')) {
        expect(init?.method).toBe('POST')
        return new Response(
          JSON.stringify({
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
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }

      if (url.endsWith('/review-result')) {
        return new Response(
          JSON.stringify({
            submission: {
              id: 'submission_1',
              headline: 'Queued headline',
              subject: 'Queued subject',
              category: 'social',
              summary:
                'Queued summary that is long enough for schema validation.',
              promisedDate: '2027-12-31T23:59:59.000Z',
              sourceUrl: 'https://example.com/source',
              sourceLabel: 'example.com',
              sourceDomain: 'example.com',
              sourceType: 'blog',
              tags: [],
              status: 'rejected',
              reviewNotes: 'Rejected.',
              linkedMarketId: null,
              submittedAt: '2026-03-17T00:00:00.000Z',
              updatedAt: '2026-03-17T00:00:30.000Z',
              reviewedAt: '2026-03-17T00:00:30.000Z',
              submittedBy: {
                id: 'agent_1',
                handle: 'alpha',
                displayName: 'Alpha',
              },
              sourceNote: null,
              sourcePublishedAt: null,
            },
            reviewResult: {
              runId: 'run_1',
              reviewer: 'eddie',
              verdict: 'reject',
              confidence: 0.31,
              summary: 'Rejected with strong evidence.',
              evidence: [],
              needsHumanReview: false,
              snapshotRef: null,
              linkedMarketId: 'optimus-customizable-2026',
              providerRunId: 'provider_1',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }

      return new Response(
        JSON.stringify({
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
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }

    await expect(
      client.readInternalPredictionSubmission('submission_1', okFetch),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'submission_1',
      }),
    )

    await expect(
      client.updateInternalPredictionSubmissionStatus(
        'submission_1',
        {
          status: 'in_review',
          note: 'Picked up.',
        },
        okFetch,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'in_review',
      }),
    )

    await expect(
      client.submitInternalPredictionReviewResult(
        'submission_1',
        {
          runId: 'run_1',
          reviewer: 'eddie',
          verdict: 'reject',
          confidence: 0.31,
          summary: 'Rejected with strong evidence.',
          evidence: [],
          needsHumanReview: false,
        },
        okFetch,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        submission: expect.objectContaining({
          status: 'rejected',
        }),
      }),
    )

    await expect(
      client.readInternalPredictionSubmission(
        'missing',
        async () =>
          new Response(JSON.stringify({ message: 'Prediction submission not found.' }), {
            status: 404,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    ).rejects.toThrow('Prediction submission not found.')
  })

  it('uses the global fetch implementation when no override is provided', async () => {
    const client = await import('./internal-api')
    const originalFetch = global.fetch

    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          id: 'submission_fetch',
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
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch

    try {
      await expect(
        client.readInternalPredictionSubmission('submission_fetch'),
      ).resolves.toEqual(
        expect.objectContaining({
          id: 'submission_fetch',
        }),
      )
    } finally {
      global.fetch = originalFetch
    }
  })

  it('falls back cleanly when the internal API returns non-JSON or null review-result fields', async () => {
    const client = await import('./internal-api')

    await expect(
      client.submitInternalPredictionReviewResult(
        'submission_2',
        {
          runId: 'run_2',
          reviewer: 'eddie',
          verdict: 'accept',
          confidence: 0.72,
          summary: 'Accepted for linkage review.',
          evidence: [],
          needsHumanReview: true,
          linkedMarketId: 'optimus-customizable-2026',
          providerRunId: 'provider_2',
        },
        async (_input, init) => {
          const rawBody =
            typeof init?.body === 'string' ? init.body : JSON.stringify({})
          const requestBody = JSON.parse(rawBody)
          expect(requestBody.linkedMarketId).toBe('optimus-customizable-2026')

          return new Response(
            JSON.stringify({
              submission: {
                id: 'submission_2',
                headline: 'Queued headline',
                subject: 'Queued subject',
                category: 'social',
                summary:
                  'Queued summary that is long enough for schema validation.',
                promisedDate: '2027-12-31T23:59:59.000Z',
                sourceUrl: 'https://example.com/source',
                sourceLabel: 'example.com',
                sourceDomain: 'example.com',
                sourceType: 'blog',
                tags: [],
                status: 'escalated',
                reviewNotes: 'Accepted for linkage review.',
                linkedMarketId: null,
                submittedAt: '2026-03-17T00:00:00.000Z',
                updatedAt: '2026-03-17T00:01:00.000Z',
                reviewedAt: '2026-03-17T00:01:00.000Z',
                submittedBy: {
                  id: 'agent_1',
                  handle: 'alpha',
                  displayName: 'Alpha',
                },
                sourceNote: null,
                sourcePublishedAt: null,
              },
              reviewResult: {
                runId: 'run_2',
                reviewer: 'eddie',
                verdict: 'accept',
                confidence: 0.72,
                summary: 'Accepted for linkage review.',
                evidence: [],
                needsHumanReview: true,
                linkedMarketId: null,
                providerRunId: null,
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        submission: expect.objectContaining({
          status: 'escalated',
        }),
      }),
    )

    await expect(
      client.readInternalPredictionSubmission(
        'bad',
        async () =>
          new Response('not json', {
            status: 500,
            headers: { 'content-type': 'text/plain' },
          }),
      ),
    ).rejects.toThrow('Internal API request failed with status 500.')

    await expect(
      client.submitInternalPredictionReviewResult(
        'submission_3',
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
              submission: {
                id: 'submission_3',
                headline: 'Queued headline',
                subject: 'Queued subject',
                category: 'social',
                summary:
                  'Queued summary that is long enough for schema validation.',
                promisedDate: '2027-12-31T23:59:59.000Z',
                sourceUrl: 'https://example.com/source',
                sourceLabel: 'example.com',
                sourceDomain: 'example.com',
                sourceType: 'blog',
                tags: [],
                status: 'rejected',
                reviewNotes: 'Reject fallback coverage.',
                linkedMarketId: null,
                submittedAt: '2026-03-17T00:00:00.000Z',
                updatedAt: '2026-03-17T00:01:00.000Z',
                reviewedAt: '2026-03-17T00:01:00.000Z',
                submittedBy: {
                  id: 'agent_1',
                  handle: 'alpha',
                  displayName: 'Alpha',
                },
                sourceNote: null,
                sourcePublishedAt: null,
              },
              reviewResult: null,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        submission: expect.objectContaining({
          status: 'rejected',
        }),
      }),
    )
  })
})
