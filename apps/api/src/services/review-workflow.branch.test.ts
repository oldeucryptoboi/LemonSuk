import { describe, expect, it, vi } from 'vitest'

function buildSubmissionRow() {
  return {
    id: 'submission_1',
    submitted_by_agent_id: 'agent_1',
    headline: 'Queued headline',
    subject: 'Queued subject',
    category: 'vehicle' as const,
    summary: 'Queued summary for internal review branch coverage.',
    promised_date: new Date('2027-12-31T23:59:59.000Z'),
    source_url: 'https://example.com/source',
    source_label: null,
    source_note: null,
    source_published_at: null,
    source_type: 'news' as const,
    tags: ['queued'],
    status: 'pending' as const,
    review_notes: null,
    linked_market_id: null,
    reviewed_at: null,
    created_at: new Date('2026-03-16T00:00:00.000Z'),
    updated_at: new Date('2026-03-16T00:00:00.000Z'),
    author_handle: 'alpha',
    author_display_name: 'Alpha',
  }
}

describe('review workflow branch coverage', () => {
  it('surfaces reload failures after status and review writes', async () => {
    vi.resetModules()

    const withDatabaseTransaction = vi
      .fn()
      .mockImplementationOnce(async (run) =>
        run({
          query: vi
            .fn()
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [buildSubmissionRow()],
            })
            .mockResolvedValueOnce({ rowCount: 1, rows: [] })
            .mockResolvedValueOnce({ rowCount: 1, rows: [] })
            .mockResolvedValueOnce({ rowCount: 0, rows: [] }),
        } as never),
      )
      .mockImplementationOnce(async (run) =>
        run({
          query: vi
            .fn()
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [buildSubmissionRow()],
            })
            .mockResolvedValueOnce({ rowCount: 0, rows: [] })
            .mockResolvedValueOnce({ rowCount: 1, rows: [] })
            .mockResolvedValueOnce({ rowCount: 1, rows: [] })
            .mockResolvedValueOnce({ rowCount: 1, rows: [] })
            .mockResolvedValueOnce({ rowCount: 1, rows: [] })
            .mockResolvedValueOnce({
              rowCount: 1,
              rows: [
                {
                  ...buildSubmissionRow(),
                  status: 'rejected',
                  review_notes: 'Rejected offline.',
                  reviewed_at: new Date('2026-03-16T00:10:00.000Z'),
                  updated_at: new Date('2026-03-16T00:10:00.000Z'),
                },
              ],
            })
            .mockResolvedValueOnce({ rowCount: 0, rows: [] }),
        } as never),
      )

    vi.doMock('./database', () => ({
      withDatabaseTransaction,
      withDatabaseClient: vi.fn(),
    }))

    const workflow = await import('./review-workflow')

    await expect(
      workflow.updatePredictionSubmissionStatusForInternal('submission_1', {
        status: 'failed',
        note: 'Coverage failure branch.',
      }),
    ).rejects.toThrow('Updated submission could not be reloaded.')

    await expect(
      workflow.applyPredictionReviewResultForInternal('submission_1', {
        runId: 'run_1',
        reviewer: 'eddie',
        verdict: 'reject',
        confidence: 0.21,
        summary:
          'This branch test covers a missing review-result reload after insert.',
        evidence: [],
        needsHumanReview: false,
      }),
    ).rejects.toThrow('Prediction review result could not be reloaded.')
  })

  it('surfaces a missing submission reload after applying a review result', async () => {
    vi.resetModules()

    const withDatabaseTransaction = vi.fn().mockImplementationOnce(async (run) =>
      run({
        query: vi
          .fn()
          .mockResolvedValueOnce({
            rowCount: 1,
            rows: [buildSubmissionRow()],
          })
          .mockResolvedValueOnce({ rowCount: 0, rows: [] })
          .mockResolvedValueOnce({ rowCount: 1, rows: [] })
          .mockResolvedValueOnce({ rowCount: 1, rows: [] })
          .mockResolvedValueOnce({ rowCount: 1, rows: [] })
          .mockResolvedValueOnce({ rowCount: 1, rows: [] })
          .mockResolvedValueOnce({ rowCount: 0, rows: [] })
          .mockResolvedValueOnce({
            rowCount: 1,
            rows: [
              {
                id: 'review_1',
                submission_id: 'submission_1',
                reviewer: 'eddie',
                verdict: 'reject',
                confidence: 0.21,
                summary:
                  'This branch test covers a missing submission reload after update.',
                evidence_json: [],
                snapshot_ref: null,
                needs_human_review: false,
                run_id: 'run_2',
                provider_run_id: null,
                created_at: new Date('2026-03-16T00:10:00.000Z'),
              },
            ],
          }),
      } as never),
    )

    vi.doMock('./database', () => ({
      withDatabaseTransaction,
      withDatabaseClient: vi.fn(),
    }))

    try {
      const workflow = await import('./review-workflow')

      await expect(
        workflow.applyPredictionReviewResultForInternal('submission_1', {
          runId: 'run_2',
          reviewer: 'eddie',
          verdict: 'reject',
          confidence: 0.21,
          summary:
            'This branch test covers a missing submission reload after update.',
          evidence: [],
          needsHumanReview: false,
        }),
      ).rejects.toThrow('Reviewed submission could not be reloaded.')
    } finally {
      vi.doUnmock('./database')
      vi.resetModules()
    }
  })
})
