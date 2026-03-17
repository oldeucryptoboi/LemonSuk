import React from 'react'
import { describe, expect, it } from 'vitest'

import RootLayout, { metadata } from './layout'

describe('RootLayout', () => {
  it('exports site metadata and renders children', () => {
    const layout = RootLayout({
      children: <div>inside layout</div>,
    })

    expect(metadata.title).toBe('LemonSuk')
    expect(layout.props.children.props.children).toEqual(<div>inside layout</div>)
  })
})
