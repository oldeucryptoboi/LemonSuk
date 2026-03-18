import {
  boardEventGroupSummarySchema,
  boardFamilySummarySchema,
  dashboardSnapshotSchema,
  eventGroupDetailSchema,
  marketDetailSchema,
  type BoardEventGroupSummary,
  type BoardFamilySummary,
  type DashboardSnapshot,
  type EventGroupDetail,
  type MarketDetail,
} from '../shared'

function resolveApiBaseUrl(): string {
  const candidates = [
    process.env.INTERNAL_API_BASE_URL,
    process.env.NEXT_PUBLIC_API_BASE_URL,
  ]
  const configured = candidates.find(
    (value): value is string => Boolean(value && value.trim().length > 0),
  )

  return configured ?? 'http://127.0.0.1:8787'
}

async function requestServer<T>(
  path: string,
  parse: (input: unknown) => T,
): Promise<T> {
  const response = await fetch(`${resolveApiBaseUrl()}/api/v1${path}`, {
    cache: 'no-store',
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as {
      message?: string
    } | null
    throw new Error(errorBody?.message ?? 'Request failed')
  }

  return parse(await response.json())
}

export async function fetchDashboardServer(): Promise<DashboardSnapshot> {
  return requestServer('/dashboard', (payload) =>
    dashboardSnapshotSchema.parse(payload),
  )
}

export async function fetchBoardFamiliesServer(): Promise<BoardFamilySummary[]> {
  return requestServer('/families', (payload) =>
    boardFamilySummarySchema.array().parse(payload),
  )
}

export async function fetchBoardGroupsServer(): Promise<BoardEventGroupSummary[]> {
  return requestServer('/groups', (payload) =>
    boardEventGroupSummarySchema.array().parse(payload),
  )
}

export async function fetchBoardGroupDetailServer(
  slug: string,
): Promise<EventGroupDetail> {
  return requestServer(`/groups/${slug}`, (payload) =>
    eventGroupDetailSchema.parse(payload),
  )
}

export async function fetchBoardMarketDetailServer(
  slug: string,
): Promise<MarketDetail> {
  return requestServer(`/markets/slug/${slug}`, (payload) =>
    marketDetailSchema.parse(payload),
  )
}
