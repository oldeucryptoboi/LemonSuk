import { describe, expect, it, vi } from 'vitest'

import { createSeedStore } from '../data/seed'

describe('route helpers', () => {
  it('reads api keys from headers or payloads and builds operational snapshots', async () => {
    vi.resetModules()

    const deliverPendingNotificationEmails = vi.fn(async () => 1)
    const readHallOfFame = vi.fn(async () => ['hall-entry'])
    const readHallOfFameFromClient = vi.fn(async () => ['hall-entry-from-client'])
    const readAgentDirectoryStats = vi.fn(async () => ({
      registeredAgents: 4,
      humanVerifiedAgents: 3,
    }))
    const readAgentDirectoryStatsFromClient = vi.fn(async () => ({
      registeredAgents: 5,
      humanVerifiedAgents: 4,
    }))
    const readDiscussionStats = vi.fn(
      async () =>
        new Map([
          [
            'market-1',
            {
              discussionCount: 2,
              discussionParticipantCount: 1,
              forumLeader: {
                id: 'agent-1',
                handle: 'oracle',
                displayName: 'Oracle',
                karma: 7,
                authoredClaims: 1,
                discussionPosts: 2,
              },
            },
          ],
        ]),
    )
    const readDiscussionStatsFromClient = vi.fn(
      async () =>
        new Map([
          [
            'market-1',
            {
              discussionCount: 3,
              discussionParticipantCount: 2,
              forumLeader: {
                id: 'agent-2',
                handle: 'eddie',
                displayName: 'Eddie',
                karma: 9,
                authoredClaims: 1,
                discussionPosts: 4,
              },
            },
          ],
        ]),
    )
    const createDashboardSnapshot = vi.fn(() => ({
      stats: { totalMarkets: 0 },
    }))
    const sendOwnerLoginLinkEmail = vi.fn(async () => true)
    const publishDashboardSnapshot = vi.fn(() => true)
    const loadMaintainedStore = vi.fn(async () => store)

    vi.doMock('../services/email', () => ({
      deliverPendingNotificationEmails,
      sendOwnerLoginLinkEmail,
    }))
    vi.doMock('../services/identity', () => ({
      readHallOfFame,
      readHallOfFameFromClient,
      readAgentDirectoryStats,
      readAgentDirectoryStatsFromClient,
    }))
    vi.doMock('../services/discussion', () => ({
      readDiscussionStats,
      readDiscussionStatsFromClient,
    }))
    vi.doMock('../services/bonus', () => ({
      createDashboardSnapshot,
    }))
    vi.doMock('../services/live-updates', () => ({
      publishDashboardSnapshot,
    }))
    vi.doMock('../services/maintenance', () => ({
      loadMaintainedStore,
    }))

    const helpers = await import('./helpers')
    const seedStore = createSeedStore()
    const store = {
      ...seedStore,
      markets: [
        {
          ...seedStore.markets[0]!,
          id: 'market-1',
        },
      ],
      bets: [],
      notifications: [],
    }

    expect(helpers.readApiKey(' header-key ', undefined)).toBe('header-key')
    expect(helpers.readApiKey(undefined, 'body-key')).toBe('body-key')
    expect(helpers.readApiKey(undefined, undefined)).toBeNull()

    expect(
      await helpers.createOperationalSnapshot(
        store,
        new Date('2026-03-16T00:00:00.000Z'),
      ),
    ).toEqual({
      stats: { totalMarkets: 0 },
    })
    expect(deliverPendingNotificationEmails).toHaveBeenCalledTimes(1)
    expect(readHallOfFame).toHaveBeenCalledTimes(1)
    expect(readAgentDirectoryStats).toHaveBeenCalledTimes(1)
    expect(readDiscussionStats).toHaveBeenCalledTimes(1)
    expect(createDashboardSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        ...store,
        markets: [
          expect.objectContaining({
            id: 'market-1',
            discussionCount: 2,
            discussionParticipantCount: 1,
            forumLeader: expect.objectContaining({
              handle: 'oracle',
              karma: 7,
            }),
          }),
        ],
      }),
      new Date('2026-03-16T00:00:00.000Z'),
      ['hall-entry'],
      {
        registeredAgents: 4,
        humanVerifiedAgents: 3,
      },
    )
    expect(
      await helpers.createOperationalSnapshot(
        store,
        new Date('2026-03-16T00:01:00.000Z'),
        {} as never,
      ),
    ).toEqual({
      stats: { totalMarkets: 0 },
    })
    expect(readHallOfFameFromClient).toHaveBeenCalledTimes(1)
    expect(readAgentDirectoryStatsFromClient).toHaveBeenCalledTimes(1)
    expect(readDiscussionStatsFromClient).toHaveBeenCalledTimes(1)
    expect(deliverPendingNotificationEmails).toHaveBeenCalledTimes(1)
    expect(createDashboardSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ...store,
        markets: [
          expect.objectContaining({
            id: 'market-1',
            discussionCount: 3,
            discussionParticipantCount: 2,
            forumLeader: expect.objectContaining({
              handle: 'eddie',
              karma: 9,
            }),
          }),
        ],
      }),
      new Date('2026-03-16T00:01:00.000Z'),
      ['hall-entry-from-client'],
      {
        registeredAgents: 5,
        humanVerifiedAgents: 4,
      },
    )

    await helpers.dispatchOwnerLoginLink({
      loginUrl: '/?owner_session=1',
      ownerEmail: 'owner@example.com',
      expiresAt: '2026-03-18T00:00:00.000Z',
      agentHandles: ['deadlinebot'],
    })
    expect(
      helpers.publishOperationalSnapshot({
        stats: { totalMarkets: 0 },
      } as never),
    ).toBe(true)
    expect(
      await helpers.readOperationalSnapshot(
        new Date('2026-03-16T00:02:00.000Z'),
        { deliverEmails: false },
      ),
    ).toEqual({
      stats: { totalMarkets: 0 },
    })
    expect(
      await helpers.publishCurrentOperationalSnapshot(
        new Date('2026-03-16T00:03:00.000Z'),
      ),
    ).toEqual({
      stats: { totalMarkets: 0 },
    })
    expect(sendOwnerLoginLinkEmail).toHaveBeenCalledTimes(1)
    expect(loadMaintainedStore).toHaveBeenCalledTimes(2)
    expect(deliverPendingNotificationEmails).toHaveBeenCalledTimes(1)
    expect(publishDashboardSnapshot).toHaveBeenCalledTimes(2)
  })
})
