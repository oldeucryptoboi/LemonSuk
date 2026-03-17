import { describe, expect, it } from 'vitest'

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
      'Systematic agent that submits and reviews sourced Musk deadline claims.',
    captchaChallengeId: challenge.id,
    captchaAnswer: solveCaptcha(challenge.prompt),
  })
}

describe('review workflow service', () => {
  it('reads internal submissions, updates status, and escalates accepted reviews without linked markets', async () => {
    const context = await setupApiContext()
    const queue = await import('./submission-queue')
    const workflow = await import('./review-workflow')

    const registration = await registerAgent(
      context,
      'review_alpha_bot',
      'Review Alpha Bot',
    )
    await context.store.ensureStore()

    const queued = await queue.enqueuePredictionSubmission(registration.agent, {
      headline: 'Tesla ships a refreshed Roadster by December 31, 2027',
      subject: 'Tesla Roadster refresh',
      category: 'vehicle',
      promisedDate: '2027-12-31T23:59:59.000Z',
      summary:
        'A sourced claim that Tesla will ship a refreshed Roadster before the 2027 year-end close.',
      sourceUrl: 'https://example.com/roadster-refresh',
      sourceLabel: '  Roadster Wire  ',
      sourcePublishedAt: '2026-03-15T00:00:00.000Z',
      tags: ['tesla', 'roadster'],
    })

    expect(
      await workflow.readPredictionSubmissionForInternal(
        queued.submission.id,
      ),
    ).toEqual(
      expect.objectContaining({
        status: 'pending',
        sourceLabel: 'Roadster Wire',
        sourcePublishedAt: '2026-03-15T00:00:00.000Z',
        sourceNote: null,
        submittedBy: expect.objectContaining({
          handle: 'review_alpha_bot',
        }),
      }),
    )

    expect(
      await workflow.updatePredictionSubmissionStatusForInternal(
        queued.submission.id,
        {
          status: 'in_review',
          runId: 'run_review_alpha',
          note: 'Picked up by the orchestrator worker.',
        },
      ),
    ).toEqual(
      expect.objectContaining({
        status: 'in_review',
      }),
    )

    expect(
      await workflow.updatePredictionSubmissionStatusForInternal(
        queued.submission.id,
        {
          status: 'in_review',
          runId: 'run_review_alpha',
          note: 'No-op idempotent update.',
        },
      ),
    ).toEqual(
      expect.objectContaining({
        status: 'in_review',
      }),
    )

    const escalated = await workflow.applyPredictionReviewResultForInternal(
      queued.submission.id,
      {
        runId: 'run_review_alpha',
        reviewer: 'eddie',
        verdict: 'accept',
        confidence: 0.88,
        summary:
          'The source appears credible, but the market still needs manual linking before it can go live.',
        evidence: [
          {
            url: 'https://example.com/roadster-refresh',
            excerpt: 'Tesla says the refreshed Roadster ships by the end of 2027.',
          },
        ],
        needsHumanReview: false,
        snapshotRef: 'snapshot://roadster-refresh',
      },
    )

    expect(escalated.submission.status).toBe('escalated')
    expect(escalated.reviewResult.verdict).toBe('accept')

    expect(
      await workflow.applyPredictionReviewResultForInternal(
        queued.submission.id,
        {
          runId: 'run_review_alpha',
          reviewer: 'eddie',
          verdict: 'accept',
          confidence: 0.88,
          summary:
            'The source appears credible, but the market still needs manual linking before it can go live.',
          evidence: [
            {
              url: 'https://example.com/roadster-refresh',
              excerpt:
                'Tesla says the refreshed Roadster ships by the end of 2027.',
            },
          ],
          needsHumanReview: false,
          snapshotRef: 'snapshot://roadster-refresh',
        },
      ),
    ).toEqual(escalated)

    const auditCount = await context.pool.query<{
      count: number
    }>(
      `
        SELECT COUNT(*)::int AS count
        FROM prediction_review_audit_log
        WHERE submission_id = $1
      `,
      [queued.submission.id],
    )
    expect(auditCount.rows[0]?.count).toBe(5)

    await context.pool.end()
  })

  it('accepts linked markets, rejects items, and blocks terminal updates', async () => {
    const context = await setupApiContext()
    const queue = await import('./submission-queue')
    const workflow = await import('./review-workflow')

    const registration = await registerAgent(
      context,
      'review_beta_bot',
      'Review Beta Bot',
    )
    const rejectionRegistration = await registerAgent(
      context,
      'review_gamma_bot',
      'Review Gamma Bot',
    )
    const invalidLinkRegistration = await registerAgent(
      context,
      'review_delta_bot',
      'Review Delta Bot',
    )
    await context.store.ensureStore()

    const linked = await queue.enqueuePredictionSubmission(registration.agent, {
      headline:
        'Optimus becomes a fully software-customizable robot by December 31, 2026',
      subject: 'Optimus customizable robot',
      category: 'robotics',
      promisedDate: '2026-12-31T23:59:59.000Z',
      summary:
        'A sourced claim that Optimus becomes a fully software-customizable robot by the 2026 year-end deadline.',
      sourceUrl: 'https://example.com/optimus-customizable',
      tags: ['optimus'],
    })

    await workflow.updatePredictionSubmissionStatusForInternal(
      linked.submission.id,
      {
        status: 'in_review',
        runId: 'run_review_beta_accept',
        note: 'Accepted-path verification.',
      },
    )

    const accepted = await workflow.applyPredictionReviewResultForInternal(
      linked.submission.id,
      {
        runId: 'run_review_beta_accept',
        reviewer: 'eddie',
        verdict: 'accept',
        confidence: 0.92,
        summary:
          'This source is strong enough to link directly to the existing Optimus market.',
        evidence: [
          {
            url: 'https://example.com/optimus-customizable',
            excerpt: 'Optimus becomes fully software-customizable by the end of 2026.',
          },
        ],
        needsHumanReview: false,
        linkedMarketId: 'optimus-customizable-2026',
      },
    )

    expect(accepted.submission.status).toBe('accepted')
    expect(accepted.submission.linkedMarketId).toBe('optimus-customizable-2026')

    await expect(
      workflow.updatePredictionSubmissionStatusForInternal(linked.submission.id, {
        status: 'failed',
        note: 'Should not mutate accepted items.',
      }),
    ).rejects.toThrow('Prediction submission is no longer pending review.')

    await expect(
      workflow.applyPredictionReviewResultForInternal(linked.submission.id, {
        runId: 'run_review_beta_accept_2',
        reviewer: 'eddie',
        verdict: 'reject',
        confidence: 0.2,
        summary:
          'A second review result should be blocked once the submission is terminal.',
        evidence: [],
        needsHumanReview: false,
      }),
    ).rejects.toThrow('Prediction submission is no longer pending review.')

    const rejected = await queue.enqueuePredictionSubmission(
      rejectionRegistration.agent,
      {
        headline: 'DOGE cuts $900 billion by September 30, 2026',
        subject: 'DOGE savings fantasy',
        category: 'government',
        promisedDate: '2026-09-30T23:59:59.000Z',
        summary:
          'A sourced claim that DOGE cuts $900 billion before September 30, 2026.',
        sourceUrl: 'https://example.com/doge-savings-fantasy',
        tags: ['doge'],
      },
    )

    await workflow.updatePredictionSubmissionStatusForInternal(
      rejected.submission.id,
      {
        status: 'in_review',
        runId: 'run_review_beta_reject',
        note: 'Reject-path verification.',
      },
    )

    const rejectedResult = await workflow.applyPredictionReviewResultForInternal(
      rejected.submission.id,
      {
        runId: 'run_review_beta_reject',
        reviewer: 'eddie',
        verdict: 'reject',
        confidence: 0.31,
        summary:
          'This source is weak and the claim should be rejected instead of entering the market flow.',
        evidence: [
          {
            url: 'https://example.com/doge-savings-fantasy',
            excerpt: 'The article makes a loose claim with no trustworthy sourcing.',
          },
        ],
        needsHumanReview: false,
      },
    )

    expect(rejectedResult.submission.status).toBe('rejected')

    const invalidLink = await queue.enqueuePredictionSubmission(
      invalidLinkRegistration.agent,
      {
        headline: 'Neuralink ships a full telepathy SDK by December 31, 2028',
        subject: 'Neuralink telepathy SDK',
        category: 'neurotech',
        promisedDate: '2028-12-31T23:59:59.000Z',
        summary:
          'A sourced claim that Neuralink ships a full telepathy SDK by the 2028 year-end deadline.',
        sourceUrl: 'https://example.com/neuralink-sdk',
        tags: ['neuralink'],
      },
    )

    await workflow.updatePredictionSubmissionStatusForInternal(
      invalidLink.submission.id,
      {
        status: 'in_review',
        runId: 'run_review_beta_bad_link',
        note: 'Bad-link verification.',
      },
    )

    await expect(
      workflow.applyPredictionReviewResultForInternal(invalidLink.submission.id, {
        runId: 'run_review_beta_bad_link',
        reviewer: 'eddie',
        verdict: 'accept',
        confidence: 0.8,
        summary:
          'This acceptance should fail because the linked market does not exist.',
        evidence: [
          {
            url: 'https://example.com/doge-savings-fantasy',
            excerpt: 'This is a failing link test.',
          },
        ],
        needsHumanReview: false,
        linkedMarketId: 'missing-market',
      }),
    ).rejects.toThrow('Linked market not found.')

    expect(
      await workflow.readPredictionSubmissionForInternal('missing-submission'),
    ).toBeNull()

    await context.pool.end()
  })

  it('supports failed/escalated status updates and surfaces missing internal records', async () => {
    const context = await setupApiContext()
    const queue = await import('./submission-queue')
    const workflow = await import('./review-workflow')

    const registration = await registerAgent(
      context,
      'review_epsilon_bot',
      'Review Epsilon Bot',
    )
    const escalatedRegistration = await registerAgent(
      context,
      'review_zeta_bot',
      'Review Zeta Bot',
    )
    const retainedNotesRegistration = await registerAgent(
      context,
      'review_eta_bot',
      'Review Eta Bot',
    )
    await context.store.ensureStore()

    await expect(
      workflow.updatePredictionSubmissionStatusForInternal('missing-submission', {
        status: 'failed',
        note: 'Missing.',
      }),
    ).rejects.toThrow('Prediction submission not found.')

    await expect(
      workflow.applyPredictionReviewResultForInternal('missing-submission', {
        runId: 'run_review_missing',
        reviewer: 'eddie',
        verdict: 'reject',
        confidence: 0.2,
        summary:
          'Missing submission coverage for the internal review workflow.',
        evidence: [],
        needsHumanReview: false,
      }),
    ).rejects.toThrow('Prediction submission not found.')

    const failed = await queue.enqueuePredictionSubmission(registration.agent, {
      headline: 'Boring builds a failed demo tunnel by December 31, 2027',
      subject: 'Boring demo tunnel',
      category: 'transport',
      promisedDate: '2027-12-31T23:59:59.000Z',
      summary:
        'A sourced claim used to exercise failed internal status updates.',
      sourceUrl: 'https://example.com/boring-demo-tunnel',
      tags: ['boring'],
    })

    expect(
      await workflow.updatePredictionSubmissionStatusForInternal(
        failed.submission.id,
        {
          status: 'failed',
          runId: 'run_review_failed',
          note: 'The review worker failed before dispatch.',
        },
      ),
    ).toEqual(
      expect.objectContaining({
        status: 'failed',
        reviewNotes: 'The review worker failed before dispatch.',
        reviewedAt: expect.any(String),
      }),
    )

    const escalated = await queue.enqueuePredictionSubmission(
      escalatedRegistration.agent,
      {
        headline: 'Hyperloop opens an intercity demo by December 31, 2028',
        subject: 'Hyperloop intercity demo',
        category: 'transport',
        promisedDate: '2028-12-31T23:59:59.000Z',
        summary:
          'A sourced claim used to exercise escalated internal status updates.',
        sourceUrl: 'https://example.com/hyperloop-intercity-demo',
        tags: ['hyperloop'],
      },
    )

    expect(
      await workflow.updatePredictionSubmissionStatusForInternal(
        escalated.submission.id,
        {
          status: 'escalated',
          runId: 'run_review_escalated',
          note: 'Manual review required before resolution.',
        },
      ),
    ).toEqual(
      expect.objectContaining({
        status: 'escalated',
        reviewNotes: 'Manual review required before resolution.',
        reviewedAt: expect.any(String),
      }),
    )

    const retainedNotes = await queue.enqueuePredictionSubmission(
      retainedNotesRegistration.agent,
      {
        headline: 'X launches a notes API by December 31, 2028',
        subject: 'X notes API',
        category: 'social',
        promisedDate: '2028-12-31T23:59:59.000Z',
        summary:
          'A sourced claim used to exercise retained review notes on blank updates.',
        sourceUrl: 'https://example.com/x-notes-api',
        tags: ['x'],
      },
    )

    await workflow.updatePredictionSubmissionStatusForInternal(
      retainedNotes.submission.id,
      {
        status: 'in_review',
        note: 'Initial retained note.',
      },
    )

    expect(
      await workflow.updatePredictionSubmissionStatusForInternal(
        retainedNotes.submission.id,
        {
          status: 'failed',
          note: '   ',
        },
      ),
    ).toEqual(
      expect.objectContaining({
        status: 'failed',
        reviewNotes: 'Initial retained note.',
      }),
    )

    await context.pool.end()
  })
})
