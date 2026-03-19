import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSeedStore } from '../data/seed'

const mocks = vi.hoisted(() => ({
  runMaintenance: vi.fn(),
}))

vi.mock('./maintenance', () => ({
  runMaintenance: mocks.runMaintenance,
}))

import { placeAgainstBetForUser } from './betting'

describe('placeAgainstBetForUser branch coverage', () => {
  beforeEach(() => {
    mocks.runMaintenance.mockReset()
  })

  it('uses explicit market caps instead of falling back to family defaults', () => {
    const baseStore = createSeedStore()
    const maintainedStore = {
      ...baseStore,
      bets: [
        {
          id: 'bet-existing-exposure',
          userId: 'agent-1',
          marketId: 'openai-device-2026',
          stakeCredits: 7,
          side: 'against' as const,
          status: 'open' as const,
          payoutMultiplierAtPlacement: 1.5,
          globalBonusPercentAtPlacement: 12,
          projectedPayoutCredits: 11,
          settledPayoutCredits: null,
          placedAt: '2026-03-15T22:00:00.000Z',
          settledAt: null,
        },
      ],
      markets: baseStore.markets.map((market) =>
        market.id === 'openai-device-2026'
          ? {
              ...market,
              payoutMultiplier: 1.5,
              maxStakeCredits: 5,
              maxLiabilityCredits: 12,
              perAgentExposureCapCredits: 7,
              betWindowOpen: true,
              bettingSuspended: false,
              suspensionReason: null,
            }
          : market,
      ),
    }
    mocks.runMaintenance.mockReturnValue({
      store: maintainedStore,
      changed: false,
    })

    expect(() =>
      placeAgainstBetForUser(
        baseStore,
        'agent-1',
        'openai-device-2026',
        6,
        new Date('2026-03-16T00:00:00.000Z'),
      ),
    ).toThrow('Stake exceeds the current market max of 5 credits.')

    expect(() =>
      placeAgainstBetForUser(
        baseStore,
        'agent-1',
        'openai-device-2026',
        1,
        new Date('2026-03-16T00:00:00.000Z'),
      ),
    ).toThrow('Agent exposure exceeds the current market cap of 7 credits.')

    expect(() =>
      placeAgainstBetForUser(
        baseStore,
        'agent-2',
        'openai-device-2026',
        2,
        new Date('2026-03-16T00:00:00.000Z'),
      ),
    ).toThrow('This market is at its liability cap of 12 credits.')
  })

  it('falls back to the generic suspension message when no explicit reason is present', () => {
    const baseStore = createSeedStore()
    mocks.runMaintenance.mockReturnValue({
      store: {
        ...baseStore,
        markets: baseStore.markets.map((market) =>
          market.id === 'openai-device-2026'
            ? {
                ...market,
                betWindowOpen: true,
                bettingSuspended: true,
                suspensionReason: null,
              }
            : market,
        ),
      },
      changed: false,
    })

    expect(() =>
      placeAgainstBetForUser(
        baseStore,
        'agent-1',
        'openai-device-2026',
        1,
        new Date('2026-03-16T00:00:00.000Z'),
      ),
    ).toThrow('This market is suspended for new tickets.')
  })
})
