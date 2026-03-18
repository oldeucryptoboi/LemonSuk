import { describe, expect, it, vi } from 'vitest'

function buildLeadRow() {
  return {
    id: 'lead_1',
    lead_type: 'structured_agent_lead' as const,
    submitted_by_agent_id: 'agent_1',
    submitted_by_owner_email: null,
    source_url: 'https://example.com/source',
    normalized_source_url: 'https://example.com/source',
    source_domain: 'example.com',
    source_type: 'news' as const,
    source_label: 'Example',
    source_note: null,
    source_published_at: null,
    claimed_headline: 'Queued headline',
    claimed_subject: 'Queued subject',
    claimed_category: 'vehicle',
    family_id: null,
    family_slug: null,
    family_display_name: null,
    primary_entity_id: null,
    primary_entity_slug: null,
    primary_entity_display_name: null,
    event_group_id: null,
    promised_date: new Date('2027-12-31T23:59:59.000Z'),
    summary: 'Queued summary for internal review branch coverage.',
    tags: ['queued'],
    status: 'pending' as const,
    spam_score: 0,
    duplicate_of_lead_id: null,
    duplicate_of_market_id: null,
    review_notes: null,
    linked_market_id: null,
    reviewed_at: null,
    legacy_agent_submission_id: 'submission_1',
    legacy_human_submission_id: null,
    created_at: new Date('2026-03-16T00:00:00.000Z'),
    updated_at: new Date('2026-03-16T00:00:00.000Z'),
    author_handle: 'alpha',
    author_display_name: 'Alpha',
  }
}

describe('lead review workflow branch coverage', () => {
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
              rows: [buildLeadRow()],
            })
            .mockResolvedValueOnce({ rowCount: 1, rows: [] })
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
              rows: [buildLeadRow()],
            })
            .mockResolvedValueOnce({ rowCount: 0, rows: [] })
            .mockResolvedValueOnce({ rowCount: 1, rows: [] })
            .mockResolvedValueOnce({ rowCount: 1, rows: [] })
            .mockResolvedValueOnce({ rowCount: 1, rows: [] })
            .mockResolvedValueOnce({ rowCount: 1, rows: [] })
            .mockResolvedValueOnce({ rowCount: 1, rows: [] })
            .mockResolvedValueOnce({ rowCount: 0, rows: [] })
            .mockResolvedValueOnce({ rowCount: 0, rows: [] }),
        } as never),
      )

    vi.doMock('./database', () => ({
      withDatabaseTransaction,
      withDatabaseClient: vi.fn(),
    }))

    const workflow = await import('./lead-review-workflow')

    await expect(
      workflow.updatePredictionLeadStatusForInternal('lead_1', {
        status: 'failed',
        note: 'Coverage failure branch.',
      }),
    ).rejects.toThrow('Updated lead could not be reloaded.')

    await expect(
      workflow.applyPredictionLeadReviewResultForInternal('lead_1', {
        runId: 'run_1',
        reviewer: 'eddie',
        verdict: 'reject',
        confidence: 0.21,
        summary:
          'This branch test covers a missing review-result reload after insert.',
        evidence: [],
        needsHumanReview: false,
      }),
    ).rejects.toThrow('Reviewed lead could not be reloaded.')
  })

  it('surfaces a missing review-result reload after applying a review result', async () => {
    vi.resetModules()

    const withDatabaseTransaction = vi.fn().mockImplementationOnce(async (run) =>
      run({
        query: vi
          .fn()
          .mockResolvedValueOnce({
            rowCount: 1,
            rows: [buildLeadRow()],
          })
          .mockResolvedValueOnce({ rowCount: 0, rows: [] })
          .mockResolvedValueOnce({ rowCount: 1, rows: [] })
          .mockResolvedValueOnce({ rowCount: 1, rows: [] })
          .mockResolvedValueOnce({ rowCount: 1, rows: [] })
          .mockResolvedValueOnce({ rowCount: 1, rows: [] })
          .mockResolvedValueOnce({ rowCount: 1, rows: [] })
          .mockResolvedValueOnce({
            rowCount: 1,
            rows: [
              {
                ...buildLeadRow(),
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

    try {
      const workflow = await import('./lead-review-workflow')

      await expect(
        workflow.applyPredictionLeadReviewResultForInternal('lead_1', {
          runId: 'run_2',
          reviewer: 'eddie',
          verdict: 'reject',
          confidence: 0.21,
          summary:
            'This branch test covers a missing review-result reload after update.',
          evidence: [],
          needsHumanReview: false,
        }),
      ).rejects.toThrow('Prediction lead review result could not be reloaded.')
    } finally {
      vi.doUnmock('./database')
      vi.resetModules()
    }
  })

  it('surfaces a missing lead reload after manual review writes', async () => {
    vi.resetModules()

    const withDatabaseTransaction = vi.fn().mockImplementationOnce(async (run) =>
      run({
        query: vi
          .fn()
          .mockResolvedValueOnce({
            rowCount: 1,
            rows: [buildLeadRow()],
          })
          .mockResolvedValueOnce({
            rowCount: 1,
            rows: [{ id: 'market_1' }],
          })
          .mockResolvedValueOnce({ rowCount: 1, rows: [] })
          .mockResolvedValueOnce({ rowCount: 1, rows: [] })
          .mockResolvedValueOnce({ rowCount: 1, rows: [] })
          .mockResolvedValueOnce({ rowCount: 0, rows: [] }),
      } as never),
    )

    vi.doMock('./database', () => ({
      withDatabaseTransaction,
      withDatabaseClient: vi.fn(),
    }))

    try {
      const workflow = await import('./lead-review-workflow')

      await expect(
        workflow.reviewPredictionLead({
          leadId: 'lead_1',
          decision: 'accepted',
          linkedMarketId: 'market_1',
          reviewNotes: 'Manual review reload coverage.',
        }),
      ).rejects.toThrow('Reviewed lead could not be reloaded.')
    } finally {
      vi.doUnmock('./database')
      vi.resetModules()
    }
  })

  it('returns null when inspection detail exists but the lead row disappears before enrichment', async () => {
    vi.resetModules()

    const withDatabaseClient = vi.fn().mockImplementationOnce(async (run) =>
      run({
        query: vi.fn().mockResolvedValueOnce({ rowCount: 0, rows: [] }),
      } as never),
    )

    vi.doMock('./database', () => ({
      withDatabaseClient,
      withDatabaseTransaction: vi.fn(),
    }))
    vi.doMock('./lead-intake', () => ({
      readPredictionLeadInspectionFromClient: vi.fn(async () => ({
        lead: {
          id: 'lead_1',
        },
        relatedPendingLeads: [],
        recentReviewedLeads: [],
        recentReviewResults: [],
      })),
    }))

    try {
      const workflow = await import('./lead-review-workflow')

      await expect(
        workflow.readPredictionLeadInspectionForInternal('lead_1'),
      ).resolves.toBeNull()
    } finally {
      vi.doUnmock('./lead-intake')
      vi.doUnmock('./database')
      vi.resetModules()
    }
  })
})
