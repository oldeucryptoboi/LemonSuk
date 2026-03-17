import { describe, expect, it } from 'vitest'

import * as apiShared from './shared'
import * as packageShared from '../../../packages/shared/src/index'

describe('shared exports', () => {
  it('re-exports the shared schemas from both API and package entrypoints', () => {
    expect(apiShared.marketSchema).toBe(packageShared.marketSchema)
    expect(apiShared.dashboardSnapshotSchema).toBe(
      packageShared.dashboardSnapshotSchema,
    )
  })
})
