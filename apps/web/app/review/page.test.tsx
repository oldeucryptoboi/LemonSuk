import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ReviewPage from './page'

const mocks = vi.hoisted(() => ({
  isReviewConsoleAvailable: vi.fn(),
  isReviewConsoleAuthorized: vi.fn(),
  fetchInternalLeadQueueServer: vi.fn(),
  fetchInternalLeadInspectionServer: vi.fn(),
}))

vi.mock('../../src/lib/internal-server-api', () => ({
  isReviewConsoleAvailable: mocks.isReviewConsoleAvailable,
  isReviewConsoleAuthorized: mocks.isReviewConsoleAuthorized,
  fetchInternalLeadQueueServer: mocks.fetchInternalLeadQueueServer,
  fetchInternalLeadInspectionServer: mocks.fetchInternalLeadInspectionServer,
}))

vi.mock('./actions', () => ({
  applyLeadStatusAction: '/review/status',
  applyLeadReviewAction: '/review/apply',
}))

describe('ReviewPage', () => {
  it('renders an unavailable state when the internal service token is missing', async () => {
    mocks.isReviewConsoleAvailable.mockReturnValue(false)

    render(await ReviewPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('Review desk unavailable')).not.toBeNull()
    expect(screen.getByText(/INTERNAL_SERVICE_TOKEN/)).not.toBeNull()
  })

  it('renders a locked state when the review key is not authorized', async () => {
    mocks.isReviewConsoleAvailable.mockReturnValue(true)
    mocks.isReviewConsoleAuthorized.mockReturnValue(false)

    render(await ReviewPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('Review desk locked')).not.toBeNull()
    expect(screen.getByText(/review_key/)).not.toBeNull()
  })

  it('renders an empty inbox when no matching leads are pending', async () => {
    mocks.isReviewConsoleAvailable.mockReturnValue(true)
    mocks.isReviewConsoleAuthorized.mockReturnValue(true)
    mocks.fetchInternalLeadQueueServer.mockResolvedValue({
      pendingCount: 0,
      items: [],
    })

    render(
      await ReviewPage({
        searchParams: Promise.resolve({
          review_key: 'secret',
        }),
      }),
    )

    expect(screen.getByText('No pending leads match this filter.')).not.toBeNull()
    expect(screen.getByText('No lead selected')).not.toBeNull()
  })

  it('renders the inbox, lead detail, and review forms when authorized', async () => {
    mocks.isReviewConsoleAvailable.mockReturnValue(true)
    mocks.isReviewConsoleAuthorized.mockReturnValue(true)
    mocks.fetchInternalLeadQueueServer.mockResolvedValue({
      pendingCount: 1,
      items: [
        {
          id: 'lead_1',
          leadType: 'structured_agent_lead',
          submittedByAgentId: 'agent_1',
          submittedByOwnerEmail: null,
          sourceUrl: 'https://example.com/source',
          normalizedSourceUrl: 'https://example.com/source',
          sourceDomain: 'example.com',
          sourceType: 'news',
          sourceLabel: 'Example',
          sourceNote: 'Source note',
          sourcePublishedAt: null,
          claimedHeadline: 'Example lead',
          claimedSubject: 'Example',
          claimedCategory: 'ai',
          familyId: 'family_ai_launch',
          familySlug: 'ai_launch',
          familyDisplayName: 'AI launches',
          primaryEntityId: 'entity_openai',
          primaryEntitySlug: 'openai',
          primaryEntityDisplayName: 'OpenAI',
          eventGroupId: null,
          promisedDate: '2026-09-30T23:59:59.000Z',
          summary: 'Summary',
          tags: ['openai'],
          status: 'pending',
          spamScore: 0,
          duplicateOfLeadId: null,
          duplicateOfMarketId: null,
          reviewNotes: null,
          linkedMarketId: null,
          reviewedAt: null,
          legacyAgentSubmissionId: null,
          legacyHumanSubmissionId: null,
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z',
        },
      ],
    })
    mocks.fetchInternalLeadInspectionServer.mockResolvedValue({
      lead: {
        id: 'lead_1',
        leadType: 'structured_agent_lead',
        submittedByAgentId: 'agent_1',
        submittedByOwnerEmail: null,
        sourceUrl: 'https://example.com/source',
        normalizedSourceUrl: 'https://example.com/source',
        sourceDomain: 'example.com',
        sourceType: 'news',
        sourceLabel: 'Example',
        sourceNote: 'Source note',
        sourcePublishedAt: null,
        claimedHeadline: 'Example lead',
        claimedSubject: 'Example',
        claimedCategory: 'ai',
        familyId: 'family_ai_launch',
        familySlug: 'ai_launch',
        familyDisplayName: 'AI launches',
        primaryEntityId: 'entity_openai',
        primaryEntitySlug: 'openai',
        primaryEntityDisplayName: 'OpenAI',
        eventGroupId: null,
        promisedDate: '2026-09-30T23:59:59.000Z',
        summary: 'Summary',
        tags: ['openai'],
        status: 'pending',
        spamScore: 0.2,
        duplicateOfLeadId: null,
        duplicateOfMarketId: null,
        reviewNotes: null,
        linkedMarketId: null,
        reviewedAt: null,
        legacyAgentSubmissionId: null,
        legacyHumanSubmissionId: null,
        createdAt: '2026-03-18T00:00:00.000Z',
        updatedAt: '2026-03-18T00:00:00.000Z',
        submittedBy: {
          id: 'agent_1',
          handle: 'eddie',
          displayName: 'Eddie',
        },
      },
      relatedPendingLeads: [],
      recentReviewedLeads: [],
      recentReviewResults: [
        {
          runId: 'run_1',
          leadId: 'lead_1',
          submissionId: null,
          reviewer: 'Eddie',
          verdict: 'accept',
          confidence: 0.8,
          summary: 'Strong evidence.',
          evidence: [
            {
              url: 'https://example.com/source',
              excerpt: 'Quoted evidence.',
            },
          ],
          needsHumanReview: false,
          snapshotRef: null,
          providerRunId: null,
          createdAt: '2026-03-18T00:00:00.000Z',
        },
      ],
    })

    render(
      await ReviewPage({
        searchParams: Promise.resolve({
          review_key: 'secret',
        }),
      }),
    )

    expect(screen.getByText('Eddie review desk')).not.toBeNull()
    expect(screen.getAllByText('Example lead').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Manual status')).not.toBeNull()
    expect(screen.getByText('Manual decision')).not.toBeNull()
    expect(screen.getByText('Strong evidence.')).not.toBeNull()
  })

  it('auto-selects the first lead, shows flash copy, and renders related/reviewed fallback branches', async () => {
    mocks.isReviewConsoleAvailable.mockReturnValue(true)
    mocks.isReviewConsoleAuthorized.mockReturnValue(true)
    mocks.fetchInternalLeadQueueServer.mockResolvedValue({
      pendingCount: 2,
      items: [
        {
          id: 'lead_2',
          leadType: 'system_discovery_lead',
          submittedByAgentId: null,
          submittedByOwnerEmail: null,
          sourceUrl: 'https://example.com/fallback',
          normalizedSourceUrl: 'https://example.com/fallback',
          sourceDomain: 'example.com',
          sourceType: 'news',
          sourceLabel: 'Example',
          sourceNote: null,
          sourcePublishedAt: null,
          claimedHeadline: null,
          claimedSubject: 'Fallback',
          claimedCategory: 'policy',
          familyId: null,
          familySlug: null,
          familyDisplayName: null,
          primaryEntityId: null,
          primaryEntitySlug: null,
          primaryEntityDisplayName: null,
          eventGroupId: null,
          promisedDate: '2026-11-30T23:59:59.000Z',
          summary: null,
          tags: [],
          status: 'pending',
          spamScore: 0.1,
          duplicateOfLeadId: null,
          duplicateOfMarketId: null,
          reviewNotes: null,
          linkedMarketId: null,
          reviewedAt: null,
          legacyAgentSubmissionId: null,
          legacyHumanSubmissionId: null,
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z',
        },
        {
          id: 'lead_3',
          leadType: 'human_url_lead',
          submittedByAgentId: null,
          submittedByOwnerEmail: 'owner@example.com',
          sourceUrl: 'https://example.com/second',
          normalizedSourceUrl: 'https://example.com/second',
          sourceDomain: 'example.com',
          sourceType: 'blog',
          sourceLabel: 'Second',
          sourceNote: null,
          sourcePublishedAt: null,
          claimedHeadline: 'Second lead',
          claimedSubject: 'Second',
          claimedCategory: 'policy',
          familyId: null,
          familySlug: null,
          familyDisplayName: null,
          primaryEntityId: null,
          primaryEntitySlug: null,
          primaryEntityDisplayName: null,
          eventGroupId: null,
          promisedDate: '2026-12-31T23:59:59.000Z',
          summary: null,
          tags: [],
          status: 'pending',
          spamScore: 0.3,
          duplicateOfLeadId: null,
          duplicateOfMarketId: null,
          reviewNotes: null,
          linkedMarketId: null,
          reviewedAt: null,
          legacyAgentSubmissionId: null,
          legacyHumanSubmissionId: null,
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z',
        },
      ],
    })
    mocks.fetchInternalLeadInspectionServer.mockResolvedValue({
      lead: {
        id: 'lead_2',
        leadType: 'system_discovery_lead',
        submittedByAgentId: null,
        submittedByOwnerEmail: null,
        sourceUrl: 'https://example.com/fallback',
        normalizedSourceUrl: 'https://example.com/fallback',
        sourceDomain: 'example.com',
        sourceType: 'news',
        sourceLabel: 'Example',
        sourceNote: null,
        sourcePublishedAt: null,
        claimedHeadline: null,
        claimedSubject: 'Fallback',
        claimedCategory: 'policy',
        familyId: null,
        familySlug: null,
        familyDisplayName: null,
        primaryEntityId: null,
        primaryEntitySlug: null,
        primaryEntityDisplayName: null,
        eventGroupId: null,
        promisedDate: '2026-11-30T23:59:59.000Z',
        summary: null,
        tags: [],
        status: 'pending',
        spamScore: 0.4,
        duplicateOfLeadId: 'lead_1',
        duplicateOfMarketId: null,
        reviewNotes: null,
        linkedMarketId: null,
        reviewedAt: null,
        legacyAgentSubmissionId: null,
        legacyHumanSubmissionId: null,
        createdAt: '2026-03-18T00:00:00.000Z',
        updatedAt: '2026-03-18T00:00:00.000Z',
        submittedBy: null,
      },
      relatedPendingLeads: [
        {
          id: 'lead_4',
          leadType: 'human_url_lead',
          submittedByAgentId: null,
          submittedByOwnerEmail: 'owner@example.com',
          sourceUrl: 'https://example.com/related',
          normalizedSourceUrl: 'https://example.com/related',
          sourceDomain: 'example.com',
          sourceType: 'news',
          sourceLabel: 'Related',
          sourceNote: null,
          sourcePublishedAt: null,
          claimedHeadline: null,
          claimedSubject: 'Related',
          claimedCategory: 'policy',
          familyId: null,
          familySlug: null,
          familyDisplayName: null,
          primaryEntityId: null,
          primaryEntitySlug: null,
          primaryEntityDisplayName: null,
          eventGroupId: null,
          promisedDate: '2026-12-01T23:59:59.000Z',
          summary: null,
          tags: [],
          status: 'pending',
          spamScore: 0.2,
          duplicateOfLeadId: null,
          duplicateOfMarketId: null,
          reviewNotes: null,
          linkedMarketId: null,
          reviewedAt: null,
          legacyAgentSubmissionId: null,
          legacyHumanSubmissionId: null,
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z',
        },
      ],
      recentReviewedLeads: [
        {
          id: 'lead_5',
          leadType: 'human_url_lead',
          submittedByAgentId: null,
          submittedByOwnerEmail: 'owner@example.com',
          sourceUrl: 'https://example.com/reviewed',
          normalizedSourceUrl: 'https://example.com/reviewed',
          sourceDomain: 'example.com',
          sourceType: 'news',
          sourceLabel: 'Reviewed',
          sourceNote: null,
          sourcePublishedAt: null,
          claimedHeadline: null,
          claimedSubject: 'Reviewed',
          claimedCategory: 'policy',
          familyId: null,
          familySlug: null,
          familyDisplayName: null,
          primaryEntityId: null,
          primaryEntitySlug: null,
          primaryEntityDisplayName: null,
          eventGroupId: null,
          promisedDate: '2026-12-15T23:59:59.000Z',
          summary: null,
          tags: [],
          status: 'accepted',
          spamScore: 0.1,
          duplicateOfLeadId: null,
          duplicateOfMarketId: null,
          reviewNotes: null,
          linkedMarketId: 'market_1',
          reviewedAt: '2026-03-18T00:00:00.000Z',
          legacyAgentSubmissionId: null,
          legacyHumanSubmissionId: null,
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z',
        },
      ],
      recentReviewResults: [],
    })

    render(
      await ReviewPage({
        searchParams: Promise.resolve({
          review_key: 'secret',
          flash: 'Lead accepted',
          leadType: 'system_discovery_lead',
          familySlug: 'policy_promise',
          entitySlug: 'doge',
          sourceDomain: 'example.com',
        }),
      }),
    )

    expect(mocks.fetchInternalLeadInspectionServer).toHaveBeenCalledWith('lead_2')
    expect(screen.getByText('Lead accepted')).not.toBeNull()
    expect(screen.getAllByText('example.com').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('No submission summary was attached to this lead.')).not.toBeNull()
    expect(
      screen.getAllByText('system_discovery_lead').length,
    ).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Unknown')).not.toBeNull()
    expect(screen.getByText('lead_1')).not.toBeNull()
    expect(screen.getAllByText('example.com').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('No recent review results.')).not.toBeNull()
    expect(screen.getByText(/example\.com · accepted/)).not.toBeNull()
  })

  it('renders the review form with an empty review key when authorization allows it', async () => {
    mocks.isReviewConsoleAuthorized.mockReturnValue(true)
    mocks.fetchInternalLeadQueueServer.mockResolvedValue({
      pendingCount: 1,
      items: [
        {
          id: 'lead_6',
          leadType: 'human_url_lead',
          submittedByAgentId: null,
          submittedByOwnerEmail: 'owner@example.com',
          sourceUrl: 'https://example.com/human',
          normalizedSourceUrl: 'https://example.com/human',
          sourceDomain: 'example.com',
          sourceType: 'news',
          sourceLabel: 'Example',
          sourceNote: null,
          sourcePublishedAt: null,
          claimedHeadline: 'Human lead',
          claimedSubject: 'Human lead',
          claimedCategory: 'product',
          familyId: null,
          familySlug: null,
          familyDisplayName: null,
          primaryEntityId: null,
          primaryEntitySlug: null,
          primaryEntityDisplayName: null,
          eventGroupId: null,
          promisedDate: '2026-10-01T00:00:00.000Z',
          summary: null,
          tags: [],
          status: 'pending',
          spamScore: 0,
          duplicateOfLeadId: null,
          duplicateOfMarketId: null,
          reviewNotes: null,
          linkedMarketId: null,
          reviewedAt: null,
          legacyAgentSubmissionId: null,
          legacyHumanSubmissionId: null,
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z',
        },
      ],
    })
    mocks.fetchInternalLeadInspectionServer.mockResolvedValue({
      lead: {
        id: 'lead_6',
        leadType: 'human_url_lead',
        submittedByAgentId: null,
        submittedByOwnerEmail: 'owner@example.com',
        sourceUrl: 'https://example.com/human',
        normalizedSourceUrl: 'https://example.com/human',
        sourceDomain: 'example.com',
        sourceType: 'news',
        sourceLabel: 'Example',
        sourceNote: null,
        sourcePublishedAt: null,
        claimedHeadline: 'Human lead',
        claimedSubject: 'Human lead',
        claimedCategory: 'product',
        familyId: null,
        familySlug: null,
        familyDisplayName: null,
        primaryEntityId: null,
        primaryEntitySlug: null,
        primaryEntityDisplayName: null,
        eventGroupId: null,
        promisedDate: '2026-10-01T00:00:00.000Z',
        summary: null,
        tags: [],
        status: 'pending',
        spamScore: 0,
        duplicateOfLeadId: null,
        duplicateOfMarketId: null,
        reviewNotes: null,
        linkedMarketId: null,
        reviewedAt: null,
        legacyAgentSubmissionId: null,
        legacyHumanSubmissionId: null,
        createdAt: '2026-03-18T00:00:00.000Z',
        updatedAt: '2026-03-18T00:00:00.000Z',
        submittedBy: null,
      },
      relatedPendingLeads: [],
      recentReviewedLeads: [],
      recentReviewResults: [],
    })

    render(await ReviewPage({ searchParams: Promise.resolve({}) }))

    expect(
      screen.getAllByDisplayValue('').filter((element) => {
        return (
          element.getAttribute('type') === 'hidden' &&
          element.getAttribute('name') === 'review_key'
        )
      }).length,
    ).toBeGreaterThan(0)
  })
})
