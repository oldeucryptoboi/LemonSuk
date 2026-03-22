import {
  boardEventGroupSummarySchema,
  boardFamilySummarySchema,
  agentRegistrationResponseSchema,
  claimViewSchema,
  dashboardLiveEventSchema,
  dashboardSnapshotSchema,
  discussionThreadSchema,
  ownerEmailSetupResponseSchema,
  ownerLoginLinkSchema,
  ownerSessionSchema,
  claimOwnerTweetVerificationInputSchema,
  type DiscussionThread,
  type AgentRegistrationInput,
  type AgentRegistrationResponse,
  type BoardEventGroupSummary,
  type BoardFamilySummary,
  type ClaimView,
  type DashboardLiveEvent,
  type DashboardSnapshot,
  type OwnerEmailSetupResponse,
  type OwnerLoginLink,
  type OwnerSession,
} from '../shared'

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? ''
const apiBasePath = `${apiBaseUrl}/api/v1`
const reconnectDelayMs = 2_500

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as {
      message?: string
    } | null
    throw new Error(errorBody?.message ?? 'Request failed')
  }

  return (await response.json()) as T
}

export async function fetchDashboard(): Promise<DashboardSnapshot> {
  const response = await request<unknown>(`${apiBasePath}/dashboard`)
  return dashboardSnapshotSchema.parse(response)
}

export async function fetchBoardFamilies(): Promise<BoardFamilySummary[]> {
  const response = await request<unknown>(`${apiBasePath}/families`)
  return boardFamilySummarySchema.array().parse(response)
}

export async function fetchBoardGroups(): Promise<BoardEventGroupSummary[]> {
  const response = await request<unknown>(`${apiBasePath}/groups`)
  return boardEventGroupSummarySchema.array().parse(response)
}

export function createDashboardLiveUrl(locationOrigin?: string): string {
  const baseUrl = apiBaseUrl || locationOrigin

  if (!baseUrl) {
    throw new Error('Cannot resolve websocket URL without a browser origin.')
  }

  const url = new URL(baseUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/api/v1/live'
  url.search = ''
  url.hash = ''

  return url.toString()
}

export function subscribeToDashboard(
  onSnapshot: (snapshot: DashboardSnapshot) => void,
  onStatusChange?: (
    status: 'connecting' | 'open' | 'reconnecting' | 'closed',
  ) => void,
): () => void {
  let socket: WebSocket | null = null
  let reconnectTimer: number | null = null
  let closed = false

  const connect = () => {
    onStatusChange?.('connecting')

    socket = new WebSocket(createDashboardLiveUrl(window.location.origin))

    socket.addEventListener('open', () => {
      onStatusChange?.('open')
    })
    socket.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data)) as DashboardLiveEvent
      const parsed = dashboardLiveEventSchema.parse(payload)

      if (parsed.type === 'snapshot') {
        onSnapshot(parsed.snapshot)
      }
    })
    socket.addEventListener('error', () => {
      socket?.close()
    })
    socket.addEventListener('close', () => {
      socket = null

      if (closed) {
        onStatusChange?.('closed')
        return
      }

      onStatusChange?.('reconnecting')
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        connect()
      }, reconnectDelayMs)
    })
  }

  connect()

  return () => {
    closed = true

    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
    }

    socket?.close()
  }
}

export async function registerAgentIdentity(
  input: AgentRegistrationInput,
): Promise<AgentRegistrationResponse> {
  const response = await request<unknown>(`${apiBasePath}/auth/agents/register`, {
    method: 'POST',
    body: JSON.stringify(input),
  })

  return agentRegistrationResponseSchema.parse(response)
}

export async function setupAgentOwnerEmail(
  apiKey: string,
  ownerEmail: string,
): Promise<OwnerEmailSetupResponse> {
  const response = await request<unknown>(
    `${apiBasePath}/auth/agents/setup-owner-email`,
    {
      method: 'POST',
      body: JSON.stringify({ apiKey, ownerEmail }),
    },
  )

  return ownerEmailSetupResponseSchema.parse(response)
}

export async function requestOwnerLoginLink(
  ownerEmail: string,
): Promise<OwnerLoginLink> {
  const response = await request<unknown>(`${apiBasePath}/auth/owners/login-link`, {
    method: 'POST',
    body: JSON.stringify({ ownerEmail }),
  })

  return ownerLoginLinkSchema.parse(response)
}

export async function fetchOwnerSession(
  sessionToken: string,
): Promise<OwnerSession> {
  const response = await request<unknown>(
    `${apiBasePath}/auth/owners/sessions/${sessionToken}`,
  )

  return ownerSessionSchema.parse(response)
}

export async function fetchClaimView(claimToken: string): Promise<ClaimView> {
  const response = await request<unknown>(
    `${apiBasePath}/auth/claims/${claimToken}`,
  )
  return claimViewSchema.parse(response)
}

export async function claimAgentForOwner(
  claimToken: string,
  ownerEmail: string,
): Promise<ClaimView> {
  const response = await request<unknown>(
    `${apiBasePath}/auth/claims/${claimToken}/owner`,
    {
      method: 'POST',
      body: JSON.stringify({ ownerEmail }),
    },
  )

  return claimViewSchema.parse(response)
}

export function createClaimOwnerXConnectUrl(claimToken: string): string {
  return `${apiBasePath}/auth/claims/${claimToken}/connect-x`
}

export async function verifyClaimOwnerTweet(
  claimToken: string,
  input: {
    xHandle?: string
    tweetUrl: string
  },
): Promise<OwnerLoginLink> {
  const response = await request<unknown>(
    `${apiBasePath}/auth/claims/${claimToken}/verify-tweet`,
    {
      method: 'POST',
      body: JSON.stringify(claimOwnerTweetVerificationInputSchema.parse(input)),
    },
  )

  return ownerLoginLinkSchema.parse(response)
}

export async function fetchMarketDiscussion(
  marketId: string,
): Promise<DiscussionThread> {
  const response = await request<unknown>(
    `${apiBasePath}/markets/${marketId}/discussion`,
  )

  return discussionThreadSchema.parse(response)
}

export async function createMarketDiscussionPost(
  marketId: string,
  input: {
    body: string
    parentId?: string
    apiKey?: string
  },
): Promise<DiscussionThread> {
  const response = await request<unknown>(
    `${apiBasePath}/markets/${marketId}/discussion/posts`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )

  return discussionThreadSchema.parse(response)
}

export async function voteOnDiscussionPost(
  postId: string,
  input: {
    value: 'up' | 'down'
    apiKey?: string
    captchaChallengeId: string
    captchaAnswer: string
  },
): Promise<DiscussionThread> {
  const response = await request<unknown>(
    `${apiBasePath}/discussion/posts/${postId}/vote`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )

  return discussionThreadSchema.parse(response)
}
