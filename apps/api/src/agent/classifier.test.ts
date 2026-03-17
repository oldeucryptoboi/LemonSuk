import { describe, expect, it } from 'vitest'

import type { SearchResult } from '../shared'
import { classifyResult, classifyResults } from './classifier'

function createResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 'search-1',
    query: 'Elon Musk robotaxi deadline',
    title: 'Tesla Robotaxi unveil on 8/8',
    url: 'https://x.com/elonmusk/status/1776351450542768368',
    domain: 'x.com',
    snippet: 'Elon Musk says Tesla Robotaxi unveil on 8/8.',
    sourceType: 'x',
    fetchedText: 'Tesla Robotaxi unveil on 8/8.',
    fetchedTitle: 'Tesla Robotaxi unveil on 8/8',
    publishedAt: '2024-04-05T00:00:00.000Z',
    ...overrides,
  }
}

describe('classifyResult', () => {
  it('extracts a robotaxi event candidate from an explicit date promise', () => {
    const candidate = classifyResult(createResult())

    expect(candidate).not.toBeNull()
    expect(candidate?.category).toBe('robotaxi')
    expect(candidate?.subject).toBe('Tesla Robotaxi')
    expect(candidate?.promisedDate.startsWith('2024-08-08')).toBe(true)
  })

  it('handles end-of-year and middle-of-year phrases', () => {
    const endOfYear = classifyResult(
      createResult({
        title: 'Elon Musk says Optimus will work by the end of next year',
        snippet: 'Elon Musk says Optimus will work by the end of next year.',
        fetchedText:
          'Elon Musk says Optimus will work by the end of next year in Tesla factories.',
        fetchedTitle: 'Optimus by the end of next year',
        sourceType: 'official',
        url: 'https://tesla.com/blog/optimus',
        domain: 'tesla.com',
      }),
    )
    const midYear = classifyResult(
      createResult({
        title: 'Musk says Cybercab starts middle of 2027',
        snippet: 'Musk says Cybercab starts middle of 2027.',
        fetchedText: 'Elon Musk says Cybercab starts middle of 2027.',
        fetchedTitle: 'Cybercab starts middle of 2027',
        url: 'https://example.com/cybercab',
        domain: 'example.com',
        sourceType: 'blog',
        publishedAt: '2026-01-01T00:00:00.000Z',
      }),
    )
    const thisYear = classifyResult(
      createResult({
        title: 'Elon Musk says FSD ships by the end of this year',
        snippet: 'Elon Musk says FSD ships by the end of this year.',
        fetchedText: 'Elon Musk says FSD ships by the end of this year.',
        fetchedTitle: 'FSD by end of this year',
        url: 'https://example.com/fsd-this-year',
        domain: 'example.com',
        sourceType: 'blog',
        publishedAt: '2024-01-01T00:00:00.000Z',
      }),
    )
    const nextMidYear = classifyResult(
      createResult({
        title: 'Elon Musk says Optimus hits the middle of next year',
        snippet: 'Elon Musk says Optimus hits the middle of next year.',
        fetchedText: 'Elon Musk says Optimus hits the middle of next year.',
        fetchedTitle: 'Optimus middle of next year',
        url: 'https://example.com/optimus-next-year',
        domain: 'example.com',
        sourceType: 'blog',
        publishedAt: '2024-01-01T00:00:00.000Z',
      }),
    )
    const explicitEndYear = classifyResult(
      createResult({
        title: 'Elon Musk says Optimus ships by the end of 2028',
        snippet: 'Elon Musk says Optimus ships by the end of 2028.',
        fetchedText: 'Elon Musk says Optimus ships by the end of 2028.',
        fetchedTitle: 'Optimus by end of 2028',
        url: 'https://example.com/optimus-2028',
        domain: 'example.com',
        sourceType: 'blog',
        publishedAt: '2024-01-01T00:00:00.000Z',
      }),
    )
    const thisMidYear = classifyResult(
      createResult({
        title: 'Elon Musk says Cybercab hits the middle of this year',
        snippet: 'Elon Musk says Cybercab hits the middle of this year.',
        fetchedText: 'Elon Musk says Cybercab hits the middle of this year.',
        fetchedTitle: 'Cybercab middle of this year',
        url: 'https://example.com/cybercab-this-year',
        domain: 'example.com',
        sourceType: 'blog',
        publishedAt: '2024-01-01T00:00:00.000Z',
      }),
    )

    expect(endOfYear?.promisedDate).toBe('2025-12-31T23:59:59.000Z')
    expect(endOfYear?.confidence).toBeGreaterThan(70)
    expect(midYear?.promisedDate).toBe('2027-06-30T23:59:59.000Z')
    expect(thisYear?.promisedDate).toBe('2024-12-31T23:59:59.000Z')
    expect(nextMidYear?.promisedDate).toBe('2025-06-30T23:59:59.000Z')
    expect(explicitEndYear?.promisedDate).toBe('2028-12-31T23:59:59.000Z')
    expect(thisMidYear?.promisedDate).toBe('2024-06-30T23:59:59.000Z')
  })

  it('handles starting-year phrases and rejects irrelevant or undated sources', () => {
    const startingYear = classifyResult(
      createResult({
        title: 'Elon Musk says robotaxi production starting in 2029',
        snippet: 'Elon Musk says robotaxi production starting in 2029.',
        fetchedText: 'Elon Musk says robotaxi production starting in 2029.',
        fetchedTitle: 'Robotaxi production starting in 2029',
        publishedAt: null,
      }),
    )
    const noElon = classifyResult(
      createResult({
        title: 'Analyst says autonomous taxis maybe sometime',
        snippet: 'An analyst says maybe.',
        fetchedText: 'Independent analysts speculate about autonomous taxis someday.',
        fetchedTitle: 'Analyst speculation only',
        url: 'https://example.com/analyst-note',
        domain: 'example.com',
        sourceType: 'news',
      }),
    )
    const noSubject = classifyResult(
      createResult({
        title: 'Elon Musk says launch by next year',
        snippet: 'Elon Musk says launch by next year',
        fetchedText: 'Elon Musk says launch by next year.',
        fetchedTitle: 'Launch by next year',
      }),
    )
    const noDate = classifyResult(
      createResult({
        title: 'Elon Musk plans more robotaxis eventually',
        snippet: 'Elon Musk plans more robotaxis eventually.',
        fetchedText: 'Elon Musk plans more robotaxis eventually.',
        fetchedTitle: 'Robotaxis eventually',
      }),
    )

    expect(startingYear?.promisedDate).toBe('2029-12-31T23:59:59.000Z')
    expect(noElon).toBeNull()
    expect(noSubject).toBeNull()
    expect(noDate).toBeNull()
  })

  it('classifies collections and discards invalid results', () => {
    const valid = createResult()
    const invalid = createResult({
      id: 'search-2',
      url: 'https://example.com/post',
      domain: 'example.com',
      title: 'Completely unrelated post',
      snippet: 'no relevant subject',
      fetchedText: 'nothing useful',
      fetchedTitle: 'nothing useful',
    })

    const result = classifyResults([valid, invalid])

    expect(result.candidates).toHaveLength(1)
    expect(result.discarded).toEqual([invalid.url])
  })

  it('classifies SpaceX, X, xAI, Neuralink, and legacy-adjacent deadline promises', () => {
    const spacex = classifyResult(
      createResult({
        title: 'Elon Musk says the first uncrewed Starships launch to Mars in 2026',
        snippet: 'Musk says the first uncrewed Starships launch to Mars in 2026.',
        fetchedText:
          'Elon Musk says SpaceX will send the first uncrewed Starships to Mars in 2026.',
        fetchedTitle: 'Starships to Mars in 2026',
        url: 'https://space.com/starship-mars',
        domain: 'space.com',
        sourceType: 'news',
      }),
    )
    const xPayments = classifyResult(
      createResult({
        title: 'Elon Musk says X will launch peer-to-peer payments this year',
        snippet: 'Elon Musk says X will launch peer-to-peer payments this year.',
        fetchedText:
          'Elon Musk says X will launch peer-to-peer payments this year as part of the everything app.',
        fetchedTitle: 'X payments this year',
        url: 'https://cnbc.com/x-payments',
        domain: 'cnbc.com',
        sourceType: 'news',
      }),
    )
    const grok = classifyResult(
      createResult({
        title: 'Elon Musk says Grok 3 will be released by the end of the year',
        snippet: 'Elon Musk says Grok 3 will be released by the end of the year.',
        fetchedText:
          'Elon Musk says xAI will release Grok 3 by the end of the year.',
        fetchedTitle: 'Grok 3 by year-end',
        url: 'https://example.com/grok-3',
        domain: 'example.com',
        sourceType: 'blog',
      }),
    )
    const neuralink = classifyResult(
      createResult({
        title: 'Elon Musk says Neuralink will implant its first human next year',
        snippet: 'Elon Musk says Neuralink will implant its first human next year.',
        fetchedText:
          'Elon Musk says Neuralink will implant its first human next year.',
        fetchedTitle: 'Neuralink first human next year',
        url: 'https://example.com/neuralink',
        domain: 'example.com',
        sourceType: 'blog',
      }),
    )
    const boring = classifyResult(
      createResult({
        title:
          'Elon Musk says the Boring Company will finish the LA tunnel by the end of next year',
        snippet:
          'Musk says the Boring Company will finish the LA tunnel by the end of next year.',
        fetchedText:
          'Elon Musk says the Boring Company will finish the LA tunnel by the end of next year.',
        fetchedTitle: 'Boring Company tunnel by end of next year',
        url: 'https://example.com/boring-company',
        domain: 'example.com',
        sourceType: 'blog',
        publishedAt: '2017-11-30T00:00:00.000Z',
      }),
    )
    const solarCity = classifyResult(
      createResult({
        title: 'Elon Musk says Solar Roof hits 1000 roofs per week by the end of 2019',
        snippet:
          'Musk says Solar Roof hits 1000 roofs per week by the end of 2019.',
        fetchedText:
          'Elon Musk says SolarCity and Tesla Solar Roof should hit 1000 roofs per week by the end of 2019.',
        fetchedTitle: 'Solar Roof by end of 2019',
        url: 'https://example.com/solar-roof',
        domain: 'example.com',
        sourceType: 'news',
        publishedAt: '2019-07-30T00:00:00.000Z',
      }),
    )
    const hyperloop = classifyResult(
      createResult({
        title: 'Elon Musk says Hyperloop can break ground later this year',
        snippet: 'Musk says Hyperloop can break ground later this year.',
        fetchedText:
          'Elon Musk says Hyperloop can secure formal approvals and break ground later this year.',
        fetchedTitle: 'Hyperloop later this year',
        url: 'https://example.com/hyperloop',
        domain: 'example.com',
        sourceType: 'news',
        publishedAt: '2017-07-20T00:00:00.000Z',
      }),
    )
    const doge = classifyResult(
      createResult({
        title: 'Elon Musk says DOGE will produce savings of $150 billion in FY2026',
        snippet:
          'Elon Musk says DOGE will produce savings of $150 billion in FY2026.',
        fetchedText:
          'Elon Musk says the Department of Government Efficiency will produce savings of $150 billion in fiscal year 2026.',
        fetchedTitle: 'DOGE savings in FY2026',
        url: 'https://example.com/doge',
        domain: 'example.com',
        sourceType: 'news',
        publishedAt: '2025-04-10T00:00:00.000Z',
      }),
    )

    expect(spacex?.category).toBe('space')
    expect(spacex?.subject).toBe('SpaceX Mars')
    expect(xPayments?.category).toBe('social')
    expect(xPayments?.subject).toBe('X Money')
    expect(grok?.category).toBe('ai')
    expect(grok?.tags).toContain('xai')
    expect(neuralink?.category).toBe('neurotech')
    expect(neuralink?.subject).toBe('Neuralink implant')
    expect(boring?.category).toBe('transport')
    expect(boring?.subject).toBe('The Boring Company')
    expect(solarCity?.category).toBe('energy')
    expect(solarCity?.tags).toContain('solarcity')
    expect(hyperloop?.category).toBe('transport')
    expect(hyperloop?.subject).toBe('Hyperloop')
    expect(doge?.category).toBe('government')
    expect(doge?.subject).toBe('DOGE')
  })

  it('falls back to snippet, title-cased subjects, and domain-based sources', () => {
    const candidate = classifyResult(
      createResult({
        title: '',
        snippet: 'Elon Musk says FSD by March 5, 2028.',
        fetchedText: null,
        fetchedTitle: null,
        sourceType: 'blog',
        url: 'https://example.com/fsd-date',
        domain: 'example.com',
      }),
    )

    expect(candidate?.headline).toBe('Tesla Full Self-Driving')
    expect(candidate?.summary).toBe('Elon Musk says FSD by March 5, 2028.')
    expect(candidate?.source.label).toBe('example.com')
  })

  it('falls back to the result title for summaries when no fetched text or snippet exists', () => {
    const candidate = classifyResult(
      createResult({
        title: 'Elon Musk says FSD by March 5, 2028',
        snippet: '',
        fetchedText: null,
        fetchedTitle: null,
        sourceType: 'blog',
        url: 'https://example.com/fsd-title-summary',
        domain: 'example.com',
      }),
    )

    expect(candidate?.summary).toBe('Elon Musk says FSD by March 5, 2028')
  })
})
