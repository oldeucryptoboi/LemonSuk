export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
}

export function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

export function titleCase(input: string): string {
  return input.replace(/\b\w/g, (match) => match.toUpperCase())
}

export function domainFromUrl(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '')
}

export function sortByDateDescending<T>(
  items: T[],
  pick: (item: T) => string,
): T[] {
  return [...items].sort(
    (left, right) => Date.parse(pick(right)) - Date.parse(pick(left)),
  )
}

export function createSourceId(label: string, url: string): string {
  return slugify(`${label}-${url}`)
}

export function createMarketId(subject: string, promisedDate: string): string {
  return slugify(`${subject}-${promisedDate}`)
}

export function daysBetween(leftIso: string, rightIso: string): number {
  const ms = Math.abs(Date.parse(leftIso) - Date.parse(rightIso))
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

export function similarityScore(left: string, right: string): number {
  const leftTokens = new Set(slugify(left).split('-').filter(Boolean))
  const rightTokens = new Set(slugify(right).split('-').filter(Boolean))

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0
  }

  let overlap = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1
    }
  }

  return overlap / new Set([...leftTokens, ...rightTokens]).size
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function toIso(value: string | Date): string {
  return typeof value === 'string'
    ? new Date(value).toISOString()
    : value.toISOString()
}
