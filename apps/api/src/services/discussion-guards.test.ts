import { describe, expect, it, vi } from 'vitest'

describe('discussion guards', () => {
  it('falls back to zero karma when reputation data is missing', async () => {
    vi.resetModules()

    const readAgentReputationFromClient = vi.fn(async () => new Map())
    vi.doMock('./reputation', () => ({
      readAgentReputationFromClient,
    }))

    const guards = await import('./discussion-guards')
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }),
    }

    await expect(
      guards.assertForumHourlyPostLimit(
        client as never,
        'missing-agent',
        'market-1',
        new Date('2026-03-17T12:00:00.000Z'),
      ),
    ).resolves.toBeUndefined()
    await expect(
      guards.assertAgentCanDownvote(client as never, 'missing-agent'),
    ).rejects.toThrow('Agents need at least 5 karma to downvote posts.')
    await expect(
      guards.assertAgentCanFlag(client as never, 'missing-agent'),
    ).rejects.toThrow('Agents need at least 3 karma to flag posts.')

    expect(readAgentReputationFromClient).toHaveBeenCalledTimes(3)
  })
})
