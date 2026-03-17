import * as chrono from 'chrono-node'

import type {
  CandidateMarket,
  Category,
  SearchResult,
  SourceType,
} from '../shared'
import { candidateMarketSchema } from '../shared'
import {
  clamp,
  createSourceId,
  domainFromUrl,
  titleCase,
} from '../services/utils'

type SubjectDefinition = {
  subject: string
  category: Category
  tags: string[]
  patterns: string[]
}

const subjects: SubjectDefinition[] = [
  {
    subject: 'Tesla Full Self-Driving',
    category: 'autonomy',
    tags: ['tesla', 'fsd', 'autonomy'],
    patterns: [
      'full self-driving',
      'fsd',
      'self-driving',
      'autopilot',
      'unsupervised',
    ],
  },
  {
    subject: 'Tesla Robotaxi',
    category: 'robotaxi',
    tags: ['tesla', 'robotaxi', 'autonomy', 'cybercab'],
    patterns: [
      'robotaxi',
      'ride-hailing',
      'driverless service',
      'autonomous taxi',
    ],
  },
  {
    subject: 'Cybercab',
    category: 'vehicle',
    tags: ['tesla', 'cybercab', 'vehicle', 'robotaxi'],
    patterns: ['cybercab', 'purpose-built robotaxi'],
  },
  {
    subject: 'Optimus',
    category: 'robotics',
    tags: ['tesla', 'optimus', 'robotics', 'humanoid'],
    patterns: ['optimus', 'humanoid robot', 'robot army', 'tesla bot'],
  },
  {
    subject: 'SpaceX Mars',
    category: 'space',
    tags: ['spacex', 'mars', 'starship'],
    patterns: [
      'spacex',
      'mars',
      'starship',
      'crewed mission to mars',
      'uncrewed mission to mars',
    ],
  },
  {
    subject: 'The Boring Company',
    category: 'transport',
    tags: ['boring', 'tunnel', 'transport'],
    patterns: ['boring company', 'vegas loop', 'tunnel under los angeles'],
  },
  {
    subject: 'SolarCity Solar Roof',
    category: 'energy',
    tags: ['solarcity', 'solar roof', 'energy'],
    patterns: ['solarcity', 'solar roof', 'solarglass', 'roof tiles'],
  },
  {
    subject: 'Hyperloop',
    category: 'transport',
    tags: ['hyperloop', 'transport'],
    patterns: ['hyperloop', 'vacuum tube', 'nyc to dc route'],
  },
  {
    subject: 'X Money',
    category: 'social',
    tags: ['x-platform', 'payments', 'social'],
    patterns: [
      'peer-to-peer payments',
      'x money',
      'digital wallet',
      'everything app',
    ],
  },
  {
    subject: 'Grok',
    category: 'ai',
    tags: ['xai', 'grok', 'ai'],
    patterns: ['grok', 'xai', 'large language model', 'next-gen grok'],
  },
  {
    subject: 'Neuralink implant',
    category: 'neurotech',
    tags: ['neuralink', 'implant', 'neurotech'],
    patterns: [
      'neuralink',
      'human implant',
      'brain chip',
      'brain-computer interface',
    ],
  },
  {
    subject: 'DOGE',
    category: 'government',
    tags: ['doge', 'government', 'savings'],
    patterns: [
      'department of government efficiency',
      'doge dividend',
      'fiscal year 2026 savings',
      'doge',
    ],
  },
]

const promiseHints =
  /(will|would|expects?|planned|plans?|scheduled|could|begin|launch|unveil|start|selling|production|by|before|next year|this year)/i

function normalizeAnnouncementDate(publishedAt: string | null): string {
  return publishedAt ?? new Date().toISOString()
}

function findSubject(text: string): SubjectDefinition | null {
  const lowered = text.toLowerCase()
  let best: SubjectDefinition | null = null
  let bestScore = 0

  for (const definition of subjects) {
    const score = definition.patterns.reduce(
      (total, pattern) => total + (lowered.includes(pattern) ? 1 : 0),
      0,
    )
    if (score > bestScore) {
      best = definition
      bestScore = score
    }
  }

  return bestScore > 0 ? best : null
}

