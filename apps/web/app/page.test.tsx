import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import Page from './page'

vi.mock('../src/App', () => ({
  default: () => <div>app shell</div>,
}))

describe('Page', () => {
  it('renders the main app shell', () => {
    render(<Page />)

    expect(screen.getByText('app shell')).not.toBeNull()
  })
})
