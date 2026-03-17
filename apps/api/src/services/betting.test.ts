import { describe, expect, it } from 'vitest'

import { createSeedStore } from '../data/seed'
import { placeAgainstBetForUser } from './betting'

describe('placeAgainstBetForUser', () => {
  it('writes a bet in credits for an open market', () => {
    const now = new Date('2026-03-16T00:00:00.000Z')
    const store = createSeedStore()

    const result = placeAgainstBetForUser(
      store,
      'agent-1',
      'cybercab-volume-2026',
      25,
      now,
    )

    expect(result.bet.userId).toBe('agent-1')
    expect(result.bet.stakeCredits).toBe(25)
    expect(result.bet.settledPayoutCredits).toBeNull()
    expect(result.bet.payoutMultiplierAtPlacement).toBeGreaterThan(1)
    expect(result.store.bets[0]?.id).toBe(result.bet.id)
  })

  it('rejects a closed market', () => {
    const now = new Date('2026-03-16T00:00:00.000Z')
    const store = createSeedStore()

    expect(() =>
      placeAgainstBetForUser(
        store,
        'agent-1',
        'robotaxi-million-2020',
        25,
        now,
      ),
    ).toThrow('This market is closed.')
  })
})