function pickPromisedDate(
  text: string,
  publishedAt: string | null,
): string | null {
  const reference = publishedAt ? new Date(publishedAt) : new Date()
  const lowered = text.toLowerCase()
  const resolveYearToken = (token: string): number => {
    if (token === 'this year') {
      return reference.getUTCFullYear()
    }

    if (token === 'next year') {
      return reference.getUTCFullYear() + 1
    }

    return Number(token)
  }

  const endOfYear = lowered.match(
    /\b(?:end of|by the end of|before the end of)\s+(this year|next year|20\d{2})\b/,
  )
  if (endOfYear) {
    const year = resolveYearToken(endOfYear[1])

    return new Date(Date.UTC(year, 11, 31, 23, 59, 59)).toISOString()
  }

  const midYear = lowered.match(/\bmiddle of\s+(this year|next year|20\d{2})\b/)
  if (midYear) {
    const year = resolveYearToken(midYear[1])

    return new Date(Date.UTC(year, 5, 30, 23, 59, 59)).toISOString()
  }

  const fiscalYear = lowered.match(/\b(?:fiscal year|fy)\s*(20\d{2})\b/)
  if (fiscalYear) {
    return new Date(
      Date.UTC(Number(fiscalYear[1]), 8, 30, 23, 59, 59),
    ).toISOString()
  }

  const startingYear = lowered.match(
    /\b(?:starting in|during|by|in)\s+(20\d{2})\b/,
  )
  if (startingYear) {
    return new Date(
      Date.UTC(Number(startingYear[1]), 11, 31, 23, 59, 59),
    ).toISOString()
  }

  const plainRelativeYear = lowered.match(/\b(this year|next year)\b/)
  if (plainRelativeYear) {
    return new Date(
      Date.UTC(resolveYearToken(plainRelativeYear[1]), 11, 31, 23, 59, 59),
    ).toISOString()
  }

  const parsed = chrono.parseDate(text, reference, { forwardDate: true })
  return parsed ? parsed.toISOString() : null
}

export function scoreCandidateFromSignals(
  sourceType: SourceType,
  input: {
    hasFetchedText: boolean
    hasExplicitDateSignal: boolean
  },
): {
  confidence: number
  stakeDifficulty: number
  basePayoutMultiplier: number
} {
  const confidence = clamp(
    52 +
      (input.hasFetchedText ? 18 : 0) +
      (sourceType === 'official' ? 15 : 0) +
      (sourceType === 'x' ? 8 : 0) +
      (input.hasExplicitDateSignal ? 10 : 0),
    55,
    97,
  )
  const stakeDifficulty = clamp(Math.round(confidence / 22), 2, 5)
  const basePayoutMultiplier = Number(
    (
      1.35 +
      stakeDifficulty * 0.22 +
      (sourceType === 'official' ? 0.2 : 0)
    ).toFixed(2),
  )

  return {
    confidence,
    stakeDifficulty,
    basePayoutMultiplier,
  }
}

export function classifyResult(result: SearchResult): CandidateMarket | null {
  const combined = [
    result.fetchedTitle,
    result.title,
    result.snippet,
    result.fetchedText,
  ]
    .filter(Boolean)
    .join(' ')
  const lowered = combined.toLowerCase()

  if (
    !/(elon|musk|tesla ceo|tesla|spacex|xai|neuralink|twitter|x money|grok|boring company|solarcity|solar roof|hyperloop|doge)/i.test(
      combined,
    ) ||
    !promiseHints.test(combined)
  ) {
    return null
  }

  const subject = findSubject(combined)
  if (!subject) {
    return null
  }

  const promisedDate = pickPromisedDate(combined, result.publishedAt)
  if (!promisedDate) {
    return null
  }

  const scoring = scoreCandidateFromSignals(result.sourceType, {
    hasFetchedText: Boolean(result.fetchedText),
    hasExplicitDateSignal:
      /\b(20\d{2}|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
        lowered,
      ),
  })

  return candidateMarketSchema.parse({
    headline: result.fetchedTitle || result.title || titleCase(subject.subject),
    subject: subject.subject,
    category: subject.category,
    announcedOn: normalizeAnnouncementDate(result.publishedAt),
    promisedDate,
    summary: (result.fetchedText || result.snippet || result.title).slice(
      0,
      260,
    ),
    confidence: scoring.confidence,
    stakeDifficulty: scoring.stakeDifficulty,
    basePayoutMultiplier: scoring.basePayoutMultiplier,
    payoutMultiplier: scoring.basePayoutMultiplier,
    tags: [...subject.tags, result.sourceType],
    source: {
      id: createSourceId(result.title || result.domain, result.url),
      label: result.title || result.domain,
      url: result.url,
      sourceType: result.sourceType,
      domain: domainFromUrl(result.url),
      publishedAt: result.publishedAt,
      note: `Discovered through agent search for query “${result.query}”.`,
    },
    author: null,
  })
}

export function classifyResults(results: SearchResult[]): {
  candidates: CandidateMarket[]
  discarded: string[]
} {
  const candidates: CandidateMarket[] = []
  const discarded: string[] = []

  for (const result of results) {
    const candidate = classifyResult(result)
    if (candidate) {
      candidates.push(candidate)
    } else {
      discarded.push(result.url)
    }
  }

  return { candidates, discarded }
}
