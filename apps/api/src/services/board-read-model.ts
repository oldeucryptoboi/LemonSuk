import type {
  BoardEventGroupSummary,
  BoardFamilySummary,
  DashboardSnapshot,
  Entity,
  EventGroup,
  EventGroupDetail,
  Market,
  MarketDetail,
  PredictionFamily,
} from '../shared'
import {
  boardEventGroupSummarySchema,
  boardFamilySummarySchema,
  eventGroupDetailSchema,
  isSupportMarketId,
  marketDetailSchema,
} from '../shared'

type CatalogContext = {
  families: PredictionFamily[]
  entities: Entity[]
  groups: EventGroup[]
}

type CatalogIndex = {
  familiesById: Map<string, PredictionFamily>
  familiesBySlug: Map<string, PredictionFamily>
  entitiesById: Map<string, Entity>
  entitiesBySlug: Map<string, Entity>
}

const muskCompanySet = new Set([
  'elon-musk',
  'tesla',
  'spacex',
  'x',
  'xai',
  'neuralink',
  'boring',
  'solarcity',
  'hyperloop',
])

function createCatalogIndex(catalog: CatalogContext): CatalogIndex {
  return {
    familiesById: new Map(catalog.families.map((family) => [family.id, family])),
    familiesBySlug: new Map(
      catalog.families.map((family) => [family.slug, family]),
    ),
    entitiesById: new Map(catalog.entities.map((entity) => [entity.id, entity])),
    entitiesBySlug: new Map(
      catalog.entities.map((entity) => [entity.slug, entity]),
    ),
  }
}

function boardMarkets(snapshot: DashboardSnapshot): Market[] {
  return snapshot.markets.filter((market) => !isSupportMarketId(market.id))
}

function marketHaystack(market: Market): string {
  return [
    market.headline,
    market.subject,
    market.summary,
    market.promisedBy,
    ...market.tags,
  ]
    .join(' ')
    .toLowerCase()
}

function inferFamilySlug(market: Market): PredictionFamily['slug'] {
  const haystack = marketHaystack(market)

  if (
    market.category === 'ai' ||
    market.company === 'xai' ||
    haystack.includes('openai') ||
    haystack.includes('chatgpt') ||
    haystack.includes('anthropic') ||
    haystack.includes('claude') ||
    haystack.includes('meta ai')
  ) {
    return 'ai_launch'
  }

  if (market.category === 'government' || market.company === 'doge') {
    return 'policy_promise'
  }

  if (
    haystack.includes('guidance') ||
    haystack.includes('earnings') ||
    haystack.includes('delivery target')
  ) {
    return 'earnings_guidance'
  }

  if (market.category === 'social') {
    return 'ceo_claim'
  }

  return 'product_ship_date'
}

function inferEntitySlug(market: Market): string | null {
  const haystack = marketHaystack(market)

  if (haystack.includes('anthropic') || haystack.includes('claude')) {
    return 'anthropic'
  }

  if (haystack.includes('openai') || haystack.includes('chatgpt')) {
    return 'openai'
  }

  if (haystack.includes('apple') || haystack.includes('iphone')) {
    return 'apple'
  }

  if (haystack.includes('meta') || haystack.includes('facebook')) {
    return 'meta'
  }

  switch (market.company) {
    case 'apple':
    case 'openai':
    case 'anthropic':
    case 'meta':
    case 'tesla':
    case 'spacex':
    case 'x':
    case 'xai':
    case 'neuralink':
    case 'boring':
    case 'solarcity':
    case 'hyperloop':
    case 'doge':
      return market.company
    default:
      break
  }

  if (haystack.includes('elon')) {
    return 'elon-musk'
  }

  return null
}

function pickHeroMarket(markets: Market[]): Market | null {
  const open = markets.find((market) => market.status === 'open')
  return open ?? markets[0] ?? null
}

function marketMatchesGroup(
  market: Market,
  group: EventGroup,
  index: CatalogIndex,
): boolean {
  const familySlug = inferFamilySlug(market)
  const entitySlug = inferEntitySlug(market)
  const groupFamily = group.familyId ? index.familiesById.get(group.familyId) : null
  const groupEntity = group.primaryEntityId
    ? index.entitiesById.get(group.primaryEntityId)
    : null
  const haystack = marketHaystack(market)

  if (group.slug === 'musk-deadline-board') {
    return haystack.includes('elon') || Boolean(entitySlug && muskCompanySet.has(entitySlug))
  }

  if (groupFamily && groupFamily.slug !== familySlug) {
    return false
  }

  if (groupEntity && groupEntity.slug !== entitySlug) {
    return false
  }

  return Boolean(groupFamily || groupEntity)
}

