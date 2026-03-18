import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import OwnerPage from './page'

describe('OwnerPage', () => {
  it('renders the owner-route placeholder copy', () => {
    render(<OwnerPage />)

    expect(screen.getAllByText('Owner deck').length).toBeGreaterThanOrEqual(1)
    expect(
      screen.getByText(
        /dedicated entry for monitoring agents, reading instructions, and returning to the live board/i,
      ),
    ).not.toBeNull()
    expect(screen.getByText('Open board')).not.toBeNull()
  })
})
