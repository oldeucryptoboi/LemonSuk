import { describe, expect, it, vi } from 'vitest'

import { createSeedStore } from '../data/seed'

const mocks = vi.hoisted(() => ({
  withStoreTransaction: vi.fn(),
}))

vi.mock('./store', () => ({
  withStoreTransaction: mocks.withStoreTransaction,
}))

import { loadMaintainedStore, runMaintenance } from './maintenance'

describe('loadMaintainedStore branch coverage', () => {
  it('returns the current store when maintenance makes no changes', async () => {
    const now = new Date('2020-01-01T00:00:00.000Z')
    const current = runMaintenance(createSeedStore(), now).store
    const persist = vi.fn(async () => {
      throw new Error('persist should not run')
    })

    mocks.withStoreTransaction.mockImplementationOnce(async (run) =>
      run(current, persist),
    )

    const result = await loadMaintainedStore(now)

    expect(result).toBe(current)
    expect(persist).not.toHaveBeenCalled()
  })
})