function summarizeGroup(
  group: EventGroup,
  snapshot: DashboardSnapshot,
  catalog: CatalogContext,
  index: CatalogIndex,
): BoardEventGroupSummary {
  const markets = boardMarkets(snapshot).filter((market) =>
    marketMatchesGroup(market, group, index),
  )
  const family = group.familyId ? index.familiesById.get(group.familyId) ?? null : null
  const primaryEntity = group.primaryEntityId
    ? index.entitiesById.get(group.primaryEntityId) ?? null
    : null

  return boardEventGroupSummarySchema.parse({
    group,
    family,
    primaryEntity,
    totalMarkets: markets.length,
    openMarkets: markets.filter((market) => market.status === 'open').length,
    heroMarket: pickHeroMarket(markets),
  })
}

export function createBoardFamilySummaries(
  snapshot: DashboardSnapshot,
  catalog: CatalogContext,
): BoardFamilySummary[] {
  const index = createCatalogIndex(catalog)
  const summaries = catalog.families.map((family) => {
    const markets = boardMarkets(snapshot).filter(
      (market) => inferFamilySlug(market) === family.slug,
    )
    const entitySlugs = new Set(
      markets
        .map((market) => inferEntitySlug(market))
        .filter((value): value is string => Boolean(value)),
    )
    const activeGroups = catalog.groups.filter((group) => {
      const summary = summarizeGroup(group, snapshot, catalog, index)
      return summary.family?.id === family.id && summary.totalMarkets > 0
    }).length

    return boardFamilySummarySchema.parse({
      family,
      totalMarkets: markets.length,
      openMarkets: markets.filter((market) => market.status === 'open').length,
      activeGroups,
      primaryEntities: [...entitySlugs]
        .map((slug) => index.entitiesBySlug.get(slug))
        .filter((entity): entity is Entity => Boolean(entity)),
      heroMarket: pickHeroMarket(markets),
    })
  })

  return summaries.sort((left, right) => {
    if (right.openMarkets !== left.openMarkets) {
      return right.openMarkets - left.openMarkets
    }

    if (right.totalMarkets !== left.totalMarkets) {
      return right.totalMarkets - left.totalMarkets
    }

    return left.family.displayName.localeCompare(right.family.displayName)
  })
}

export function createBoardEventGroupSummaries(
  snapshot: DashboardSnapshot,
  catalog: CatalogContext,
): BoardEventGroupSummary[] {
  const index = createCatalogIndex(catalog)

  return catalog.groups
    .map((group) => summarizeGroup(group, snapshot, catalog, index))
    .sort((left, right) => {
      if (right.openMarkets !== left.openMarkets) {
        return right.openMarkets - left.openMarkets
      }

      if (right.totalMarkets !== left.totalMarkets) {
        return right.totalMarkets - left.totalMarkets
      }

      return left.group.title.localeCompare(right.group.title)
    })
}

export function createEventGroupDetail(
  groupSlug: string,
  snapshot: DashboardSnapshot,
  catalog: CatalogContext,
): EventGroupDetail | null {
  const index = createCatalogIndex(catalog)
  const group = catalog.groups.find((entry) => entry.slug === groupSlug)
  if (!group) {
    return null
  }

  const markets = boardMarkets(snapshot).filter((market) =>
    marketMatchesGroup(market, group, index),
  )

  return eventGroupDetailSchema.parse({
    summary: summarizeGroup(group, snapshot, catalog, index),
    markets,
  })
}

export function createMarketDetail(
  marketSlug: string,
  snapshot: DashboardSnapshot,
  catalog: CatalogContext,
): MarketDetail | null {
  const market = boardMarkets(snapshot).find((entry) => entry.slug === marketSlug)
  if (!market) {
    return null
  }

  const index = createCatalogIndex(catalog)
  const family = index.familiesBySlug.get(inferFamilySlug(market)) ?? null
  const primaryEntity = (() => {
    const slug = inferEntitySlug(market)
    return slug ? index.entitiesBySlug.get(slug) ?? null : null
  })()
  const groupSummaries = catalog.groups
    .filter((group) => marketMatchesGroup(market, group, index))
    .map((group) => summarizeGroup(group, snapshot, catalog, index))
  const relatedMarkets = boardMarkets(snapshot)
    .filter((candidate) => {
      if (candidate.id === market.id) {
        return false
      }

      if (
        market.linkedMarketIds.includes(candidate.id) ||
        candidate.linkedMarketIds.includes(market.id)
      ) {
        return true
      }

      return (
        inferFamilySlug(candidate) === inferFamilySlug(market) ||
        inferEntitySlug(candidate) === inferEntitySlug(market)
      )
    })
    .slice(0, 6)

  return marketDetailSchema.parse({
    market,
    family,
    primaryEntity,
    eventGroups: groupSummaries,
    relatedMarkets,
  })
}
