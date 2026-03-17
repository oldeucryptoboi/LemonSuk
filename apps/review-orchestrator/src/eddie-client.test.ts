import { afterEach, describe, expect, it, vi } from 'vitest'

describe('dispatchToEddie', () => {
  afterEach(() => {
    delete process.env.EDDIE_BASE_URL
    delete process.env.EDDIE_API_KEY
    vi.resetModules()
  })

  it('returns an immediate escalation result when no EDDIE endpoint is configured', async () => {
    const { dispatchToEddie } = await import('./eddie-client')

    await expect(
      dispatchToEddie({
        runId: 'run_1',
        submissionId: 'submission_1',
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
        submissionId: 'submission_empty',
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
    process.env.EDDIE_BASE_URL = 'https://eddie.example'
    process.env.EDDIE_API_KEY = 'eddie-key'

    const { dispatchToEddie } = await import('./eddie-client')

    await expect(
      dispatchToEddie(
        {
          runId: 'run_2',
          submissionId: 'submission_2',
          sourceUrl: 'https://example.com/post',
          snapshotText: 'The page promises a deadline.',
          snapshotRef: null,
        },
        async () =>
          new Response(JSON.stringify({ providerRunId: 'provider_1' }), {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          }),
      ),
    ).resolves.toEqual({
      mode: 'awaiting_callback',
      providerRunId: 'provider_1',
    })

    await expect(
      dispatchToEddie(
        {
          runId: 'run_2',
          submissionId: 'submission_2',
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
