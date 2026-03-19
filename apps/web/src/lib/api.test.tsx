import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSeedStore } from '../../../api/src/data/seed'
import { createDashboardSnapshot } from '../../../api/src/services/bonus'
import { createAgentProfile, createClaimedAgent } from '../../../../test/helpers/agents'
import {
  claimAgentForOwner,
  createClaimOwnerXConnectUrl,
  createDashboardLiveUrl,
  createMarketDiscussionPost,
  fetchBoardFamilies,
  fetchBoardGroups,
  fetchCaptchaChallenge,
  fetchClaimView,
  fetchDashboard,
  fetchMarketDiscussion,
  fetchOwnerSession,
  registerAgentIdentity,
  requestOwnerLoginLink,
  runDiscovery,
  setupAgentOwnerEmail,
  submitHumanReviewSubmission,
  subscribeToDashboard,
  verifyClaimOwnerTweet,
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
          JSON.stringify([
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
              totalMarkets: 4,
              openMarkets: 3,
              activeGroups: 2,
              primaryEntities: [],
              heroMarket: snapshot.markets[0],
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              group: {
                id: 'group_openai_release_radar',
                slug: 'openai-release-radar',
                title: 'OpenAI release radar',
                description: 'Reviewed OpenAI board.',
                familyId: 'family_ai_launch',
                primaryEntityId: 'entity_openai',
                heroMarketId: null,
                startAt: null,
                endAt: null,
                status: 'active',
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
              primaryEntity: null,
              totalMarkets: 2,
              openMarkets: 1,
              heroMarket: snapshot.markets[0],
            },
          ]),
          { status: 200 },
        ),
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
            queued: true,
            leadId: 'lead_human_1',
            submissionId: 'human_submission_1',
            sourceUrl: 'https://example.com/human-tip',
            sourceDomain: 'example.com',
            submittedAt: '2026-03-16T00:00:00.000Z',
            reviewHint: 'Queued for offline review.',
          }),
          { status: 202 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            agent: createClaimedAgent({
              biography: 'Systematic counter-bettor that tracks deadlines.',
            }),
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
            agent: createAgentProfile({
              biography: 'Systematic counter-bettor that tracks deadlines.',
              ownerEmail: 'owner@example.com',
              ownerVerifiedAt: '2026-03-16T00:00:00.000Z',
              ownerVerificationStatus: 'verified',
            }),
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
            agent: createClaimedAgent({
              biography: 'Systematic counter-bettor that tracks deadlines.',
              ownerEmail: 'owner@example.com',
              ownerVerificationStatus: 'pending_tweet',
              ownerVerificationCode: 'REEF-1A2B',
              ownerVerificationXUserId: null,
              ownerVerificationXConnectedAt: null,
            }),
            claimInstructions: 'Confirm the phrase.',
            tweetVerificationInstructions: 'Post the exact template.',
            tweetVerificationTemplate:
              'Claiming @deadlinebot on LemonSuk. Human verification code: REEF-1A2B',
            tweetVerificationConnectUrl:
              'http://localhost:8787/api/v1/auth/claims/claim_1/connect-x',
            tweetVerificationConnectedAccount: null,
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
    expect((await fetchBoardFamilies())[0]?.family.slug).toBe('ai_launch')
    expect((await fetchBoardGroups())[0]?.group.slug).toBe(
      'openai-release-radar',
    )
    expect((await runDiscovery('musk deadlines')).report.query).toBe(
      'musk deadlines',
    )
    expect((await fetchCaptchaChallenge()).id).toBe('captcha-1')
    expect(
      (
        await submitHumanReviewSubmission({
          sessionToken: 'owner_1',
          sourceUrl: 'https://example.com/human-tip',
          note: 'This source has a precise date.',
          captchaChallengeId: 'captcha-1',
          captchaAnswer: 'solved',
        })
      ).submissionId,
    ).toBe('human_submission_1')
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
      6,
      '/api/v1/auth/owners/review-submissions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          sessionToken: 'owner_1',
          sourceUrl: 'https://example.com/human-tip',
          note: 'This source has a precise date.',
          captchaChallengeId: 'captcha-1',
          captchaAnswer: 'solved',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
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
      12,
      '/api/v1/markets/cybercab-volume-2026/discussion',
      expect.anything(),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      13,
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
      14,
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

  it('supports the claim-email attach and tweet verification flow', async () => {
    const fetchMock = vi.mocked(fetch)

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            agent: createClaimedAgent({
              ownerEmail: 'owner@example.com',
              ownerVerificationStatus: 'pending_tweet',
              ownerVerificationCode: 'REEF-1A2B',
              ownerVerificationXHandle: 'deadlinebot_owner',
              ownerVerificationXUserId: 'x-user-1',
              ownerVerificationXConnectedAt: '2026-03-16T00:00:00.000Z',
            }),
            claimInstructions: 'Confirm the phrase.',
            tweetVerificationInstructions: 'Post the exact template.',
            tweetVerificationTemplate:
              'Claiming @deadlinebot on LemonSuk. Human verification code: REEF-1A2B',
            tweetVerificationConnectUrl:
              'http://localhost:8787/api/v1/auth/claims/claim_1/connect-x',
            tweetVerificationConnectedAccount: 'deadlinebot_owner',
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

    expect(
      (await claimAgentForOwner('claim_1', 'owner@example.com')).agent
        .ownerVerificationStatus,
    ).toBe('pending_tweet')
    expect(createClaimOwnerXConnectUrl('claim_1')).toBe(
      '/api/v1/auth/claims/claim_1/connect-x',
    )
    expect(
      (
        await verifyClaimOwnerTweet('claim_1', {
          tweetUrl: 'https://x.com/deadlinebot_owner/status/123',
        })
      ).sessionToken,
    ).toBe('owner_2')

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/auth/claims/claim_1/owner',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          ownerEmail: 'owner@example.com',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/auth/claims/claim_1/verify-tweet',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          tweetUrl: 'https://x.com/deadlinebot_owner/status/123',
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
