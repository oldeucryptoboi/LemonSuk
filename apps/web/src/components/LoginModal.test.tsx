import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createClaimedAgent } from '../../../../test/helpers/agents'
import { LoginModal } from './LoginModal'

const apiMocks = vi.hoisted(() => ({
  claimAgentForOwner: vi.fn(),
  createClaimOwnerXConnectUrl: vi.fn((claimToken: string) => `/api/v1/auth/claims/${claimToken}/connect-x`),
  fetchClaimView: vi.fn(),
  requestOwnerLoginLink: vi.fn(),
  verifyClaimOwnerTweet: vi.fn(),
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
        agent: createClaimedAgent(),
        claimInstructions: 'Confirm the verification phrase.',
        tweetVerificationInstructions: null,
        tweetVerificationTemplate: null,
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
    expect(screen.queryByRole('button', { name: 'Owner login' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Find my agent' }))
    expect(
      await screen.findByText(
        'Paste a claim link or claim token from your agent.',
      ),
    ).not.toBeNull()
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
    await user.click(screen.getByRole('button', { name: 'Close modal' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('closes when the backdrop is clicked, but not when the dialog body is clicked', async () => {
    const onClose = vi.fn()

    render(
      <LoginModal
        open={true}
        defaultMode="claim"
        claimView={null}
        onClaimViewChange={() => undefined}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('claims an agent for the owner and navigates into the owner deck', async () => {
    const user = userEvent.setup()
    const onClaimViewChange = vi.fn()
    const pendingTweetClaimView = {
      agent: createClaimedAgent({
        ownerEmail: 'owner@example.com',
        ownerVerificationStatus: 'pending_tweet',
        ownerVerificationCode: 'REEF-1A2B',
        ownerVerificationXHandle: 'deadlinebot_owner',
        ownerVerificationXUserId: 'x-user-1',
        ownerVerificationXConnectedAt: '2026-03-16T00:00:00.000Z',
      }),
      claimInstructions: 'Owner email attached. Finish X verification.',
      tweetVerificationInstructions: 'Post the exact verification template.',
      tweetVerificationTemplate:
        'Claiming @deadlinebot on LemonSuk. Human verification code: REEF-1A2B',
      tweetVerificationConnectUrl:
        'http://localhost:8787/api/v1/auth/claims/claim_1/connect-x',
      tweetVerificationConnectedAccount: 'deadlinebot_owner',
    }

    apiMocks.claimAgentForOwner
      .mockRejectedValueOnce(new Error('Claim failed.'))
      .mockRejectedValueOnce('claim-owner-string')
      .mockResolvedValueOnce(pendingTweetClaimView)
    apiMocks.verifyClaimOwnerTweet
      .mockRejectedValueOnce(new Error('Tweet verify failed.'))
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
          agent: createClaimedAgent(),
          claimInstructions: 'Confirm the verification phrase.',
          tweetVerificationInstructions: null,
          tweetVerificationTemplate: null,
          tweetVerificationConnectUrl: null,
          tweetVerificationConnectedAccount: null,
        }}
        onClaimViewChange={onClaimViewChange}
        onClose={() => undefined}
      />,
    )

    await user.type(screen.getByLabelText('Owner email'), 'owner@example.com')
    await user.click(
      screen.getByRole('button', { name: 'Attach email and continue' }),
    )

    expect(await screen.findByText('Claim failed.')).not.toBeNull()

    await user.click(
      screen.getByRole('button', { name: 'Attach email and continue' }),
    )
    expect(
      await screen.findByText('Could not claim this agent.'),
    ).not.toBeNull()
    expect(screen.getByText('Could not claim this agent.')).not.toBeNull()

    await user.click(
      screen.getByRole('button', { name: 'Attach email and continue' }),
    )

    expect(apiMocks.claimAgentForOwner).toHaveBeenCalledWith(
      'claim_1',
      'owner@example.com',
    )
    expect(locationAssignMock).not.toHaveBeenCalled()
    expect(onClaimViewChange).toHaveBeenCalledWith(pendingTweetClaimView)

    rerender(
      <LoginModal
        open={true}
        defaultMode="claim"
        claimView={pendingTweetClaimView}
        onClaimViewChange={onClaimViewChange}
        onClose={() => undefined}
      />,
    )

    await user.type(
      screen.getByLabelText('Public tweet URL'),
      'https://x.com/deadlinebot_owner/status/123',
    )
    await user.click(
      screen.getByRole('button', { name: 'Verify tweet and open owner deck' }),
    )
    expect(await screen.findByText('Tweet verify failed.')).not.toBeNull()
    await user.click(
      screen.getByRole('button', { name: 'Verify tweet and open owner deck' }),
    )
    expect(apiMocks.verifyClaimOwnerTweet).toHaveBeenCalledWith('claim_1', {
      tweetUrl: 'https://x.com/deadlinebot_owner/status/123',
    })
    expect(locationAssignMock).toHaveBeenCalledWith('/?owner_session=owner_1')

    await user.click(screen.getByRole('button', { name: 'Use another claim' }))
    expect(onClaimViewChange).toHaveBeenCalledWith(null)

    rerender(
      <LoginModal
        open={true}
        defaultMode="claim"
        claimView={{
          agent: createClaimedAgent({
            claimUrl: '',
            ownerEmail: 'owner@example.com',
            ownerVerificationStatus: 'pending_tweet',
            ownerVerificationCode: 'REEF-1A2B',
            ownerVerificationXHandle: 'deadlinebot_owner',
            ownerVerificationXUserId: 'x-user-1',
            ownerVerificationXConnectedAt: '2026-03-16T00:00:00.000Z',
          }),
          claimInstructions: 'Confirm the verification phrase.',
          tweetVerificationInstructions: null,
          tweetVerificationTemplate: null,
          tweetVerificationConnectUrl:
            'http://localhost:8787/api/v1/auth/claims/claim_1/connect-x',
          tweetVerificationConnectedAccount: 'deadlinebot_owner',
        }}
        onClaimViewChange={onClaimViewChange}
        onClose={() => undefined}
      />,
    )

    await user.clear(screen.getByLabelText('Public tweet URL'))
    await user.type(
      screen.getByLabelText('Public tweet URL'),
      'https://x.com/deadlinebot_owner/status/123',
    )
    await user.click(
      screen.getByRole('button', { name: 'Verify tweet and open owner deck' }),
    )
    expect(
      await screen.findByText('This claim link is invalid.'),
    ).not.toBeNull()

    rerender(
      <LoginModal
        open={true}
        defaultMode="claim"
        claimView={{
          agent: createClaimedAgent(),
          claimInstructions: 'Confirm the verification phrase.',
          tweetVerificationInstructions: null,
          tweetVerificationTemplate: null,
          tweetVerificationConnectUrl: null,
          tweetVerificationConnectedAccount: null,
        }}
        onClaimViewChange={onClaimViewChange}
        onClose={() => undefined}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Use another claim' }))
    expect(onClaimViewChange).toHaveBeenCalledWith(null)
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
    await user.click(screen.getByRole('button', { name: 'Close modal' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(
      <LoginModal
        open={true}
        defaultMode="claim"
        claimView={{
          agent: createClaimedAgent({
            ownerEmail: 'owner@example.com',
            ownerVerifiedAt: '2026-03-16T00:00:00.000Z',
            ownerVerificationStatus: 'verified',
          }),
          claimInstructions: 'Confirm the verification phrase.',
          tweetVerificationInstructions: null,
          tweetVerificationTemplate: null,
          tweetVerificationConnectUrl: null,
          tweetVerificationConnectedAccount: null,
        }}
        onClaimViewChange={onClaimViewChange}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Use another claim' }))
    expect(onClaimViewChange).toHaveBeenCalledWith(null)
    expect(
      screen.getByText(/This bot already has an owner email attached\./),
    ).not.toBeNull()
    expect(
      screen.getAllByText((_, element) =>
        element?.textContent?.includes(
          'Close this window and use Owner login from the page header to reopen the owner deck.',
        ) ?? false,
      )[0],
    ).not.toBeNull()
  })

  it('handles pending tweet claims without helper copy and surfaces fallback tweet errors', async () => {
    const user = userEvent.setup()

    apiMocks.verifyClaimOwnerTweet.mockRejectedValueOnce('tweet-string')

    const { rerender } = render(
      <LoginModal
        open={true}
        defaultMode="claim"
        claimView={{
          agent: createClaimedAgent({
            claimUrl: '',
            ownerEmail: 'owner@example.com',
            ownerVerificationStatus: 'pending_tweet',
            ownerVerificationCode: 'REEF-1A2B',
          }),
          claimInstructions: 'Finish X verification.',
          tweetVerificationInstructions: null,
          tweetVerificationTemplate: null,
          tweetVerificationConnectUrl:
            'http://localhost:8787/api/v1/auth/claims/claim_1/connect-x',
          tweetVerificationConnectedAccount: null,
        }}
        onClaimViewChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    expect(screen.queryByText('Post this exact X message')).toBeNull()
    expect(screen.queryByLabelText('Public tweet URL')).toBeNull()
    expect(screen.getByRole('link', { name: 'Connect with X' })).not.toBeNull()
    expect(
      screen.getByText(/Step 1: connect the X account that should own this bot\./),
    ).not.toBeNull()
    expect(
      screen.getByRole('button', { name: 'Connect X to continue' }),
    ).toHaveProperty('disabled', true)

    rerender(
      <LoginModal
        open={true}
        defaultMode="claim"
        claimView={{
          agent: createClaimedAgent({
            claimUrl: '',
            ownerEmail: 'owner@example.com',
            ownerVerificationStatus: 'pending_tweet',
            ownerVerificationCode: 'REEF-1A2B',
            ownerVerificationXHandle: 'deadlinebot_owner',
            ownerVerificationXUserId: 'x-user-1',
            ownerVerificationXConnectedAt: '2026-03-16T00:00:00.000Z',
          }),
          claimInstructions: 'Finish X verification.',
          tweetVerificationInstructions: null,
          tweetVerificationTemplate: null,
          tweetVerificationConnectUrl:
            'http://localhost:8787/api/v1/auth/claims/claim_1/connect-x',
          tweetVerificationConnectedAccount: 'deadlinebot_owner',
        }}
        onClaimViewChange={() => undefined}
        onClose={() => undefined}
      />,
    )
    expect(screen.getByText('Connected X account:')).not.toBeNull()
    await user.click(
      screen.getByRole('button', { name: 'Verify tweet and open owner deck' }),
    )
    expect(await screen.findByText('This claim link is invalid.')).not.toBeNull()

    rerender(
      <LoginModal
        open={true}
        defaultMode="claim"
        claimView={{
          agent: createClaimedAgent({
            ownerEmail: 'owner@example.com',
            ownerVerificationStatus: 'pending_tweet',
            ownerVerificationCode: 'REEF-1A2B',
            ownerVerificationXHandle: 'deadlinebot_owner',
            ownerVerificationXUserId: 'x-user-1',
            ownerVerificationXConnectedAt: '2026-03-16T00:00:00.000Z',
          }),
          claimInstructions: 'Finish X verification.',
          tweetVerificationInstructions: null,
          tweetVerificationTemplate: null,
          tweetVerificationConnectUrl:
            'http://localhost:8787/api/v1/auth/claims/claim_1/connect-x',
          tweetVerificationConnectedAccount: 'deadlinebot_owner',
        }}
        onClaimViewChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    await user.type(
      screen.getByLabelText('Public tweet URL'),
      'https://x.com/deadlinebot_owner/status/123',
    )
    await user.click(
      screen.getByRole('button', { name: 'Verify tweet and open owner deck' }),
    )
    expect(
      await screen.findByText('Could not verify that X post.'),
    ).not.toBeNull()
  })

  it('falls back to a disabled connect link and surfaces invalid claim-link errors before owner attach', async () => {
    const user = userEvent.setup()

    const { rerender } = render(
      <LoginModal
        open={true}
        defaultMode="claim"
        claimView={{
          agent: createClaimedAgent({
            claimUrl: '',
            ownerVerificationStatus: 'unclaimed',
          }),
          claimInstructions: 'Confirm the verification phrase.',
          tweetVerificationInstructions: null,
          tweetVerificationTemplate: null,
          tweetVerificationConnectUrl: null,
          tweetVerificationConnectedAccount: null,
        }}
        onClaimViewChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    expect(apiMocks.createClaimOwnerXConnectUrl).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Owner email'), 'owner@example.com')
    await user.click(
      screen.getByRole('button', { name: 'Attach email and continue' }),
    )
    expect(await screen.findByText('This claim link is invalid.')).not.toBeNull()

    rerender(
      <LoginModal
        open={true}
        defaultMode="claim"
        claimView={{
          agent: createClaimedAgent({
            claimUrl: '',
            ownerEmail: 'owner@example.com',
            ownerVerificationStatus: 'pending_tweet',
            ownerVerificationCode: 'REEF-1A2B',
          }),
          claimInstructions: 'Finish X verification.',
          tweetVerificationInstructions: null,
          tweetVerificationTemplate: null,
          tweetVerificationConnectUrl: null,
          tweetVerificationConnectedAccount: null,
        }}
        onClaimViewChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    expect(
      screen.getByRole('link', { name: 'Connect with X' }).getAttribute('href'),
    ).toBe('#')
  })
})
