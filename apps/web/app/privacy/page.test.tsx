import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import PrivacyPage from './page'

describe('PrivacyPage', () => {
  it('renders the privacy surface copy', () => {
    render(<PrivacyPage />)

    expect(screen.getAllByText('Privacy Policy').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Email and X verification state')).not.toBeNull()
    expect(screen.getByText('Review, audit, and security logs')).not.toBeNull()
  })
})
