import { isSupportMarketId } from '../shared'
import type { Company, Market } from '../shared'

export type CompanyFilter = 'all' | Company

export type CompanyTab = {
  value: CompanyFilter
  label: string
  count: number
}

export type SeasonalSurface = {
  key: string
  title: string
  count: number
  description: string
  leadMarketId: string | null
}

export function isBoardMarket(market: Market): boolean {
  return !isSupportMarketId(market.id)
}

const companyOrder: Company[] = [
  'tesla',
  'spacex',
  'x',
  'xai',
  'neuralink',
  'boring',
  'apple',
  'openai',
  'anthropic',
  'meta',
  'solarcity',
  'hyperloop',
  'doge',
]

export function companyLabel(company: Company): string {
  switch (company) {
    case 'tesla':
      return 'Tesla'
    case 'spacex':
      return 'SpaceX'
    case 'x':
      return 'X'
    case 'xai':
      return 'xAI'
    case 'neuralink':
      return 'Neuralink'
    case 'boring':
      return 'Boring'
    case 'apple':
      return 'Apple'
    case 'openai':
      return 'OpenAI'
    case 'anthropic':
      return 'Anthropic'
    case 'meta':
      return 'Meta'
    case 'solarcity':
      return 'SolarCity'
    case 'hyperloop':
      return 'Hyperloop'
    case 'doge':
      return 'DOGE'
  }
}

export function checkpointKindLabel(
  kind: Market['checkpointKind'] | undefined,
): string {
  switch (kind) {
    case 'year_end':
      return 'Year-end card'
    case 'quarter_end':
      return 'Quarter close'
    case 'interim':
      return 'Interim card'
    default:
      return 'Open market'
  }
}

export function marketCompany(market: Market): Company {
  return market.company ?? 'tesla'
}

export function createCompanyTabs(markets: Market[]): CompanyTab[] {
  const boardMarkets = markets.filter(isBoardMarket)

  return [
    {
      value: 'all',
      label: 'All',
      count: boardMarkets.length,
    },
    ...companyOrder.map((company) => ({
      value: company,
      label: companyLabel(company),
      count: boardMarkets.filter((market) => marketCompany(market) === company).length,
    })),
  ]
}

export function createSeasonalSurfaces(
  markets: Market[],
  nowIso: string,
): SeasonalSurface[] {
  const boardMarkets = markets.filter(isBoardMarket)
  const now = new Date(nowIso)
  const currentYear = now.getUTCFullYear()

  const q2CheckpointMarkets = boardMarkets.filter(
    (market) =>
      market.status === 'open' &&
      market.checkpoints?.some((checkpoint) =>
        checkpoint.label.startsWith(`Q2 ${currentYear}`),
      ),
  )
  const q4Markets = boardMarkets.filter((market) => {
    const promised = new Date(market.promisedDate)
    return (
      market.status === 'open' &&
      promised.getUTCFullYear() === currentYear &&
      promised.getUTCMonth() >= 9
    )
  })
  const yearEndGraveyard = boardMarkets.filter((market) => {
    const promised = new Date(market.promisedDate)
    return (
      promised.getUTCMonth() === 11 &&
      (market.status !== 'open' || promised.getTime() < now.getTime())
    )
  })

  return [
    {
      key: 'q2-close',
      title: 'Q2 close',
      count: q2CheckpointMarkets.length,
      description:
        q2CheckpointMarkets.length > 0
          ? `${q2CheckpointMarkets.length} open cards have a Q2 ${currentYear} checkpoint before the year-end squeeze.`
          : `No open cards are lining up a Q2 ${currentYear} checkpoint right now.`,
      leadMarketId: q2CheckpointMarkets[0]?.id ?? null,
    },
    {
      key: 'q4-cluster',
      title: 'Q4 deadline cluster',
      count: q4Markets.length,
      description:
        q4Markets.length > 0
          ? `${q4Markets.length} live cards resolve in Q4 ${currentYear}, so year-end pressure is stacking on the board.`
          : `The current board has no live Q4 ${currentYear} closes.`,
      leadMarketId: q4Markets[0]?.id ?? null,
    },
    {
      key: 'year-end-graveyard',
      title: 'Year-end graveyard',
      count: yearEndGraveyard.length,
      description:
        yearEndGraveyard.length > 0
          ? `${yearEndGraveyard.length} older year-end claims already washed out and can be revisited as busted history.`
          : 'No year-end misses are archived yet.',
      leadMarketId: yearEndGraveyard[0]?.id ?? null,
    },
  ]
}
