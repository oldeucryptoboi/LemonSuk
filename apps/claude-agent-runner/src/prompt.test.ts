import { describe, expect, it } from 'vitest'

import { internalPredictionLeadDetailSchema } from '../../../packages/shared/src/types'

import {
  buildReviewAgentPrompt,
  buildReviewAgentSystemPrompt,
  reviewRecommendationOutputJsonSchema,
} from './prompt'

function buildLeadDetail() {
  return internalPredictionLeadDetailSchema.parse({
    lead: {
      id: 'lead_prompt_1',
      leadType: 'structured_agent_lead',
      submittedByAgentId: 'agent_1',
      submittedByOwnerEmail: null,
      sourceUrl: 'https://example.com/source',
      normalizedSourceUrl: 'https://example.com/source',
      sourceDomain: 'example.com',
      sourceType: 'blog',
      sourceLabel: 'Example',
      sourceNote: null,
      sourcePublishedAt: null,
      claimedHeadline: 'Claimed headline',
      claimedSubject: 'Claimed subject',
      claimedCategory: 'software_release',
      familyId: null,
      familySlug: null,
      familyDisplayName: null,
      primaryEntityId: null,
      primaryEntitySlug: null,
      primaryEntityDisplayName: null,
      eventGroupId: null,
      promisedDate: '2027-12-31T23:59:59.000Z',
      summary: 'A summary with enough detail to satisfy schema validation.',
      tags: [],
      status: 'pending',
      spamScore: 0,
      duplicateOfLeadId: null,
      duplicateOfMarketId: null,
      reviewNotes: null,
      linkedMarketId: null,
      reviewedAt: null,
      legacyAgentSubmissionId: 'submission_1',
      legacyHumanSubmissionId: null,
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:00:00.000Z',
      submittedBy: null,
    },
    relatedPendingLeads: [],
    recentReviewedLeads: [],
    recentReviewResults: [],
  })
}

describe('review agent prompt contract', () => {
  it('pins the exact supported schema keys and forbids common alias names', () => {
    const systemPrompt = buildReviewAgentSystemPrompt()

    expect(systemPrompt).toContain(
      'Use these exact field names: verdict, confidence, summary, evidence, needsHumanReview, recommendedFamilySlug, recommendedEntitySlug, duplicateLeadIds, duplicateMarketIds, normalizedHeadline, normalizedSummary, escalationReason.',
    )
    expect(systemPrompt).toContain(
      'Never use aliases such as decision, suggestedFamilyId, suggestedEntityId, recommendedFamilyId, or recommendedEntityId.',
    )
    expect(systemPrompt).toContain('Do not return markdown')
  })

  it('includes a canonical example with every schema field and null defaults', () => {
    const prompt = buildReviewAgentPrompt(buildLeadDetail())

    expect(prompt).toContain('"verdict": "reject"')
    expect(prompt).toContain('"recommendedFamilySlug": null')
    expect(prompt).toContain('"recommendedEntitySlug": null')
    expect(prompt).toContain('"duplicateLeadIds": []')
    expect(prompt).toContain('"duplicateMarketIds": []')
    expect(prompt).toContain('"normalizedHeadline": null')
    expect(prompt).toContain('"normalizedSummary": null')
    expect(prompt).toContain('"escalationReason": null')
    expect(prompt).toContain('Do not rename keys.')
    expect(prompt).toContain('Lead detail JSON:')
  })

  it('requires all nullable contract fields in the JSON schema', () => {
    expect(reviewRecommendationOutputJsonSchema.required).toEqual(
      expect.arrayContaining([
        'verdict',
        'confidence',
        'summary',
        'evidence',
        'needsHumanReview',
        'recommendedFamilySlug',
        'recommendedEntitySlug',
        'duplicateLeadIds',
        'duplicateMarketIds',
        'normalizedHeadline',
        'normalizedSummary',
        'escalationReason',
      ]),
    )
  })
})
