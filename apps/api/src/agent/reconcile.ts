import type { CandidateMarket, Market, StoreData } from '../shared'
import { storeSchema } from '../shared'
import {
  createMarketId,
  daysBetween,
  similarityScore,
  slugify,
  unique,
} from '../services/utils'

function mergeSources(
  left: Market['sources'],
  right: Market['sources'],
): Market['sources'] {
  return Array.from(
    new Map([...left, ...right].map((source) => [source.url, source])).values(),
  )
}

function findMatch(
  candidate: CandidateMarket,
  markets: Market[],
): Market | null {
  return (
    markets.find(
      (market) =>
        market.subject === candidate.subject &&
        (daysBetween(market.promisedDate, candidate.promisedDate) <= 45 ||
          similarityScore(market.headline, candidate.headline) >= 0.66),
    ) ?? null
  )
}

export function reconcileCandidates(
  store: StoreData,
  candidates: CandidateMarket[],
  searchedAt: string,
): {
  store: StoreData
  createdMarketIds: string[]
  updatedMarketIds: string[]
} {
  const createdMarketIds: string[] = []
  const updatedMarketIds: string[] = []
  const markets = [...store.markets]

  for (const candidate of candidates) {
    const existing = findMatch(candidate, markets)

    if (existing) {
      const updated: Market = {
        ...existing,
        headline:
          existing.headline.length >= candidate.headline.length
            ? existing.headline
            : candidate.headline,
        summary:
          existing.summary.length >= candidate.summary.length
            ? existing.summary
            : candidate.summary,
        confidence: Math.max(existing.confidence, candidate.confidence),
        basePayoutMultiplier: Math.max(
          existing.basePayoutMultiplier,
          candidate.basePayoutMultiplier,
        ),
        payoutMultiplier: Math.max(
          existing.payoutMultiplier,
          candidate.payoutMultiplier,
        ),
        stakeDifficulty: Math.max(
          existing.stakeDifficulty,
          candidate.stakeDifficulty,
        ),
        tags: unique([...existing.tags, ...candidate.tags]),
        sources: mergeSources(existing.sources, [candidate.source]),
        author: existing.author ?? candidate.author ?? null,
        announcedOn:
          Date.parse(existing.announcedOn) <= Date.parse(candidate.announcedOn)
            ? existing.announcedOn
            : candidate.announcedOn,
        updatedAt: searchedAt,
      }

      const index = markets.findIndex((market) => market.id === existing.id)
      markets[index] = updated
      updatedMarketIds.push(existing.id)
      continue
    }

    const marketId = createMarketId(candidate.subject, candidate.promisedDate)
    const created: Market = {
      id: marketId,
      slug: slugify(candidate.headline),
      headline: candidate.headline,
      subject: candidate.subject,
      category: candidate.category,
      announcedOn: candidate.announcedOn,
      promisedDate: candidate.promisedDate,
      promisedBy: 'Elon Musk',
      summary: candidate.summary,
      status: 'open',
      resolution: 'pending',
      resolutionNotes: null,
      basePayoutMultiplier: candidate.basePayoutMultiplier,
      payoutMultiplier: candidate.payoutMultiplier,
      confidence: candidate.confidence,
      stakeDifficulty: candidate.stakeDifficulty,
      tags: candidate.tags,
      sources: [candidate.source],
      author: candidate.author ?? null,
      linkedMarketIds: [],
      betWindowOpen: true,
      bustedAt: null,
      createdAt: searchedAt,
      updatedAt: searchedAt,
      lastCheckedAt: searchedAt,
    }

    markets.push(created)
    createdMarketIds.push(created.id)
  }

  return {
    store: storeSchema.parse({
      ...store,
      markets,
      metadata: {
        ...store.metadata,
        lastDiscoveryRunAt: searchedAt,
      },
    }),
    createdMarketIds,
    updatedMarketIds,
  }
}
