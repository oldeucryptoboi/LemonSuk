import { describe, expect, it, vi } from 'vitest'

import { setupApiContext } from '../../../../test/helpers/api-context'

function solveCaptcha(prompt: string): string {
  const match = prompt.match(/slug:\s+([a-z]+-[a-z]+)-(\d+)\+(\d+)\./i)

  if (!match) {
    throw new Error(`Could not solve captcha prompt: ${prompt}`)
  }

  return `${match[1]}-${Number(match[2]) + Number(match[3])}`
}

async function registerAgent(
  context: Awaited<ReturnType<typeof setupApiContext>>,
  handle: string,
  displayName: string,
) {
  const challenge = await context.identity.createCaptchaChallenge()

  return context.identity.registerAgent({
    handle,
    displayName,
    ownerName: 'Owner',
    modelProvider: 'OpenAI',
    biography:
      'Systematic agent that submits deadline claims to the offline review queue.',
    captchaChallengeId: challenge.id,
    captchaAnswer: solveCaptcha(challenge.prompt),
  })
}

describe('submission queue service', () => {
  it('queues, reviews, and retires pending submissions', async () => {
    const context = await setupApiContext()
    const database = await import('./database')
    const queue = await import('./submission-queue')

    const alpha = await registerAgent(
      context,
      'alpha_queue_bot',
      'Alpha Queue Bot',
    )
    const beta = await registerAgent(
      context,
      'beta_queue_bot',
      'Beta Queue Bot',
    )
    await context.store.ensureStore()

    const firstSubmission = await queue.enqueuePredictionSubmission(
      alpha.agent,
      {
        headline: 'Tesla ships a refreshed Roadster by December 31, 2027',
        subject: 'Tesla Roadster refresh',
        category: 'vehicle',
        promisedDate: '2027-12-31T23:59:59.000Z',
        summary:
          'A sourced claim that Tesla will ship a refreshed Roadster before the 2027 year-end close.',
        sourceUrl: 'https://www.tesla.com/blog/future-roadster-update',
        tags: ['tesla', 'roadster'],
      },
    )

    expect(firstSubmission).toEqual({
      queued: true,
      submission: expect.objectContaining({
        headline: 'Tesla ships a refreshed Roadster by December 31, 2027',
        sourceLabel: 'tesla.com',
        sourceDomain: 'tesla.com',
        sourceType: 'official',
        status: 'pending',
        submittedBy: expect.objectContaining({
          handle: 'alpha_queue_bot',
        }),
      }),
      reviewHint: expect.stringContaining('offline review'),
    })

    await queue.enqueuePredictionSubmission(beta.agent, {
      headline: 'DOGE cuts $100 billion before September 30, 2026',
      subject: 'DOGE savings',
      category: 'government',
      promisedDate: '2026-09-30T23:59:59.000Z',
      summary:
        'A sourced claim that DOGE will cut $100 billion before the Q3 2026 deadline.',
      sourceUrl: 'https://example.com/doge-plan',
      sourceLabel: 'Example News',
      sourceNote: 'Queued by a second agent for manual review.',
      sourcePublishedAt: '2026-03-15T00:00:00.000Z',
      tags: ['doge'],
    })

    expect(await queue.readPredictionSubmissionQueue()).toEqual({
      pendingCount: 2,
      items: [
        expect.objectContaining({
          id: firstSubmission.submission.id,
          submittedBy: expect.objectContaining({
            handle: 'alpha_queue_bot',
          }),
        }),
        expect.objectContaining({
          submittedBy: expect.objectContaining({
            handle: 'beta_queue_bot',
          }),
        }),
      ],
    })

    await expect(
      queue.reviewPredictionSubmission({
        submissionId: 'missing-submission',
        decision: 'rejected',
      }),
    ).rejects.toThrow('Prediction submission not found.')

    await expect(
      queue.reviewPredictionSubmission({
        submissionId: firstSubmission.submission.id,
        decision: 'accepted',
      }),
    ).rejects.toThrow('Accepted submissions must be linked to a market.')

    await expect(
      queue.reviewPredictionSubmission({
        submissionId: firstSubmission.submission.id,
        decision: 'accepted',
        linkedMarketId: 'missing-market',
      }),
    ).rejects.toThrow('Linked market not found.')

    const accepted = await queue.reviewPredictionSubmission({
      submissionId: firstSubmission.submission.id,
      decision: 'accepted',
      linkedMarketId: 'optimus-customizable-2026',
      reviewNotes: 'Validated offline and linked to the existing live market.',
    })
    expect(accepted).toEqual(
      expect.objectContaining({
        id: firstSubmission.submission.id,
        status: 'accepted',
        linkedMarketId: 'optimus-customizable-2026',
        reviewNotes:
          'Validated offline and linked to the existing live market.',
      }),
    )

    await expect(
      queue.reviewPredictionSubmission({
        submissionId: firstSubmission.submission.id,
        decision: 'rejected',
      }),
    ).rejects.toThrow('Prediction submission has already been reviewed.')

    const pendingFromClient = await database.withDatabaseTransaction((client) =>
      queue.readPredictionSubmissionQueueFromClient(client, 1),
    )
    expect(pendingFromClient).toEqual({
      pendingCount: 1,
      items: [
        expect.objectContaining({
          submittedBy: expect.objectContaining({
            handle: 'beta_queue_bot',
          }),
        }),
      ],
    })

    const rejected = await queue.reviewPredictionSubmission({
      submissionId: pendingFromClient.items[0]!.id,
      decision: 'rejected',
      reviewNotes: 'Rejected offline as weak or duplicate sourcing.',
    })
    expect(rejected).toEqual(
      expect.objectContaining({
        status: 'rejected',
        linkedMarketId: null,
        reviewNotes: 'Rejected offline as weak or duplicate sourcing.',
      }),
    )

    expect(await queue.readPredictionSubmissionQueue()).toEqual({
      pendingCount: 0,
      items: [],
    })

    await context.pool.end()
  })

  it('enforces duplicate, cooldown, hourly, and similarity guards for agent submissions', async () => {
    const context = await setupApiContext()
    const queue = await import('./submission-queue')

    const alpha = await registerAgent(
      context,
      'guard_alpha_bot',
      'Guard Alpha Bot',
    )
    const beta = await registerAgent(context, 'guard_beta_bot', 'Guard Beta Bot')

    await queue.enqueuePredictionSubmission(alpha.agent, {
      headline: 'Tesla ships supervised autonomy by December 31, 2027',
      subject: 'Tesla supervised autonomy',
      category: 'autonomy',
      promisedDate: '2027-12-31T23:59:59.000Z',
      summary:
        'A sourced claim that supervised autonomy ships by the 2027 year-end deadline.',
      sourceUrl: 'https://example.com/autonomy?a=1&b=2',
      tags: ['tesla', 'autonomy'],
    })

    await expect(
      queue.enqueuePredictionSubmission(beta.agent, {
        headline: 'Tesla repeats supervised autonomy by December 31, 2027',
        subject: 'Tesla supervised autonomy repeat',
        category: 'autonomy',
        promisedDate: '2027-12-31T23:59:59.000Z',
        summary:
          'A second agent tries to send the same source into the queue while it is still pending.',
        sourceUrl: 'https://example.com/autonomy?b=2&a=1',
        tags: ['tesla'],
      }),
    ).rejects.toThrow('That source is already queued for offline review.')

    const originalDate = Date
    const fixedTimes = [
      '2026-03-17T10:00:00.000Z',
      '2026-03-17T10:00:20.000Z',
      '2026-03-17T10:02:00.000Z',
      '2026-03-17T10:05:00.000Z',
      '2026-03-17T10:10:00.000Z',
      '2026-03-17T10:15:00.000Z',
      '2026-03-17T10:20:00.000Z',
      '2026-03-17T10:25:00.000Z',
      '2026-03-17T10:30:00.000Z',
      '2026-03-17T10:31:10.000Z',
      '2026-03-17T10:32:20.000Z',
    ]
    let timeIndex = 0

    global.Date = class extends Date {
      constructor(value?: string | number | Date) {
        super(value ?? fixedTimes[Math.min(timeIndex, fixedTimes.length - 1)]!)
      }

      static now() {
        return new originalDate(
          fixedTimes[Math.min(timeIndex, fixedTimes.length - 1)]!,
        ).getTime()
      }
    } as DateConstructor

    try {
      await queue.enqueuePredictionSubmission(beta.agent, {
        headline: 'SpaceX lands a cargo Starship on Mars by December 31, 2028',
        subject: 'Starship Mars cargo',
        category: 'space',
        promisedDate: '2028-12-31T23:59:59.000Z',
        summary:
          'A sourced claim that SpaceX lands cargo on Mars before the 2028 year-end deadline.',
        sourceUrl: 'https://example.com/mars-1',
        tags: ['spacex'],
      })

      timeIndex = 1
      await expect(
        queue.enqueuePredictionSubmission(beta.agent, {
          headline: 'SpaceX lands a second cargo Starship on Mars by December 31, 2028',
          subject: 'Starship Mars cargo follow-up',
          category: 'space',
          promisedDate: '2028-12-31T23:59:59.000Z',
          summary:
            'A follow-up packet from the same agent arrives too quickly after the last one.',
          sourceUrl: 'https://example.com/mars-2',
          tags: ['spacex'],
        }),
      ).rejects.toThrow('Wait 60 seconds before sending another claim packet.')

      timeIndex = 2
      await expect(
        queue.enqueuePredictionSubmission(beta.agent, {
          headline: 'SpaceX lands cargo on Mars by December 31, 2028',
          subject: 'Starship Mars cargo',
          category: 'space',
          promisedDate: '2028-12-31T23:59:59.000Z',
          summary:
            'A sourced claim that SpaceX lands cargo on Mars before the 2028 year-end deadline.',
          sourceUrl: 'https://example.com/mars-3',
          tags: ['spacex'],
        }),
      ).rejects.toThrow(
        'This claim packet is too similar to one of your recent submissions.',
      )

      for (const [index, slug] of ['3', '4', '5', '6', '7', '8', '9'].entries()) {
        timeIndex = index + 3
        await queue.enqueuePredictionSubmission(beta.agent, {
          headline: `Unique beta packet ${slug}`,
          subject: `Unique beta subject ${slug}`,
          category: 'space',
          promisedDate: '2028-12-31T23:59:59.000Z',
          summary: `Unique beta summary ${slug} with enough different wording to bypass similarity checks.`,
          sourceUrl: `https://example.com/beta-${slug}`,
          tags: ['spacex'],
        })
      }

      timeIndex = 10
      await expect(
        queue.enqueuePredictionSubmission(beta.agent, {
          headline: 'Unique beta packet 10',
          subject: 'Unique beta subject 10',
          category: 'space',
          promisedDate: '2028-12-31T23:59:59.000Z',
          summary:
            'A tenth packet attempt after eight accepted packets inside the same rolling hour should trip the hourly submission cap.',
          sourceUrl: 'https://example.com/beta-10',
          tags: ['spacex'],
        }),
      ).rejects.toThrow('Hourly claim packet limit reached. Try again later.')
    } finally {
      global.Date = originalDate
    }

    await context.pool.end()
  })

  it('surfaces reload failures after enqueue and review writes', async () => {
    vi.resetModules()

    const enqueueClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }),
    }
    const reviewClient = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'submission_1',
              submitted_by_agent_id: 'agent_1',
              headline: 'Queued headline',
              subject: 'Queued subject',
              category: 'vehicle',
              summary: 'Queued summary for reload branch coverage.',
              promised_date: new Date('2027-12-31T23:59:59.000Z'),
              normalized_source_url: 'https://example.com/source',
              source_url: 'https://example.com/source',
              source_label: null,
              source_note: null,
              source_published_at: null,
              source_type: 'news',
              tags: ['queued'],
              status: 'pending',
              review_notes: null,
              linked_market_id: null,
              reviewed_at: null,
              created_at: new Date('2026-03-16T00:00:00.000Z'),
              updated_at: new Date('2026-03-16T00:00:00.000Z'),
              author_handle: 'alpha',
              author_display_name: 'Alpha',
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }),
    }
    const withDatabaseTransaction = vi
      .fn()
      .mockImplementationOnce(async (run) => run(enqueueClient as never))
      .mockImplementationOnce(async (run) => run(reviewClient as never))

    vi.doMock('./database', () => ({
      withDatabaseTransaction,
      withDatabaseClient: vi.fn(),
    }))

    try {
      const queue = await import('./submission-queue')
      const agent = {
        id: 'agent_1',
        handle: 'alpha',
        displayName: 'Alpha',
        ownerName: 'Owner',
        modelProvider: 'OpenAI',
        biography: 'Queue coverage agent.',
        ownerEmail: null,
        ownerVerifiedAt: null,
        promoCredits: 0,
        earnedCredits: 0,
        availableCredits: 0,
        createdAt: '2026-03-16T00:00:00.000Z',
        claimUrl: '/?claim=claim_1',
        challengeUrl: '/api/v1/auth/claims/claim_1',
      }

      await expect(
        queue.enqueuePredictionSubmission(agent, {
          headline: 'Coverage enqueue reload branch',
          subject: 'Queue reload',
          category: 'vehicle',
          promisedDate: '2027-12-31T23:59:59.000Z',
          summary:
            'This submission exists only to cover the enqueue reload guard.',
          sourceUrl: 'https://example.com/source',
          tags: [],
        }),
      ).rejects.toThrow('Queued submission could not be reloaded.')

      await expect(
        queue.reviewPredictionSubmission({
          submissionId: 'submission_1',
          decision: 'rejected',
        }),
      ).rejects.toThrow('Reviewed submission could not be reloaded.')

      await expect(
        queue.readPredictionSubmissionQueueFromClient(
          {
            query: vi
              .fn()
              .mockResolvedValueOnce({ rows: [] })
              .mockResolvedValueOnce({ rows: [] }),
          } as never,
          3,
        ),
      ).resolves.toEqual({
        pendingCount: 0,
        items: [],
      })

      await expect(
        queue.readPredictionSubmissionQueueFromClient(
          {
            query: vi
              .fn()
              .mockResolvedValueOnce({ rows: [{ count: 1 }] })
              .mockResolvedValueOnce({
                rows: [
                  {
                    id: 'submission_2',
                    submitted_by_agent_id: 'agent_2',
                    headline: 'Queued queue read branch',
                    subject: 'Queue read',
                    category: 'vehicle',
                    summary: 'Queue read branch coverage.',
                    promised_date: new Date('2027-12-31T23:59:59.000Z'),
                    source_url: 'https://example.com/source',
                    source_label: null,
                    source_note: null,
                    source_published_at: null,
                    source_type: 'news',
                    tags: ['queued'],
                    status: 'pending',
                    review_notes: null,
                    linked_market_id: null,
                    reviewed_at: null,
                    created_at: new Date('2026-03-16T00:00:00.000Z'),
                    updated_at: new Date('2026-03-16T00:00:00.000Z'),
                    author_handle: 'beta',
                    author_display_name: 'Beta',
                  },
                ],
              }),
          } as never,
          1,
        ),
      ).resolves.toEqual({
        pendingCount: 1,
        items: [
          expect.objectContaining({
            sourceLabel: 'example.com',
            submittedBy: expect.objectContaining({
              handle: 'beta',
            }),
          }),
        ],
      })
    } finally {
      vi.doUnmock('./database')
      vi.resetModules()
    }
  })

  it('marks submissions as failed when review queue dispatch fails', async () => {
    const context = await setupApiContext()
    const reviewEvents = await import('./review-events')
    const queue = await import('./submission-queue')

    const registration = await registerAgent(
      context,
      'queue_failure_bot',
      'Queue Failure Bot',
    )
    await context.store.ensureStore()

    const enqueue = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new Error('queue transport down')
      })
      .mockImplementationOnce(async () => {
        throw 'queue transport down'
      })
    reviewEvents.__setReviewEventStoreForTests({ enqueue })

    await expect(
      queue.enqueuePredictionSubmission(registration.agent, {
        headline: 'Queued failure branch coverage by December 31, 2027',
        subject: 'Queue failure branch coverage',
        category: 'vehicle',
        promisedDate: '2027-12-31T23:59:59.000Z',
        summary:
          'This submission should fail after persistence because the review queue transport is down.',
        sourceUrl: 'https://example.com/queue-failure',
        tags: ['coverage'],
      }),
    ).rejects.toThrow('Could not queue submission for review.')

    expect(await queue.readPredictionSubmissionQueue()).toEqual({
      pendingCount: 0,
      items: [],
    })

    const failedRows = await context.pool.query<{
      status: string
      review_notes: string | null
    }>(
      `
        SELECT status, review_notes
        FROM agent_prediction_submissions
        WHERE submitted_by_agent_id = $1
      `,
      [registration.agent.id],
    )
    expect(failedRows.rows[0]).toEqual({
      status: 'failed',
      review_notes: 'queue transport down',
    })

    const secondRegistration = await registerAgent(
      context,
      'queue_failure_bot_two',
      'Queue Failure Bot Two',
    )

    await expect(
      queue.enqueuePredictionSubmission(secondRegistration.agent, {
        headline: 'Queued failure fallback branch by December 31, 2027',
        subject: 'Queue failure fallback branch',
        category: 'vehicle',
        promisedDate: '2027-12-31T23:59:59.000Z',
        summary:
          'This submission should hit the non-Error queue failure fallback branch.',
        sourceUrl: 'https://example.com/queue-failure-fallback',
        tags: ['coverage'],
      }),
    ).rejects.toThrow('Could not queue submission for review.')

    const failedFallbackRows = await context.pool.query<{
      status: string
      review_notes: string | null
    }>(
      `
        SELECT status, review_notes
        FROM agent_prediction_submissions
        WHERE submitted_by_agent_id = $1
      `,
      [secondRegistration.agent.id],
    )
    expect(failedFallbackRows.rows[0]).toEqual({
      status: 'failed',
      review_notes: 'Could not queue submission for review.',
    })

    await context.pool.end()
  })
})
