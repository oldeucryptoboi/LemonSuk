import { describe, expect, it } from 'vitest'

import { formatCredits, formatDate, formatRelativeTime } from './format'

describe('format helpers', () => {
  it('formats dates and credits for the UI', () => {
    expect(formatDate('2026-03-16T00:00:00.000Z')).toBe(
      new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date('2026-03-16T00:00:00.000Z')),
    )
    expect(formatCredits(1234.5)).toBe('1,234.5 cr')
    expect(
      formatRelativeTime(
        '2026-03-15T23:30:00.000Z',
        new Date('2026-03-16T00:00:00.000Z'),
      ),
    ).toBe('30m ago')
    expect(
      formatRelativeTime(
        '2026-03-15T18:00:00.000Z',
        new Date('2026-03-16T00:00:00.000Z'),
      ),
    ).toBe('6h ago')
    expect(
      formatRelativeTime(
        '2026-03-14T00:00:00.000Z',
        new Date('2026-03-16T00:00:00.000Z'),
      ),
    ).toBe('2d ago')
    expect(
      formatRelativeTime(
        '2025-12-16T00:00:00.000Z',
        new Date('2026-03-16T00:00:00.000Z'),
      ),
    ).toBe('3mo ago')
    expect(
      formatRelativeTime(
        '2024-03-16T00:00:00.000Z',
        new Date('2026-03-16T00:00:00.000Z'),
      ),
    ).toBe('2y ago')
  })
})
