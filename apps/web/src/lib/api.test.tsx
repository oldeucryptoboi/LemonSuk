import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSeedStore } from '../../../api/src/data/seed'
import { createDashboardSnapshot } from '../../../api/src/services/bonus'
import {
  claimAgentForOwner,
  createDashboardLiveUrl,
  createMarketDiscussionPost,
  fetchCaptchaChallenge,
  fetchClaimView,
  fetchDashboard,
  fetchMarketDiscussion,
  fetchOwnerSession,
  registerAgentIdentity,
  requestOwnerLoginLink,
  runDiscovery,
  setupAgentOwnerEmail,
  subscribeToDashboard,
  voteOnDiscussionPost,
} from './api'

describe('web api client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('parses successful API responses and sends the expected payloads', async () => {
    const snapshot = createDashboardSnapshot(
      createSeedStore(),
      new Date('2026-03-16T00:00:00.000Z'),
    )
    const fetchMock = vi.mocked(fetch)

    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify(snapshot), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            report: {
              query: 'musk deadlines',
              searchedAt: '2026-03-16T00:00:00.000Z',
              resultCount: 4,
              candidateCount: 2,
              createdMarketIds: ['market-1'],
              updatedMarketIds: ['market-2'],
              discardedResults: ['https://example.com/discarded'],
            },
            snapshot,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'captcha-1',
            prompt: 'Solve the slug.',
            hint: 'slug-hint',
            expiresAt: '2026-03-16T00:20:00.000Z',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            agent: {
              id: 'agent-1',
              handle: 'deadlinebot',
              displayName: 'Deadline Bot',
              ownerName: 'Owner',
              modelProvider: 'OpenAI',
              biography: 'Systematic counter-bettor that tracks deadlines.',
              ownerEmail: null,
              ownerVerifiedAt: null,
              createdAt: '2026-03-16T00:00:00.000Z',
              claimUrl: '/?claim=claim_1',
              challengeUrl: '/api/v1/auth/claims/claim_1',
              verificationPhrase: 'busted-oracle-42',
            },
            apiKey: 'lsk_live_1234567890',
            verifyInstructions: 'Verify me.',
            setupOwnerEmailEndpoint: '/api/v1/auth/agents/setup-owner-email',
            betEndpoint: '/api/v1/auth/agents/bets',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            agent: {
              id: 'agent-1',
              handle: 'deadlinebot',
              displayName: 'Deadline Bot',
              ownerName: 'Owner',
              modelProvider: 'OpenAI',
              biography: 'Systematic counter-bettor that tracks deadlines.',
              ownerEmail: 'owner@example.com',
              ownerVerifiedAt: '2026-03-16T00:00:00.000Z',
              createdAt: '2026-03-16T00:00:00.000Z',
              claimUrl: '/?claim=claim_1',
              challengeUrl: '/api/v1/auth/claims/claim_1',
            },
            ownerLoginHint: 'Open the owner deck.',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionToken: 'owner_1',
            ownerEmail: 'owner@example.com',
            loginUrl: '/?owner_session=owner_1',
            expiresAt: '2026-03-18T00:00:00.000Z',
            agentHandles: ['deadlinebot'],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionToken: 'owner_1',
            ownerEmail: 'owner@example.com',
            expiresAt: '2026-03-18T00:00:00.000Z',
            agents: [],
            bets: [],
            notifications: [],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            agent: {
              id: 'agent-1',
              handle: 'deadlinebot',
              displayName: 'Deadline Bot',
              ownerName: 'Owner',
              modelProvider: 'OpenAI',
              biography: 'Systematic counter-bettor that tracks deadlines.',
              ownerEmail: 'owner@example.com',
              ownerVerifiedAt: '2026-03-16T00:00:00.000Z',
              createdAt: '2026-03-16T00:00:00.000Z',
              claimUrl: '/?claim=claim_1',
              challengeUrl: '/api/v1/auth/claims/claim_1',
              verificationPhrase: 'busted-oracle-42',
            },
            claimInstructions: 'Confirm the phrase.',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionToken: 'owner_2',
            ownerEmail: 'owner@example.com',
            loginUrl: '/?owner_session=owner_2',
            expiresAt: '2026-03-18T00:00:00.000Z',
            agentHandles: ['deadlinebot'],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            marketId: 'cybercab-volume-2026',
            commentCount: 1,
            participantCount: 1,
            posts: [],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            marketId: 'cybercab-volume-2026',
            commentCount: 2,
            participantCount: 1,
            posts: [],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            marketId: 'cybercab-volume-2026',
            commentCount: 2,
            participantCount: 1,
            posts: [],
          }),
          { status: 200 },
        ),
      )

    expect(await fetchDashboard()).toEqual(snapshot)
    expect((await runDiscovery('musk deadlines')).report.query).toBe(
      'musk deadlines',
    )
    expect((await fetchCaptchaChallenge()).id).toBe('captcha-1')
    expect(
      (
        await registerAgentIdentity({
          handle: 'deadlinebot',
          displayName: 'Deadline Bot',
          ownerName: 'Owner',
          modelProvider: 'OpenAI',
          biography: 'Systematic counter-bettor that tracks deadlines.',
          captchaChallengeId: 'captcha-1',
          captchaAnswer: 'solved',
        })
      ).apiKey,
    ).toBe('lsk_live_1234567890')
    expect(
      (await setupAgentOwnerEmail('lsk_live_1234567890', 'owner@example.com'))
        .agent.ownerEmail,
    ).toBe('owner@example.com')
    expect((await requestOwnerLoginLink('owner@example.com')).sessionToken).toBe(
      'owner_1',
    )
    expect((await fetchOwnerSession('owner_1')).ownerEmail).toBe(
      'owner@example.com',
    )
    expect((await fetchClaimView('claim_1')).agent.handle).toBe('deadlinebot')
    expect(
      (await claimAgentForOwner('claim_1', 'owner@example.com')).sessionToken,
    ).toBe('owner_2')
    expect(
      (await fetchMarketDiscussion('cybercab-volume-2026')).commentCount,
    ).toBe(1)
    expect(
      (
        await createMarketDiscussionPost('cybercab-volume-2026', {
          body: 'A thread opener',
          apiKey: 'lsk_live_1234567890',
        })
      ).commentCount,
    ).toBe(2)
    expect(
      (
        await voteOnDiscussionPost('post-1', {
          value: 'up',
          apiKey: 'lsk_live_1234567890',
          captchaChallengeId: 'captcha-1',
          captchaAnswer: 'solved',
        })
      ).participantCount,
    ).toBe(1)

    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      '/api/v1/auth/agents/setup-owner-email',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          apiKey: 'lsk_live_1234567890',
          ownerEmail: 'owner@example.com',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      9,
      '/api/v1/auth/claims/claim_1/owner',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          ownerEmail: 'owner@example.com',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      10,
      '/api/v1/markets/cybercab-volume-2026/discussion',
      expect.anything(),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      11,
      '/api/v1/markets/cybercab-volume-2026/discussion/posts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          body: 'A thread opener',
          apiKey: 'lsk_live_1234567890',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      12,
      '/api/v1/discussion/posts/post-1/vote',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          value: 'up',
          apiKey: 'lsk_live_1234567890',
          captchaChallengeId: 'captcha-1',
          captchaAnswer: 'solved',
        }),
      }),
    )
  })

  it('throws server-provided messages and fallback request failures', async () => {
    const fetchMock = vi.mocked(fetch)

    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Request failed.' }), {
          status: 400,
        }),
      )
      .mockResolvedValueOnce(new Response('not json', { status: 500 }))

    await expect(fetchDashboard()).rejects.toThrow('Request failed.')
    await expect(fetchDashboard()).rejects.toThrow('Request failed')
  })

  it('uses absolute discussion URLs when an API base URL is configured', async () => {
    vi.resetModules()
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://lemonsuk.example'

    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          marketId: 'cybercab-volume-2026',
          commentCount: 0,
          participantCount: 0,
          posts: [],
        }),
        { status: 200 },
      ),
    )

    const { fetchMarketDiscussion: fetchDiscussionWithBaseUrl } = await import(
      './api'
    )

    expect(
      (await fetchDiscussionWithBaseUrl('cybercab-volume-2026')).marketId,
    ).toBe('cybercab-volume-2026')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://lemonsuk.example/api/v1/markets/cybercab-volume-2026/discussion',
      expect.anything(),
    )

    delete process.env.NEXT_PUBLIC_API_BASE_URL
    vi.resetModules()
  })

  it('builds websocket URLs from either the configured API base or the browser origin', async () => {
    expect(createDashboardLiveUrl('https://lemonsuk.com')).toBe(
      'wss://lemonsuk.com/api/v1/live',
    )
    expect(() => createDashboardLiveUrl()).toThrow(
      'Cannot resolve websocket URL without a browser origin.',
    )

    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:8787'
    vi.resetModules()
    const { createDashboardLiveUrl: createDashboardLiveUrlWithBase } = await import(
      './api'
    )
    expect(createDashboardLiveUrlWithBase('https://ignored.example')).toBe(
      'ws://localhost:8787/api/v1/live',
    )
  })

  it('subscribes to live dashboard snapshots and reconnects after socket closes', () => {
    const snapshots: string[] = []
    const statuses: string[] = []
    const sockets: MockWebSocket[] = []

    class MockWebSocket {
      static readonly OPEN = 1

      readonly listeners = new Map<string, Array<(event?: EventLike) => void>>()
      readonly url: string
      readyState = MockWebSocket.OPEN
      closed = false

      constructor(url: string) {
        this.url = url
        sockets.push(this)
      }

      addEventListener(type: string, listener: (event?: EventLike) => void) {
        const collection = this.listeners.get(type) ?? []
        collection.push(listener)
        this.listeners.set(type, collection)
      }

      close() {
        this.closed = true
        this.emit('close')
      }

      emit(type: string, event?: EventLike) {
        for (const listener of this.listeners.get(type) ?? []) {
          listener(event)
        }
      }
    }

    type EventLike = {
      data?: string
    }

    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)

    const unsubscribe = subscribeToDashboard(
      (snapshot) => {
        snapshots.push(snapshot.now)
      },
      (status) => {
        statuses.push(status)
      },
    )

    expect(sockets[0]?.url).toBe('ws://localhost:3000/api/v1/live')
    sockets[0]?.emit('open')
    sockets[0]?.emit('message', {
      data: JSON.stringify({
        type: 'snapshot',
        snapshot: createDashboardSnapshot(
          createSeedStore(),
          new Date('2026-03-17T00:00:00.000Z'),
        ),
      }),
    })
    sockets[0]?.emit('error')
    vi.advanceTimersByTime(2_500)
    sockets[1]?.emit('open')

    unsubscribe()

    expect(statuses).toEqual([
      'connecting',
      'open',
      'reconnecting',
      'connecting',
      'open',
      'closed',
    ])
    expect(snapshots).toEqual(['2026-03-17T00:00:00.000Z'])
    expect(sockets[1]?.closed).toBe(true)
  })

  it('clears pending reconnect timers when a live subscription is closed early', () => {
    const sockets: MockWebSocket[] = []

    class MockWebSocket {
      static readonly OPEN = 1

      readonly listeners = new Map<string, Array<(event?: { data?: string }) => void>>()
      readonly url: string
      readyState = MockWebSocket.OPEN

      constructor(url: string) {
        this.url = url
        sockets.push(this)
      }

      addEventListener(
        type: string,
        listener: (event?: { data?: string }) => void,
      ) {
        const collection = this.listeners.get(type) ?? []
        collection.push(listener)
        this.listeners.set(type, collection)
      }

      close() {
        this.emit('close')
      }

      emit(type: string, event?: { data?: string }) {
        for (const listener of this.listeners.get(type) ?? []) {
          listener(event)
        }
      }
    }

    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)

    const unsubscribe = subscribeToDashboard(() => undefined)
    sockets[0]?.emit('error')
    unsubscribe()
    vi.advanceTimersByTime(2_500)

    expect(sockets).toHaveLength(1)
  })
})
