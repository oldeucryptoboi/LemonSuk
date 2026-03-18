import { afterEach, describe, expect, it, vi } from 'vitest'

describe('dispatchToEddie', () => {
  afterEach(() => {
    delete process.env.EDDIE_BASE_URL
    delete process.env.EDDIE_API_KEY
    delete process.env.LEMONSUK_REVIEW_TOKEN
    vi.resetModules()
  })

  it('returns an immediate escalation result when no EDDIE endpoint is configured', async () => {
    const { dispatchToEddie } = await import('./eddie-client')

    await expect(
      dispatchToEddie({
        runId: 'run_1',
        leadId: 'lead_1',
        legacySubmissionId: 'submission_1',
        sourceUrl: 'https://example.com/post',
        snapshotText: 'The page promises a deadline.',
        snapshotRef: null,
      }),
    ).resolves.toEqual({
      mode: 'completed',
      result: expect.objectContaining({
        reviewer: 'eddie',
        verdict: 'escalate',
        needsHumanReview: true,
      }),
    })

    await expect(
      dispatchToEddie({
        runId: 'run_empty',
        leadId: 'lead_empty',
        sourceUrl: 'https://example.com/post',
        snapshotText: '',
        snapshotRef: null,
      }),
    ).resolves.toEqual({
      mode: 'completed',
      result: expect.objectContaining({
        evidence: [
          expect.objectContaining({
            excerpt: 'No snapshot text captured.',
          }),
        ],
      }),
    })
  })

  it('dispatches to the configured EDDIE endpoint and fails cleanly on bad responses', async () => {
    process.env.EDDIE_BASE_URL = 'https://eddie.example/api/plugins/lemonsuk'
    process.env.EDDIE_API_KEY = 'eddie-key'
    process.env.LEMONSUK_REVIEW_TOKEN = 'review-token'

    const { dispatchToEddie } = await import('./eddie-client')
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url

      expect(requestUrl).toBe(
        'https://eddie.example/api/plugins/lemonsuk?review_token=review-token',
      )

      return new Response(JSON.stringify({ providerRunId: 'provider_1' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      })
    })

    await expect(
      dispatchToEddie(
        {
          runId: 'run_2',
          leadId: 'lead_2',
          legacySubmissionId: 'submission_2',
          sourceUrl: 'https://example.com/post',
          snapshotText: 'The page promises a deadline.',
          snapshotRef: null,
        },
        fetchImpl,
      ),
    ).resolves.toEqual({
      mode: 'awaiting_callback',
      providerRunId: 'provider_1',
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://eddie.example/api/plugins/lemonsuk?review_token=review-token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer eddie-key',
        }),
      }),
    )

    await expect(
      dispatchToEddie(
        {
          runId: 'run_2',
          leadId: 'lead_2',
          sourceUrl: 'https://example.com/post',
          snapshotText: 'The page promises a deadline.',
          snapshotRef: null,
        },
        async () =>
          new Response(JSON.stringify({}), {
            status: 500,
            headers: {
              'content-type': 'application/json',
            },
          }),
      ),
    ).rejects.toThrow('EDDIE dispatch failed.')
  })
})
