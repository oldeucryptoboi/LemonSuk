import { describe, expect, it } from 'vitest'

import { buildReviewConsoleHref, readReviewConsoleState } from './review-console'

describe('review console helpers', () => {
  it('reads normalized state from search params', () => {
    expect(
      readReviewConsoleState({
        review_key: ['secret'],
        leadId: 'lead_1',
        limit: '25',
        leadType: 'structured_agent_lead',
        familySlug: 'ai_launch',
        entitySlug: 'openai',
        sourceDomain: 'example.com',
        flash: 'ready',
      }),
    ).toEqual({
      reviewKey: 'secret',
      leadId: 'lead_1',
      limit: 25,
      leadType: 'structured_agent_lead',
      familySlug: 'ai_launch',
      entitySlug: 'openai',
      sourceDomain: 'example.com',
      flash: 'ready',
    })
  })

  it('builds stable hrefs and ignores empty fields', () => {
    expect(
      buildReviewConsoleHref({
        reviewKey: 'secret',
        leadId: 'lead_1',
        familySlug: 'ai_launch',
      }),
    ).toBe('/review?review_key=secret&leadId=lead_1&familySlug=ai_launch')

    expect(buildReviewConsoleHref({})).toBe('/review')
    expect(readReviewConsoleState({ limit: 'bad-number' }).limit).toBeUndefined()
  })

  it('preserves flash and additional filters when building hrefs', () => {
    expect(
      buildReviewConsoleHref({
        reviewKey: 'secret',
        flash: 'updated',
        limit: 10,
        leadType: 'system_discovery_lead',
        familySlug: 'policy_promise',
        entitySlug: 'doge',
        sourceDomain: 'example.com',
      }),
    ).toBe(
      '/review?review_key=secret&flash=updated&limit=10&leadType=system_discovery_lead&familySlug=policy_promise&entitySlug=doge&sourceDomain=example.com',
    )
  })
})
