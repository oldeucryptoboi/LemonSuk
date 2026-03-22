import { afterEach, describe, expect, it, vi } from 'vitest'

describe('server api helpers', () => {
  const originalFetch = global.fetch
  const originalInternalBaseUrl = process.env.INTERNAL_API_BASE_URL
  const originalPublicBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

  afterEach(() => {
    global.fetch = originalFetch
    process.env.INTERNAL_API_BASE_URL = originalInternalBaseUrl
    process.env.NEXT_PUBLIC_API_BASE_URL = originalPublicBaseUrl
    vi.restoreAllMocks()
  })

  function buildDashboardPayload() {
    return {
      now: '2026-03-18T00:00:00.000Z',
      stats: {
        totalMarkets: 1,
        openMarkets: 1,
        bustedMarkets: 0,
        resolvedMarkets: 0,
        activeBets: 0,
        wonBets: 0,
        lostBets: 0,
        globalBonusPercent: 10,
        bustedRatePercent: 0,
        registeredAgents: 0,
        humanVerifiedAgents: 0,
      },
      markets: [],
      bets: [],
      notifications: [],
      hallOfFame: [],
      metadata: {
        lastMaintenanceRunAt: null,
        lastDiscoveryRunAt: null,
      },
    }
  }

  function buildFamilyPayload() {
    return [
      {
        family: {
          id: 'family_ai_launch',
          slug: 'ai_launch',
          displayName: 'AI launches',
          description: 'AI launch markets.',
          defaultResolutionMode: 'deadline',
          defaultTimeHorizon: '30d',
          status: 'active',
        },
        totalMarkets: 2,
        openMarkets: 2,
        activeGroups: 1,
        primaryEntities: [],
        heroMarket: null,
      },
    ]
  }

  function buildGroupPayload() {
    return [
      {
        group: {
          id: 'group_openai_release_radar',
          slug: 'openai-release-radar',
          title: 'OpenAI release radar',
          description: 'OpenAI launches.',
          familyId: 'family_ai_launch',
          primaryEntityId: 'entity_openai',
          status: 'active',
          startAt: null,
          endAt: null,
          heroMarketId: null,
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z',
        },
        family: {
          id: 'family_ai_launch',
          slug: 'ai_launch',
          displayName: 'AI launches',
          description: 'AI launch markets.',
          defaultResolutionMode: 'deadline',
          defaultTimeHorizon: '30d',
          status: 'active',
        },
        primaryEntity: {
          id: 'entity_openai',
          slug: 'openai',
          displayName: 'OpenAI',
          entityType: 'company',
          status: 'active',
          aliases: [],
        },
        totalMarkets: 1,
        openMarkets: 1,
        heroMarket: null,
      },
    ]
  }

  function buildMarketPayload() {
    return {
      market: {
        id: 'market_1',
        slug: 'openai-gpt5-summer-2026',
        headline: 'OpenAI launches GPT-5 by August 31, 2026',
        subject: 'OpenAI GPT-5',
        category: 'ai',
        announcedOn: '2026-03-01T00:00:00.000Z',
        promisedDate: '2026-08-31T23:59:59.000Z',
        promisedBy: 'Sam Altman',
        summary: 'OpenAI ships GPT-5 within the summer 2026 window.',
        status: 'open',
        resolution: 'pending',
        resolutionNotes: null,
        basePayoutMultiplier: 1.8,
        payoutMultiplier: 1.8,
        confidence: 80,
        stakeDifficulty: 3,
        tags: ['openai'],
        sources: [],
        author: null,
        linkedMarketIds: [],
        betWindowOpen: true,
        bustedAt: null,
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-01T00:00:00.000Z',
        lastCheckedAt: '2026-03-01T00:00:00.000Z',
      },
      family: buildFamilyPayload()[0].family,
      primaryEntity: buildGroupPayload()[0].primaryEntity,
      eventGroups: buildGroupPayload(),
      relatedMarkets: [],
    }
  }

  function buildPublicAgentProfilePayload() {
    return {
      agent: {
        id: 'agent_1',
        handle: 'yabby',
        displayName: 'Yabby',
        avatarUrl: 'https://lemonsuk.com/agent-avatars/yabby/current.png',
        ownerName: 'Owner',
        modelProvider: 'OpenAI',
        biography: 'Board regular.',
        ownerVerifiedAt: '2026-03-18T00:00:00.000Z',
        createdAt: '2026-03-18T00:00:00.000Z',
      },
      karma: 7,
      authoredClaims: 2,
      discussionPosts: 4,
      hallOfFameRank: 1,
      competition: null,
      recentMarkets: [],
      recentDiscussionPosts: [],
    }
  }

  it('uses the internal api base url when present and parses the route payloads', async () => {
    process.env.INTERNAL_API_BASE_URL = 'https://internal.example.com'
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://public.example.com'
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url

      if (url.endsWith('/dashboard')) {
        return new Response(JSON.stringify(buildDashboardPayload()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url.endsWith('/families')) {
        return new Response(JSON.stringify(buildFamilyPayload()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url.endsWith('/groups')) {
        return new Response(JSON.stringify(buildGroupPayload()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url.endsWith('/groups/openai-release-radar')) {
        return new Response(
          JSON.stringify({
            summary: buildGroupPayload()[0],
            markets: [],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }

      if (url.endsWith('/agents/yabby')) {
        return new Response(JSON.stringify(buildPublicAgentProfilePayload()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      return new Response(JSON.stringify(buildMarketPayload()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    global.fetch = fetchMock as typeof fetch

    const serverApi = await import('./server-api')

    await expect(serverApi.fetchDashboardServer()).resolves.toEqual(
      expect.objectContaining({
        stats: expect.objectContaining({
          totalMarkets: 1,
        }),
      }),
    )
    await expect(serverApi.fetchBoardFamiliesServer()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          family: expect.objectContaining({
            slug: 'ai_launch',
          }),
        }),
      ]),
    )
    await expect(serverApi.fetchBoardGroupsServer()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          group: expect.objectContaining({
            slug: 'openai-release-radar',
          }),
        }),
      ]),
    )
    await expect(
      serverApi.fetchBoardGroupDetailServer('openai-release-radar'),
    ).resolves.toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          group: expect.objectContaining({
            slug: 'openai-release-radar',
          }),
        }),
      }),
    )
    await expect(
      serverApi.fetchBoardMarketDetailServer('openai-gpt5-summer-2026'),
    ).resolves.toEqual(
      expect.objectContaining({
        market: expect.objectContaining({
          slug: 'openai-gpt5-summer-2026',
        }),
      }),
    )
    await expect(serverApi.fetchPublicAgentProfileServer('yabby')).resolves.toEqual(
      expect.objectContaining({
        agent: expect.objectContaining({
          handle: 'yabby',
        }),
        hallOfFameRank: 1,
      }),
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/dashboard',
      { cache: 'no-store' },
    )
  })

  it('falls back to the public base url and surfaces request failures', async () => {
    delete process.env.INTERNAL_API_BASE_URL
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://public.example.com'

    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ message: 'broken' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch

    const serverApi = await import('./server-api')

    await expect(serverApi.fetchBoardFamiliesServer()).rejects.toThrow('broken')
    await expect(
      serverApi.fetchBoardGroupsServer(),
    ).rejects.toThrow('broken')
  })

  it('falls all the way back to the local default api base url when no env is set', async () => {
    delete process.env.INTERNAL_API_BASE_URL
    delete process.env.NEXT_PUBLIC_API_BASE_URL

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(buildDashboardPayload()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    global.fetch = fetchMock as typeof fetch

    const serverApi = await import('./server-api')
    await expect(serverApi.fetchDashboardServer()).resolves.toEqual(
      expect.objectContaining({
        stats: expect.objectContaining({
          totalMarkets: 1,
        }),
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/api/v1/dashboard',
      { cache: 'no-store' },
    )
  })

  it('ignores blank env values before falling back to the local default api base url', async () => {
    process.env.INTERNAL_API_BASE_URL = '   '
    process.env.NEXT_PUBLIC_API_BASE_URL = ''

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(buildDashboardPayload()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    global.fetch = fetchMock as typeof fetch

    const serverApi = await import('./server-api')
    await serverApi.fetchDashboardServer()

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/api/v1/dashboard',
      { cache: 'no-store' },
    )
  })

  it('uses a generic request-failed message when the error payload is not json', async () => {
    process.env.INTERNAL_API_BASE_URL = 'https://internal.example.com'

    global.fetch = vi.fn(async () =>
      new Response('no json here', {
        status: 502,
        headers: { 'content-type': 'text/plain' },
      }),
    ) as typeof fetch

    const serverApi = await import('./server-api')

    await expect(serverApi.fetchBoardFamiliesServer()).rejects.toThrow(
      'Request failed',
    )
  })
})
