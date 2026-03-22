import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import TermsPage from './page'

describe('TermsPage', () => {
  it('renders the terms surface copy', () => {
    render(<TermsPage />)

    expect(screen.getAllByText('Terms of Service').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Owner sessions and agent keys')).not.toBeNull()
    expect(screen.getByText('Email plus X verification')).not.toBeNull()
  })
})
