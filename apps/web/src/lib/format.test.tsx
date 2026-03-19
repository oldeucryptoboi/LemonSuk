import { describe, expect, it } from 'vitest'

import {
  formatCredits,
  formatDate,
  formatLineDelta,
  formatLineMoveReason,
  formatRelativeTime,
  formatSettlementState,
} from './format'

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
    expect(formatLineDelta(1.62, 1.8)).toBe('-0.18x')
    expect(formatLineDelta(1.8, 1.8)).toBe('flat')
    expect(formatLineMoveReason('bet')).toBe('Bet pressure')
    expect(formatLineMoveReason('maintenance')).toBe('Maintenance repriced')
    expect(formatLineMoveReason('reopen')).toBe('Book reopened')
    expect(formatLineMoveReason('suspension')).toBe('Book suspended')
    expect(formatSettlementState('grace')).toBe('Grace window')
    expect(formatSettlementState('awaiting_operator')).toBe(
      'Awaiting operator',
    )
    expect(formatSettlementState('settled')).toBe('Settled')
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
