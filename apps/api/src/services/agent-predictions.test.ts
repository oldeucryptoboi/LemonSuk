import { describe, expect, it } from 'vitest'

import { buildCandidateFromAgentSubmission } from './agent-predictions'

describe('agent prediction submissions', () => {
  it('builds authored candidate markets from agent submissions', () => {
    const candidate = buildCandidateFromAgentSubmission(
      {
        id: 'agent-1',
        handle: 'deadlinebot',
        displayName: 'Deadline Bot',
        ownerName: 'Owner',
        modelProvider: 'OpenAI',
        biography: 'Tracks missed deadlines.',
        ownerEmail: null,
        ownerVerifiedAt: null,
        createdAt: '2026-03-16T00:00:00.000Z',
        claimUrl: '/?claim=claim_1',
        challengeUrl: '/api/v1/auth/claims/claim_1',
      },
      {
        headline: 'Tesla ships the next Roadster by December 31, 2027',
        subject: 'Tesla Roadster',
        category: 'vehicle',
        announcedOn: '2026-03-16T00:00:00.000Z',
        promisedDate: '2027-12-31T23:59:59.000Z',
        summary: 'Musk says the next Roadster ships by the end of 2027.',
        sourceUrl: 'https://www.tesla.com/blog/future-roadster-update',
        sourceLabel: 'Tesla Blog',
        sourceNote: 'Direct source supplied by the submitting bot.',
        sourcePublishedAt: '2026-03-16T00:00:00.000Z',
        tags: ['roadster', 'launch'],
      },
    )

    expect(candidate.author).toEqual({
      id: 'agent-1',
      handle: 'deadlinebot',
      displayName: 'Deadline Bot',
    })
    expect(candidate.source.sourceType).toBe('official')
    expect(candidate.tags).toContain('agent-submitted')
    expect(candidate.announcedOn).toBe('2026-03-16T00:00:00.000Z')
  })

  it('falls back to the source domain and current timestamp when optional source metadata is absent', () => {
    const before = Date.now()
    const candidate = buildCandidateFromAgentSubmission(
      {
        id: 'agent-1',
        handle: 'deadlinebot',
        displayName: 'Deadline Bot',
        ownerName: 'Owner',
        modelProvider: 'OpenAI',
        biography: 'Tracks missed deadlines.',
        ownerEmail: null,
        ownerVerifiedAt: null,
        createdAt: '2026-03-16T00:00:00.000Z',
        claimUrl: '/?claim=claim_1',
        challengeUrl: '/api/v1/auth/claims/claim_1',
      },
      {
        headline: 'Neuralink ships the next implant by December 31, 2028',
        subject: 'Neuralink',
        category: 'robotics',
        promisedDate: '2028-12-31T23:59:59.000Z',
        summary: 'A submitted prediction without optional source metadata.',
        sourceUrl: 'https://blog.example.com/neuralink-update',
        tags: [],
      },
    )
    const after = Date.now()

    expect(candidate.source.label).toBe('blog.example.com')
    expect(Date.parse(candidate.announcedOn)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(candidate.announcedOn)).toBeLessThanOrEqual(after)
  })
})
