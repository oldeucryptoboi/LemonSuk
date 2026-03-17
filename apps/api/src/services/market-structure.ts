import type {
  Checkpoint,
  CheckpointState,
  Company,
  EvidenceUpdate,
  Market,
  StoreData,
} from '../shared'
import { buildPricingCommentary } from './pricing'

const dayMs = 1000 * 60 * 60 * 24

type CompanyDefinition = {
  company: Company
  tags: string[]
  patterns: RegExp[]
}

const companyDefinitions: CompanyDefinition[] = [
  {
    company: 'solarcity',
    tags: ['solarcity', 'solar roof', 'solarglass', 'energy'],
    patterns: [/\bsolarcity\b/i, /\bsolar roof\b/i, /\bsolarglass\b/i],
  },
  {
    company: 'boring',
    tags: ['boring', 'tunnel', 'loop', 'vegas-loop'],
    patterns: [/\bboring company\b/i, /\bvegas loop\b/i, /\blvcc loop\b/i],
  },
  {
    company: 'hyperloop',
    tags: ['hyperloop', 'transport', 'devloop'],
    patterns: [/\bhyperloop\b/i, /\bdevloop\b/i, /\bvacuum tube\b/i],
  },
  {
    company: 'doge',
    tags: ['doge', 'government', 'savings', 'efficiency'],
    patterns: [
      /\bdoge\b/i,
      /department of government efficiency/i,
      /\bdoge dividend\b/i,
    ],
  },
  {
    company: 'tesla',
    tags: ['tesla', 'fsd', 'robotaxi', 'cybercab', 'optimus'],
    patterns: [/tesla/i, /cybercab/i, /robotaxi/i, /optimus/i, /full self-driving/i],
  },
  {
    company: 'spacex',
    tags: ['spacex', 'starship', 'mars'],
    patterns: [/spacex/i, /starship/i, /mars/i],
  },
  {
    company: 'x',
    tags: ['x-platform', 'twitter', 'x-money', 'payments'],
    patterns: [/peer-to-peer payments/i, /\bx money\b/i, /\btwitter\b/i, /\bx launches/i],
  },
  {
    company: 'xai',
    tags: ['xai', 'grok', 'colossus'],
    patterns: [/\bxai\b/i, /\bgrok\b/i, /colossus/i],
  },
  {
    company: 'neuralink',
    tags: ['neuralink', 'implant', 'brain'],
    patterns: [/\bneuralink\b/i, /\bimplant\b/i, /brain[- ]computer/i],
  },
]

function quarterForMonth(monthIndex: number): 1 | 2 | 3 | 4 {
  return (Math.floor(monthIndex / 3) + 1) as 1 | 2 | 3 | 4
}

function quarterEndDate(year: number, quarter: 1 | 2 | 3 | 4): Date {
  const month = quarter * 3
  const nextQuarter = new Date(Date.UTC(year, month, 1, 23, 59, 59))
  return new Date(nextQuarter.getTime() - dayMs)
}

function startOfDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  )
}

function formatQuarterLabel(date: Date): string {
  return `Q${quarterForMonth(date.getUTCMonth())} ${date.getUTCFullYear()} close`
}

export function deriveMarketCompany(market: Market): Company {
  const haystack = `${market.headline} ${market.subject} ${market.summary}`.toLowerCase()
  const normalizedTags = market.tags.map((tag) => tag.toLowerCase())
  let bestCompany: Company = 'tesla'
  let bestScore = 0

  for (const definition of companyDefinitions) {
    const tagScore = definition.tags.reduce(
      (total, tag) => total + (normalizedTags.includes(tag) ? 2 : 0),
      0,
    )
    const patternScore = definition.patterns.reduce(
      (total, pattern) => total + (pattern.test(haystack) ? 1 : 0),
      0,
    )
    const score = tagScore + patternScore

    if (score > bestScore) {
      bestScore = score
      bestCompany = definition.company
    }
  }

  return bestCompany
}

export function deriveCheckpointKind(market: Market): Checkpoint['kind'] {
  const promised = new Date(market.promisedDate)
  const month = promised.getUTCMonth()
  const day = promised.getUTCDate()
  const quarterEndDayByMonth = new Map<number, number>([
    [2, 31],
    [5, 30],
    [8, 30],
  ])

  if (month === 11 && day === 31) {
    return 'year_end'
  }

  if (quarterEndDayByMonth.get(month) === day) {
    return 'quarter_end'
  }

  return 'interim'
}

export function deriveSeasonalLabel(market: Market): string {
  const promised = new Date(market.promisedDate)
  const quarter = quarterForMonth(promised.getUTCMonth())

  if (deriveCheckpointKind(market) === 'year_end') {
    return `Q4 ${promised.getUTCFullYear()} / year-end`
  }

  return `Q${quarter} ${promised.getUTCFullYear()} window`
}

