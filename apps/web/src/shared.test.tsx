import { describe, expect, it } from 'vitest'

import * as packageShared from '../../../packages/shared/src/index'
import * as webShared from './shared'

describe('web shared exports', () => {
  it('re-exports the shared package entrypoint for the frontend', () => {
    expect(webShared.claimViewSchema).toBe(packageShared.claimViewSchema)
    expect(webShared.ownerSessionSchema).toBe(packageShared.ownerSessionSchema)
  })
})
