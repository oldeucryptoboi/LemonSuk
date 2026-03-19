import type {
  MarketLineMoveReason,
  MarketSettlementState,
} from '../shared'

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

export function formatCredits(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  })
    .format(value)
    .concat(' cr')
}

export function formatLineDelta(
  current: number,
  previous: number | null | undefined,
): string | null {
  if (previous === null || previous === undefined) {
    return null
  }

  const delta = Number((current - previous).toFixed(2))
  if (delta === 0) {
    return 'flat'
  }

  return `${delta > 0 ? '+' : ''}${delta.toFixed(2)}x`
}

export function formatLineMoveReason(
  value: MarketLineMoveReason | null | undefined,
): string | null {
  switch (value) {
    case 'bet':
      return 'Bet pressure'
    case 'maintenance':
      return 'Maintenance repriced'
    case 'suspension':
      return 'Book suspended'
    case 'reopen':
      return 'Book reopened'
    default:
      return null
  }
}

export function formatSettlementState(
  value: MarketSettlementState | null | undefined,
): string {
  switch (value) {
    case 'grace':
      return 'Grace window'
    case 'awaiting_operator':
      return 'Awaiting operator'
    case 'settled':
      return 'Settled'
    case 'live':
    default:
      return 'Live'
  }
}

export function formatRelativeTime(
  value: string,
  now: Date = new Date(),
): string {
  const diffMs = now.getTime() - new Date(value).getTime()
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000))

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours}h ago`
  }

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) {
    return `${diffDays}d ago`
  }

  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) {
    return `${diffMonths}mo ago`
  }

  const diffYears = Math.floor(diffMonths / 12)
  return `${diffYears}y ago`
}