function buildCheckpointState(
  deadline: Date,
  isFinal: boolean,
  market: Market,
  now: Date,
  seenNext: { value: boolean },
): CheckpointState {
  if (isFinal && market.resolution === 'delivered') {
    return 'delivered'
  }

  if (isFinal && market.status === 'busted') {
    return 'missed'
  }

  if (deadline.getTime() < now.getTime()) {
    return 'passed'
  }

  if (!seenNext.value) {
    seenNext.value = true
    return 'next'
  }

  return 'upcoming'
}

export function buildMarketCheckpoints(
  market: Market,
  now: Date,
): Checkpoint[] {
  const announced = startOfDay(new Date(market.announcedOn))
  const promised = new Date(market.promisedDate)
  const spanDays = Math.max(
    0,
    Math.round((promised.getTime() - announced.getTime()) / dayMs),
  )

  const milestoneDates: Date[] = []
  if (spanDays >= 120) {
    let year = announced.getUTCFullYear()
    let quarter = quarterForMonth(announced.getUTCMonth())

    while (true) {
      quarter = quarter === 4 ? 1 : ((quarter + 1) as 1 | 2 | 3 | 4)
      if (quarter === 1) {
        year += 1
      }

      const checkpoint = quarterEndDate(year, quarter)
      if (checkpoint.getTime() >= promised.getTime()) {
        break
      }

      milestoneDates.push(checkpoint)
    }
  }

  const relevantMilestones =
    milestoneDates.length <= 3
      ? milestoneDates
      : (() => {
          const futureMilestones = milestoneDates.filter(
            (deadline) => deadline.getTime() >= now.getTime(),
          )
          const pastMilestones = milestoneDates.filter(
            (deadline) => deadline.getTime() < now.getTime(),
          )

          if (futureMilestones.length >= 3) {
            return futureMilestones.slice(0, 3)
          }

          if (futureMilestones.length === 2) {
            return [pastMilestones.at(-1), ...futureMilestones].filter(
              (deadline): deadline is Date => Boolean(deadline),
            )
          }

          if (futureMilestones.length === 1) {
            return [
              pastMilestones.at(-2),
              pastMilestones.at(-1),
              futureMilestones[0],
            ].filter((deadline): deadline is Date => Boolean(deadline))
          }

          return pastMilestones.slice(-3)
        })()

  const seenNext = { value: false }
  const checkpoints: Checkpoint[] = relevantMilestones.map((deadline) => ({
    id: `${market.id}-${deadline.toISOString()}`,
    label: formatQuarterLabel(deadline),
    deadline: deadline.toISOString(),
    kind: 'interim',
    state: buildCheckpointState(deadline, false, market, now, seenNext),
  }))

  const finalKind = deriveCheckpointKind(market)
  checkpoints.push({
    id: `${market.id}-final`,
    label:
      finalKind === 'year_end'
        ? `Year-end ${promised.getUTCFullYear()} close`
        : finalKind === 'quarter_end'
          ? formatQuarterLabel(promised)
          : 'Final deadline',
    deadline: promised.toISOString(),
    kind: finalKind === 'interim' ? 'interim' : finalKind,
    state: buildCheckpointState(promised, true, market, now, seenNext),
  })

  return checkpoints
}

export function buildEvidenceUpdates(market: Market): EvidenceUpdate[] {
  const updates: EvidenceUpdate[] = market.sources
    .slice()
    .sort((left, right) => {
      const leftTime = Date.parse(left.publishedAt ?? market.announcedOn)
      const rightTime = Date.parse(right.publishedAt ?? market.announcedOn)
      return rightTime - leftTime
    })
    .map((entry) => ({
      id: `${market.id}-${entry.id}`,
      title: entry.label,
      detail: entry.note,
      publishedAt: entry.publishedAt ?? market.announcedOn,
      url: entry.url,
    }))

  if (market.resolutionNotes) {
    updates.unshift({
      id: `${market.id}-settlement`,
      title:
        market.status === 'busted'
          ? 'Deadline settlement'
          : 'Resolution update',
      detail: market.resolutionNotes,
      publishedAt: market.bustedAt ?? market.updatedAt,
      url: null,
    })
  }

  return updates.slice(0, 4)
}

export function enrichMarketForBoard(
  market: Market,
  store: StoreData,
  now: Date,
): Market {
  const company = deriveMarketCompany(market)

  return {
    ...market,
    company,
    checkpointKind: deriveCheckpointKind(market),
    seasonalLabel: deriveSeasonalLabel(market),
    evidenceUpdates: buildEvidenceUpdates(market),
    checkpoints: buildMarketCheckpoints(market, now),
    oddsCommentary: buildPricingCommentary(market, store, now),
  }
}
