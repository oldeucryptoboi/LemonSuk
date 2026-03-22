import { beforeEach, describe, expect, it, vi } from 'vitest'

const serverApiMocks = vi.hoisted(() => ({
  fetchBoardGroupsServer: vi.fn(),
  fetchDashboardServer: vi.fn(),
}))

vi.mock('../src/lib/server-api', () => serverApiMocks)

describe('sitemap', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('builds sitemap entries from static, group, and market routes', async () => {
    serverApiMocks.fetchBoardGroupsServer.mockResolvedValue([
      {
        group: {
          id: 'group-1',
          slug: 'apple-launch-calendar',
          title: 'Apple launch calendar',
          description: 'Apple launch board',
          updatedAt: '2026-03-21T00:00:00.000Z',
        },
      },
      {
        group: {
          id: 'group-2',
          slug: 'meta-watch',
          title: 'Meta watch',
          description: 'Meta board',
          updatedAt: null,
        },
      },
    ])
    serverApiMocks.fetchDashboardServer.mockResolvedValue({
      hallOfFame: [
        {
          agent: {
            handle: 'deadline_bot',
          },
        },
      ],
      competitionStandings: [
        {
          agent: {
            handle: 'yabby',
          },
        },
        {
          agent: {
            handle: 'deadline_bot',
          },
        },
      ],
      markets: [
        {
          id: 'market-1',
          slug: 'apple-smart-glasses-2026',
          status: 'open',
          updatedAt: '2026-03-21T00:00:00.000Z',
        },
        {
          id: 'market-2',
          slug: 'robotaxi-million-2020',
          status: 'busted',
          updatedAt: '2026-03-20T00:00:00.000Z',
        },
        {
          id: 'market-3',
          slug: 'nvidia-blackwell-q4',
          status: 'open',
          updatedAt: null,
        },
      ],
    })

    const { default: sitemap } = await import('./sitemap')
    const result = await sitemap()

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: 'https://lemonsuk.com/',
          priority: 1,
        }),
        expect.objectContaining({
          url: 'https://lemonsuk.com/groups',
          priority: 0.9,
        }),
        expect.objectContaining({
          url: 'https://lemonsuk.com/terms',
          priority: 0.3,
        }),
        expect.objectContaining({
          url: 'https://lemonsuk.com/privacy',
          priority: 0.3,
        }),
        expect.objectContaining({
          url: 'https://lemonsuk.com/groups/apple-launch-calendar',
          priority: 0.8,
        }),
        expect.objectContaining({
          url: 'https://lemonsuk.com/groups/meta-watch',
          lastModified: undefined,
        }),
        expect.objectContaining({
          url: 'https://lemonsuk.com/markets/apple-smart-glasses-2026',
          changeFrequency: 'daily',
          priority: 0.8,
        }),
        expect.objectContaining({
          url: 'https://lemonsuk.com/markets/robotaxi-million-2020',
          changeFrequency: 'weekly',
          priority: 0.6,
        }),
        expect.objectContaining({
          url: 'https://lemonsuk.com/markets/nvidia-blackwell-q4',
          lastModified: undefined,
        }),
        expect.objectContaining({
          url: 'https://lemonsuk.com/u/yabby',
          priority: 0.5,
        }),
        expect.objectContaining({
          url: 'https://lemonsuk.com/u/deadline_bot',
          priority: 0.5,
        }),
      ]),
    )

    expect(
      result.filter((entry) => entry.url === 'https://lemonsuk.com/u/deadline_bot'),
    ).toHaveLength(1)
  })
})
