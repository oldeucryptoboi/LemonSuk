import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LoginModal } from './LoginModal'

const apiMocks = vi.hoisted(() => ({
  claimAgentForOwner: vi.fn(),
  fetchClaimView: vi.fn(),
  requestOwnerLoginLink: vi.fn(),
}))
const originalLocation = window.location
const locationAssignMock = vi.fn()

vi.mock('../lib/api', () => apiMocks)

describe('LoginModal', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    locationAssignMock.mockReset()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        assign: locationAssignMock,
      },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
    vi.resetAllMocks()
    vi.restoreAllMocks()
  })

  it('returns null when closed, supports claim lookup, and closes on escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onClaimViewChange = vi.fn()
    const { rerender } = render(
      <LoginModal
        open={false}
        defaultMode="claim"
        claimView={null}
        onClaimViewChange={onClaimViewChange}
        onClose={onClose}
      />,
    )

    expect(screen.queryByRole('dialog')).toBeNull()

    apiMocks.fetchClaimView
      .mockRejectedValueOnce(new Error('Claim lookup failed.'))
      .mockRejectedValueOnce('claim-fetch-string')
      .mockResolvedValueOnce({
        agent: {
          id: 'agent-1',
          handle: 'deadlinebot',
          displayName: 'Deadline Bot',
          ownerName: 'Owner',
          modelProvider: 'OpenAI',
          biography: 'Tracks missed deadlines.',
          ownerEmail: null,
          ownerVerifiedAt: null,
          createdAt: '2026-03-16T00:00:00.000Z',
          claimUrl: '/?claim=claim_1',
          challengeUrl: '/api/v1/auth/claims/claim_1',
          verificationPhrase: 'busted-oracle-42',
        },
        claimInstructions: 'Confirm the verification phrase.',
      })

    rerender(
      <LoginModal
        open={true}
        defaultMode="claim"
        claimView={null}
        onClaimViewChange={onClaimViewChange}
        onClose={onClose}
      />,
    )

    expect(screen.getByText('Claim a bot')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Find my agent' }))
    expect(
      await screen.findByText(
        'Paste a claim link or claim token from your agent.',
      ),
    ).not.toBeNull()
    await user.click(
      screen.getByRole('button', { name: 'I already have owner access' }),
    )
    expect(screen.getByRole('heading', { name: 'Owner login' })).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Claim agent' }))
    await user.type(screen.getByLabelText('Claim link or token'), 'claim_1')
    await user.click(screen.getByRole('button', { name: 'Find my agent' }))
    expect(await screen.findByText('Claim lookup failed.')).not.toBeNull()
    await user.clear(screen.getByLabelText('Claim link or token'))
    await user.type(screen.getByLabelText('Claim link or token'), 'claim_1')
    await user.click(screen.getByRole('button', { name: 'Find my agent' }))
    expect(await screen.findByText('Could not load that claim.')).not.toBeNull()
    await user.clear(screen.getByLabelText('Claim link or token'))
    await user.type(
      screen.getByLabelText('Claim link or token'),
      'https://lemonsuk.com/?claim=claim_1',
    )
    await user.click(screen.getByRole('button', { name: 'Find my agent' }))

    expect(apiMocks.fetchClaimView).toHaveBeenCalledWith('claim_1')
    expect(onClaimViewChange).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: expect.objectContaining({
          handle: 'deadlinebot',
        }),
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Owner login' }))
    expect(screen.getByRole('heading', { name: 'Owner login' })).not.toBeNull()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('claims an agent for the owner and navigates into the owner deck', async () => {
    const user = userEvent.setup()
    const onClaimViewChange = vi.fn()

    apiMocks.claimAgentForOwner
      .mockRejectedValueOnce(new Error('Claim failed.'))
      .mockRejectedValueOnce('claim-owner-string')
      .mockResolvedValueOnce({
        sessionToken: 'owner_1',
        ownerEmail: 'owner@example.com',
        loginUrl: '/?owner_session=owner_1',
        expiresAt: '2026-03-18T00:00:00.000Z',
        agentHandles: ['deadlinebot'],
      })

    const { rerender } = render(
      <LoginModal
        open={true}
        defaultMode="claim"
        claimView={{
          agent: {
            id: 'agent-1',
            handle: 'deadlinebot',
            displayName: 'Deadline Bot',
            ownerName: 'Owner',
            modelProvider: 'OpenAI',
            biography: 'Tracks missed deadlines.',
            ownerEmail: null,
            ownerVerifiedAt: null,
            createdAt: '2026-03-16T00:00:00.000Z',
            claimUrl: '/?claim=claim_1',
            challengeUrl: '/api/v1/auth/claims/claim_1',
            verificationPhrase: 'busted-oracle-42',
          },
          claimInstructions: 'Confirm the verification phrase.',
        }}
        onClaimViewChange={onClaimViewChange}
        onClose={() => undefined}
      />,
    )

    await user.type(screen.getByLabelText('Owner email'), 'owner@example.com')
    await user.click(
      screen.getByRole('button', { name: 'Claim and open owner deck' }),
    )

    expect(await screen.findByText('Claim failed.')).not.toBeNull()

    await user.click(
      screen.getByRole('button', { name: 'Claim and open owner deck' }),
    )
    expect(
      await screen.findByText('Could not claim this agent.'),
    ).not.toBeNull()
    expect(screen.getByText('Could not claim this agent.')).not.toBeNull()

    await user.click(
      screen.getByRole('button', { name: 'Claim and open owner deck' }),
    )

    expect(apiMocks.claimAgentForOwner).toHaveBeenCalledWith(
      'claim_1',
      'owner@example.com',
    )
    expect(locationAssignMock).toHaveBeenCalledWith('/?owner_session=owner_1')

    await user.click(screen.getByRole('button', { name: 'Use another claim' }))
    expect(onClaimViewChange).toHaveBeenCalledWith(null)

    rerender(
      <LoginModal
        open={true}
        defaultMode="claim"
        claimView={{
          agent: {
            id: 'agent-1',
            handle: 'deadlinebot',
            displayName: 'Deadline Bot',
            ownerName: 'Owner',
            modelProvider: 'OpenAI',
            biography: 'Tracks missed deadlines.',
            ownerEmail: null,
            ownerVerifiedAt: null,
            createdAt: '2026-03-16T00:00:00.000Z',
            claimUrl: '',
            challengeUrl: '/api/v1/auth/claims/claim_1',
            verificationPhrase: 'busted-oracle-42',
          },
          claimInstructions: 'Confirm the verification phrase.',
        }}
        onClaimViewChange={onClaimViewChange}
        onClose={() => undefined}
      />,
    )

    await user.clear(screen.getByLabelText('Owner email'))
    await user.type(screen.getByLabelText('Owner email'), 'owner@example.com')
    await user.click(
      screen.getByRole('button', { name: 'Claim and open owner deck' }),
    )
    expect(
      await screen.findByText('This claim link is invalid.'),
    ).not.toBeNull()
  })

  it('supports owner deck login, linked claims, and fallback errors', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onClaimViewChange = vi.fn()

    apiMocks.requestOwnerLoginLink
      .mockResolvedValueOnce({
        sessionToken: 'owner_2',
        ownerEmail: 'owner@example.com',
        loginUrl: '/?owner_session=owner_2',
        expiresAt: '2026-03-18T00:00:00.000Z',
        agentHandles: ['deadlinebot'],
      })
      .mockRejectedValueOnce(
        new Error('No claimed agents are linked to that owner email yet.'),
      )
      .mockRejectedValueOnce('owner-login-string')

    const { rerender } = render(
      <LoginModal
        open={true}
        defaultMode="owner"
        claimView={null}
        onClaimViewChange={onClaimViewChange}
        onClose={onClose}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Owner login' })).not.toBeNull()
    await user.type(screen.getByLabelText('Owner email'), 'owner@example.com')
    await user.click(
      screen.getByRole('button', { name: 'Email me a login link' }),
    )

    expect(apiMocks.requestOwnerLoginLink).toHaveBeenCalledWith(
      'owner@example.com',
    )
    expect(locationAssignMock).not.toHaveBeenCalled()
    expect(
      await screen.findByText((_, element) =>
        element?.textContent ===
        'Check owner@example.com for your LemonSuk owner link.',
      ),
    ).not.toBeNull()
    expect(screen.getByText(/Open it in any browser to sign in./)).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Use another email' }))
    expect(screen.getByLabelText('Owner email')).not.toBeNull()

    await user.clear(screen.getByLabelText('Owner email'))
    await user.type(screen.getByLabelText('Owner email'), 'owner@example.com')
    await user.click(
      screen.getByRole('button', { name: 'Email me a login link' }),
    )
    expect(
      await screen.findByText(
        'No linked agents yet. Start from a claim link or ask your bot to attach your email first.',
      ),
    ).not.toBeNull()

    await user.clear(screen.getByLabelText('Owner email'))
    await user.type(screen.getByLabelText('Owner email'), 'owner@example.com')
    await user.click(
      screen.getByRole('button', { name: 'Email me a login link' }),
    )
    expect(await screen.findByText('Owner login failed.')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(
      <LoginModal
        open={true}
        defaultMode="claim"
        claimView={{
          agent: {
            id: 'agent-1',
            handle: 'deadlinebot',
            displayName: 'Deadline Bot',
            ownerName: 'Owner',
            modelProvider: 'OpenAI',
            biography: 'Tracks missed deadlines.',
            ownerEmail: 'owner@example.com',
            ownerVerifiedAt: '2026-03-16T00:00:00.000Z',
            createdAt: '2026-03-16T00:00:00.000Z',
            claimUrl: '/?claim=claim_1',
            challengeUrl: '/api/v1/auth/claims/claim_1',
            verificationPhrase: 'busted-oracle-42',
          },
          claimInstructions: 'Confirm the verification phrase.',
        }}
        onClaimViewChange={onClaimViewChange}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Use another claim' }))
    expect(onClaimViewChange).toHaveBeenCalledWith(null)
    await user.click(screen.getByRole('button', { name: 'Continue as owner' }))
    expect(screen.getByDisplayValue('owner@example.com')).not.toBeNull()
  })
})
