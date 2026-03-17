import { describe, expect, it, vi } from 'vitest'

import { setupApiContext } from '../../../../test/helpers/api-context'

function solveCaptcha(prompt: string): string {
  const match = prompt.match(/slug:\s+([a-z]+-[a-z]+)-(\d+)\+(\d+)\./i)

  if (!match) {
    throw new Error(`Could not solve captcha prompt: ${prompt}`)
  }

  return `${match[1]}-${Number(match[2]) + Number(match[3])}`
}

async function createCaptchaAnswer(
  context: Awaited<ReturnType<typeof setupApiContext>>,
) {
  const challenge = await context.identity.createCaptchaChallenge()

  return {
    captchaChallengeId: challenge.id,
    captchaAnswer: solveCaptcha(challenge.prompt),
  }
}

describe('human review submissions', () => {
  it('normalizes URLs and enforces duplicate, cooldown, and hourly limits', async () => {
    const context = await setupApiContext()
    const reviewSubmissions = await import('./human-review-submissions')
    const utils = await import('./utils')

    expect(
      utils.normalizeSourceUrl(
        'https://X.com/ElonMusk/status/123?b=2&a=1#thread',
      ),
    ).toBe('https://x.com/ElonMusk/status/123?a=1&b=2')
    expect(utils.normalizeSourceUrl('https://Example.org/')).toBe(
      'https://example.org/',
    )

    const firstReceipt = await reviewSubmissions.createHumanReviewSubmission(
      {
        sourceUrl: 'https://x.com/elonmusk/status/123?b=2&a=1#thread',
        note: 'This has an explicit date in the linked thread.',
        ...(await createCaptchaAnswer(context)),
      },
      'owner1@example.com',
      new Date('2026-03-17T12:00:00.000Z'),
    )

    expect(firstReceipt).toEqual({
      queued: true,
      submissionId: expect.stringMatching(/^human_submission_/),
      sourceUrl: 'https://x.com/elonmusk/status/123?b=2&a=1#thread',
      sourceDomain: 'x.com',
      submittedAt: '2026-03-17T12:00:00.000Z',
      reviewHint: expect.stringContaining('offline review'),
    })

    expect(
      await reviewSubmissions.createHumanReviewSubmission(
        {
          sourceUrl: 'https://example.org/',
          ...(await createCaptchaAnswer(context)),
        },
        'owner3@example.com',
        new Date('2026-03-17T12:01:00.000Z'),
      ),
    ).toEqual(
      expect.objectContaining({
        sourceUrl: 'https://example.org/',
        sourceDomain: 'example.org',
      }),
    )

    await expect(
      reviewSubmissions.createHumanReviewSubmission(
        {
          sourceUrl: 'https://x.com/elonmusk/status/123?a=1&b=2',
          ...(await createCaptchaAnswer(context)),
        },
        'owner2@example.com',
        new Date('2026-03-17T12:04:00.000Z'),
      ),
    ).rejects.toThrow('That source is already queued for offline review.')

    await expect(
      reviewSubmissions.createHumanReviewSubmission(
        {
          sourceUrl: 'https://example.com/second-lead',
          note: 'Second lead from the same person too soon.',
          ...(await createCaptchaAnswer(context)),
        },
        'owner1@example.com',
        new Date('2026-03-17T12:02:00.000Z'),
      ),
    ).rejects.toThrow('Wait a few minutes before sending another review lead.')

    await reviewSubmissions.createHumanReviewSubmission(
      {
        sourceUrl: 'https://example.com/second-lead',
        note: 'Now outside the cooldown window.',
        ...(await createCaptchaAnswer(context)),
      },
      'owner1@example.com',
      new Date('2026-03-17T12:04:00.000Z'),
    )
    await reviewSubmissions.createHumanReviewSubmission(
      {
        sourceUrl: 'https://example.com/third-lead',
        note: 'Third lead inside the same rolling hour.',
        ...(await createCaptchaAnswer(context)),
      },
      'owner1@example.com',
      new Date('2026-03-17T12:08:00.000Z'),
    )
    await reviewSubmissions.createHumanReviewSubmission(
      {
        sourceUrl: 'https://example.com/fourth-lead',
        note: 'Fourth lead inside the same rolling hour.',
        ...(await createCaptchaAnswer(context)),
      },
      'owner1@example.com',
      new Date('2026-03-17T12:12:00.000Z'),
    )

    await expect(
      reviewSubmissions.createHumanReviewSubmission(
        {
          sourceUrl: 'https://example.com/fifth-lead',
          note: 'This one should trip the hourly cap.',
          ...(await createCaptchaAnswer(context)),
        },
        'owner1@example.com',
        new Date('2026-03-17T12:16:00.000Z'),
      ),
    ).rejects.toThrow('Hourly review lead limit reached. Try again later.')

    await context.pool.end()
  })

  it('tolerates missing aggregate rows when checking the hourly limit fallback', async () => {
    vi.resetModules()

    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    }

    vi.doMock('./database', () => ({
      withDatabaseTransaction: vi.fn(async (run) => run(client)),
    }))
    vi.doMock('./identity', () => ({
      consumeCaptchaChallengeFromClient: vi.fn(async () => undefined),
    }))

    const reviewSubmissions = await import('./human-review-submissions')

    await expect(
      reviewSubmissions.createHumanReviewSubmission(
        {
          sourceUrl: 'https://example.com/no-count-row',
          captchaChallengeId: 'captcha-1',
          captchaAnswer: 'solved',
        },
        'owner-fallback@example.com',
        new Date('2026-03-17T13:00:00.000Z'),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        sourceUrl: 'https://example.com/no-count-row',
        sourceDomain: 'example.com',
      }),
    )
  })
})
