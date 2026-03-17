import { describe, expect, it } from 'vitest'

import {
  clamp,
  createMarketId,
  createSourceId,
  createStoredSourceId,
  daysBetween,
  domainFromUrl,
  similarityScore,
  slugify,
  titleCase,
  toIso,
  unique,
} from './utils'

describe('utils', () => {
  it('formats and normalizes common values', () => {
    expect(slugify('  Robotaxi: August 8?! ')).toBe('robotaxi-august-8')
    expect(unique(['x', 'x', 'y'])).toEqual(['x', 'y'])
    expect(titleCase('tesla robotaxi')).toBe('Tesla Robotaxi')
    expect(domainFromUrl('https://www.example.com/path')).toBe('example.com')
    expect(createSourceId('Title', 'https://example.com/item')).toContain(
      'title-https-example-com-item',
    )
    expect(
      createStoredSourceId(
        'optimus-customizable-2026',
        'title-https-example-com-item',
      ),
    ).toBe('optimus-customizable-2026__title-https-example-com-item')
    expect(
      createStoredSourceId(
        'optimus-customizable-2026',
        'optimus-customizable-2026__title-https-example-com-item',
      ),
    ).toBe('optimus-customizable-2026__title-https-example-com-item')
    expect(createMarketId('Tesla Robotaxi', '2026-12-31')).toContain(
      'tesla-robotaxi-2026-12-31',
    )
  })

  it('calculates similarity, ranges, date deltas, and ISO conversion', () => {
    expect(similarityScore('robotaxi launch', 'robotaxi network launch')).toBe(
      2 / 3,
    )
    expect(similarityScore('', 'robotaxi')).toBe(0)
    expect(
      daysBetween('2026-01-01T00:00:00.000Z', '2026-01-10T00:00:00.000Z'),
    ).toBe(9)
    expect(clamp(10, 0, 5)).toBe(5)
    expect(clamp(-1, 0, 5)).toBe(0)
    expect(clamp(3, 0, 5)).toBe(3)
    expect(toIso('2026-01-01T00:00:00.000Z')).toBe('2026-01-01T00:00:00.000Z')
    expect(toIso(new Date('2026-01-02T00:00:00.000Z'))).toBe(
      '2026-01-02T00:00:00.000Z',
    )
  })
})
