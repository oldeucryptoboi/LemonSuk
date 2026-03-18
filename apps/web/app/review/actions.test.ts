import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`)
  }),
  isReviewConsoleAuthorized: vi.fn(),
  updateInternalLeadStatusServer: vi.fn(),
  applyInternalLeadReviewResultServer: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}))

vi.mock('../../src/lib/internal-server-api', () => ({
  isReviewConsoleAuthorized: mocks.isReviewConsoleAuthorized,
  updateInternalLeadStatusServer: mocks.updateInternalLeadStatusServer,
  applyInternalLeadReviewResultServer: mocks.applyInternalLeadReviewResultServer,
}))

describe('review actions', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unauthorized status updates', async () => {
    mocks.isReviewConsoleAuthorized.mockReturnValue(false)

    const { applyLeadStatusAction } = await import('./actions')
    await expect(
      applyLeadStatusAction(
        new FormData(),
      ),
    ).rejects.toThrow('Review desk access denied.')
  })

  it('updates lead status and redirects back to the filtered review page', async () => {
    mocks.isReviewConsoleAuthorized.mockReturnValue(true)
    mocks.updateInternalLeadStatusServer.mockResolvedValue(undefined)

    const formData = new FormData()
    formData.set('review_key', 'secret')
    formData.set('leadId', 'lead_1')
    formData.set('leadType', 'structured_agent_lead')
    formData.set('status', 'in_review')
    formData.set('note', 'Working this lead.')

    const { applyLeadStatusAction } = await import('./actions')
    await expect(applyLeadStatusAction(formData)).rejects.toThrow(
      'redirect:/review?review_key=secret&leadId=lead_1&flash=Lead+status+updated.&leadType=structured_agent_lead',
    )

    expect(mocks.updateInternalLeadStatusServer).toHaveBeenCalledWith('lead_1', {
      status: 'in_review',
      note: 'Working this lead.',
      runId: undefined,
      providerRunId: undefined,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/review')
  })

  it('normalizes blank optional status fields and preserves numeric filters in the redirect', async () => {
    mocks.isReviewConsoleAuthorized.mockReturnValue(true)
    mocks.updateInternalLeadStatusServer.mockResolvedValue(undefined)

    const formData = new FormData()
    formData.set('review_key', 'secret')
    formData.set('leadId', 'lead_11')
    formData.set('limit', '12')
    formData.set('status', 'failed')
    formData.set('note', '   ')
    formData.set('runId', '   ')
    formData.set('providerRunId', 'provider_11')

    const { applyLeadStatusAction } = await import('./actions')
    await expect(applyLeadStatusAction(formData)).rejects.toThrow(
      'redirect:/review?review_key=secret&leadId=lead_11&flash=Lead+status+updated.&limit=12',
    )

    expect(mocks.updateInternalLeadStatusServer).toHaveBeenCalledWith('lead_11', {
      status: 'failed',
      note: undefined,
      runId: undefined,
      providerRunId: 'provider_11',
    })
  })

  it('redirects immediately when the lead id is missing', async () => {
    mocks.isReviewConsoleAuthorized.mockReturnValue(true)

    const formData = new FormData()
    formData.set('review_key', 'secret')

    const { applyLeadStatusAction, applyLeadReviewAction } = await import('./actions')
    await expect(applyLeadStatusAction(formData)).rejects.toThrow(
      'redirect:/review?review_key=secret&flash=Lead+id+is+required.',
    )
    await expect(applyLeadReviewAction(formData)).rejects.toThrow(
      'redirect:/review?review_key=secret&flash=Lead+id+is+required.',
    )
  })

  it('applies manual review results and generates a run id when one is not supplied', async () => {
    mocks.isReviewConsoleAuthorized.mockReturnValue(true)
    mocks.applyInternalLeadReviewResultServer.mockResolvedValue(undefined)

    const formData = new FormData()
    formData.set('review_key', 'secret')
    formData.set('leadId', 'lead_2')
    formData.set('verdict', 'accept')
    formData.set('confidence', '0.75')
    formData.set('summary', 'Manual acceptance for the operator desk.')
    formData.set('evidenceUrl', 'https://example.com/source')
    formData.set('evidenceExcerpt', 'Quoted evidence')
    formData.set('needsHumanReview', 'on')

    const { applyLeadReviewAction } = await import('./actions')
    await expect(applyLeadReviewAction(formData)).rejects.toThrow(
      'redirect:/review?review_key=secret&leadId=lead_2&flash=Manual+review+applied.',
    )

    expect(mocks.applyInternalLeadReviewResultServer).toHaveBeenCalledWith(
      'lead_2',
      expect.objectContaining({
        reviewer: 'LemonSuk operator',
        verdict: 'accept',
        confidence: 0.75,
        needsHumanReview: true,
        evidence: [
          {
            url: 'https://example.com/source',
            excerpt: 'Quoted evidence',
          },
        ],
      }),
    )
    expect(
      mocks.applyInternalLeadReviewResultServer.mock.calls[0]?.[1]?.runId,
    ).toMatch(/^manual_lead_2_/)
  })

  it('redirects review failures back into the console with the error message', async () => {
    mocks.isReviewConsoleAuthorized.mockReturnValue(true)
    mocks.applyInternalLeadReviewResultServer.mockRejectedValue(
      new Error('Linked market not found.'),
    )

    const formData = new FormData()
    formData.set('review_key', 'secret')
    formData.set('leadId', 'lead_3')
    formData.set('verdict', 'reject')
    formData.set('confidence', '0.45')
    formData.set('summary', 'Manual rejection for the operator desk.')

    const { applyLeadReviewAction } = await import('./actions')
    await expect(applyLeadReviewAction(formData)).rejects.toThrow(
      'redirect:/review?review_key=secret&leadId=lead_3&flash=Linked+market+not+found.',
    )
  })

  it('redirects status update errors back into the console with the error message', async () => {
    mocks.isReviewConsoleAuthorized.mockReturnValue(true)
    mocks.updateInternalLeadStatusServer.mockRejectedValue(
      new Error('Lead is already resolved.'),
    )

    const formData = new FormData()
    formData.set('review_key', 'secret')
    formData.set('leadId', 'lead_7')
    formData.set('status', 'failed')

    const { applyLeadStatusAction } = await import('./actions')
    await expect(applyLeadStatusAction(formData)).rejects.toThrow(
      'redirect:/review?review_key=secret&leadId=lead_7&flash=Lead+is+already+resolved.',
    )
  })

  it('uses the generic status failure copy for non-error throws', async () => {
    mocks.isReviewConsoleAuthorized.mockReturnValue(true)
    mocks.updateInternalLeadStatusServer.mockRejectedValue('bad status write')

    const formData = new FormData()
    formData.set('review_key', 'secret')
    formData.set('leadId', 'lead_9')
    formData.set('status', 'failed')

    const { applyLeadStatusAction } = await import('./actions')
    await expect(applyLeadStatusAction(formData)).rejects.toThrow(
      'redirect:/review?review_key=secret&leadId=lead_9&flash=Could+not+update+lead+status.',
    )
  })

  it('uses provided review fields and the generic failure copy for non-error review throws', async () => {
    mocks.isReviewConsoleAuthorized.mockReturnValue(true)
    mocks.applyInternalLeadReviewResultServer.mockRejectedValue('bad review write')

    const formData = new FormData()
    formData.set('review_key', 'secret')
    formData.set('leadId', 'lead_10')
    formData.set('verdict', 'escalate')
    formData.set('runId', 'manual-run-10')
    formData.set('reviewer', 'Karnival')
    formData.set('confidence', 'not-a-number')

    const { applyLeadReviewAction } = await import('./actions')
    await expect(applyLeadReviewAction(formData)).rejects.toThrow(
      'redirect:/review?review_key=secret&leadId=lead_10&flash=Could+not+apply+manual+review.',
    )

    expect(mocks.applyInternalLeadReviewResultServer).toHaveBeenCalledWith(
      'lead_10',
      expect.objectContaining({
        runId: 'manual-run-10',
        reviewer: 'Karnival',
        confidence: 0,
        summary: 'Manual review applied by the operator desk.',
        evidence: [],
      }),
    )
  })

  it('defaults missing confidence to zero when applying a review', async () => {
    mocks.isReviewConsoleAuthorized.mockReturnValue(true)
    mocks.applyInternalLeadReviewResultServer.mockResolvedValue(undefined)

    const formData = new FormData()
    formData.set('review_key', 'secret')
    formData.set('leadId', 'lead_12')
    formData.set('verdict', 'accept')

    const { applyLeadReviewAction } = await import('./actions')
    await expect(applyLeadReviewAction(formData)).rejects.toThrow(
      'redirect:/review?review_key=secret&leadId=lead_12&flash=Manual+review+applied.',
    )

    expect(mocks.applyInternalLeadReviewResultServer).toHaveBeenCalledWith(
      'lead_12',
      expect.objectContaining({
        confidence: 0,
      }),
    )
  })
})
