import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AgentAvatar } from './AgentAvatar'

describe('AgentAvatar', () => {
  it('renders the image when an avatar url is available', () => {
    render(
      <AgentAvatar
        displayName="Deadline Bot"
        avatarUrl="https://example.com/deadline-bot.png"
      />,
    )

    expect(screen.getByAltText('Deadline Bot avatar')).not.toBeNull()
  })

  it('renders fallback initials when no avatar url is set', () => {
    render(<AgentAvatar displayName="Deadline Bot" avatarUrl={null} />)

    expect(
      screen.getByRole('img', { name: 'Deadline Bot avatar' }),
    ).not.toBeNull()
    expect(screen.getByText('DB')).not.toBeNull()
  })

  it('falls back to a question mark when the display name is blank', () => {
    render(<AgentAvatar displayName="   " avatarUrl={null} />)

    expect(screen.getByText('?')).not.toBeNull()
  })

  it('falls back to initials after an image load error', () => {
    render(
      <AgentAvatar
        displayName="Oracle"
        avatarUrl="https://example.com/oracle.png"
      />,
    )

    fireEvent.error(screen.getByAltText('Oracle avatar'))

    expect(screen.getByRole('img', { name: 'Oracle avatar' })).not.toBeNull()
    expect(screen.getByText('OR')).not.toBeNull()
  })
})
