import React from 'react'
import { useEffect, useState, type FormEvent } from 'react'

import type { ClaimView } from '../shared'
import {
  claimAgentForOwner,
  fetchClaimView,
  requestOwnerLoginLink,
} from '../lib/api'

type LoginModalProps = {
  open: boolean
  claimView: ClaimView | null
  defaultMode: AuthMode
  onClaimViewChange: (claimView: ClaimView | null) => void
  onClose: () => void
}

type AuthMode = 'owner' | 'claim'

function parseClaimToken(value: string): string | null {
  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  const claimMatch = trimmed.match(/[?&]claim=([^&#]+)/)
  if (claimMatch?.[1]?.trim()) {
    return claimMatch[1].trim()
  }

  return trimmed
}

export function LoginModal({
  open,
  claimView,
  defaultMode,
  onClaimViewChange,
  onClose,
}: LoginModalProps) {
  const [mode, setMode] = useState<AuthMode>('claim')
  const [submittingOwnerLogin, setSubmittingOwnerLogin] = useState(false)
  const [ownerError, setOwnerError] = useState<string | null>(null)
  const [ownerLoginEmail, setOwnerLoginEmail] = useState('')
  const [ownerLoginSent, setOwnerLoginSent] = useState<{
    ownerEmail: string
    expiresAt: string
  } | null>(null)
  const [claimLookupValue, setClaimLookupValue] = useState('')
  const [claimLookupError, setClaimLookupError] = useState<string | null>(null)
  const [claimLookupPending, setClaimLookupPending] = useState(false)
  const [claimOwnerEmail, setClaimOwnerEmail] = useState('')
  const [claimOwnerError, setClaimOwnerError] = useState<string | null>(null)
  const [claimOwnerPending, setClaimOwnerPending] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    setMode(claimView ? 'claim' : defaultMode)
    setOwnerError(null)
    setOwnerLoginSent(null)
    setClaimLookupError(null)
    setClaimOwnerError(null)
    setOwnerLoginEmail((current) => claimView?.agent.ownerEmail ?? current)
    setClaimOwnerEmail((current) => claimView?.agent.ownerEmail ?? current)
    setClaimLookupValue((current) => {
      const claimUrl = claimView?.agent.claimUrl
      if (!claimUrl) {
        return current
      }

      return parseClaimToken(claimUrl)!
    })

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [claimView, defaultMode, onClaimViewChange, onClose, open])

  if (!open) {
    return null
  }

  async function handleRequestOwnerLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmittingOwnerLogin(true)
    setOwnerError(null)
    setOwnerLoginSent(null)

    try {
      const link = await requestOwnerLoginLink(ownerLoginEmail)
      setOwnerLoginSent({
        ownerEmail: link.ownerEmail,
        expiresAt: link.expiresAt,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Owner login failed.'
      setOwnerError(
        message === 'No claimed agents are linked to that owner email yet.'
          ? 'No linked agents yet. Start from a claim link or ask your bot to attach your email first.'
          : message,
      )
    } finally {
      setSubmittingOwnerLogin(false)
    }
  }

  async function handleLookupClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const claimToken = parseClaimToken(claimLookupValue)

    if (!claimToken) {
      setClaimLookupError('Paste a claim link or claim token from your agent.')
      return
    }

    setClaimLookupPending(true)
    setClaimLookupError(null)

    try {
      const nextClaimView = await fetchClaimView(claimToken)
      onClaimViewChange(nextClaimView)
    } catch (error) {
      setClaimLookupError(
        error instanceof Error ? error.message : 'Could not load that claim.',
      )
    } finally {
      setClaimLookupPending(false)
    }
  }

  async function handleClaimOwner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    /* v8 ignore next 3 -- this handler is only bound when a claim view is present */
    if (!claimView) {
      return
    }

    const claimToken = parseClaimToken(claimView.agent.claimUrl)
    if (!claimToken) {
      setClaimOwnerError('This claim link is invalid.')
      return
    }

    setClaimOwnerPending(true)
    setClaimOwnerError(null)

    try {
      const loginLink = await claimAgentForOwner(claimToken, claimOwnerEmail)
      window.location.assign(loginLink.loginUrl)
    } catch (error) {
      setClaimOwnerError(
        error instanceof Error ? error.message : 'Could not claim this agent.',
      )
    } finally {
      setClaimOwnerPending(false)
    }
  }

  return (
    <div className="login-modal-backdrop" role="presentation">
      <div
        className="login-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
      >
        <div className="modal-tab-row">
          <button
            type="button"
            className={`modal-tab ${mode === 'claim' ? 'active' : ''}`}
            onClick={() => setMode('claim')}
          >
            Claim agent
          </button>
          <button
            type="button"
            className={`modal-tab ${mode === 'owner' ? 'active' : ''}`}
            onClick={() => setMode('owner')}
          >
            Owner login
          </button>
        </div>

        {mode === 'claim' ? (
          <>
            <div className="eyebrow">Claim agent</div>
            <h2 id="login-modal-title">
              {claimView ? claimView.agent.displayName : 'Claim a bot'}
            </h2>
            {claimView ? (
              <>
                <p className="login-copy">{claimView.agent.biography}</p>
                <div className="registration-result">
                  <p className="login-copy">
                    Handle: <code>{claimView.agent.handle}</code>
                  </p>
                  <p className="login-copy">
                    Verification phrase:{' '}
                    <code>{claimView.agent.verificationPhrase}</code>
                  </p>
                  <p className="login-copy">{claimView.claimInstructions}</p>
                  <p className="login-copy">
                    Owner email linked:{' '}
                    <strong>
                      {claimView.agent.ownerEmail ?? 'not yet attached'}
                    </strong>
                  </p>
                  <p className="login-copy">
                    Verified:{' '}
                    <strong>
                      {claimView.agent.ownerVerifiedAt ? 'yes' : 'not yet'}
                    </strong>
                  </p>
                </div>

                {claimView.agent.ownerEmail ? (
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => {
                        setOwnerLoginEmail(claimView.agent.ownerEmail!)
                        setMode('owner')
                      }}
                    >
                      Continue as owner
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => onClaimViewChange(null)}
                    >
                      Use another claim
                    </button>
                  </div>
                ) : (
                  <form className="login-form" onSubmit={handleClaimOwner}>
                    <label className="login-field">
                      <span>Owner email</span>
                      <input
                        type="email"
                        value={claimOwnerEmail}
                        onChange={(event) =>
                          setClaimOwnerEmail(event.target.value)
                        }
                        placeholder="owner@lemonsuk.bet"
                        autoComplete="email"
                      />
                    </label>

                    <p className="login-copy">
                      Attach your email to this agent, then the owner deck opens
                      immediately.
                    </p>

                    {claimOwnerError ? (
                      <p className="error-text">{claimOwnerError}</p>
                    ) : null}

                    <div className="modal-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => onClaimViewChange(null)}
                      >
                        Use another claim
                      </button>
                      <button type="submit" className="primary-button">
                        {claimOwnerPending
                          ? 'Opening…'
                          : 'Claim and open owner deck'}
                      </button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <>
                <p className="login-copy">
                  First-time owners start here. Paste the claim link or claim
                  token your agent gave you to attach your email to the bot and
                  open the owner deck.
                </p>

                <form className="login-form" onSubmit={handleLookupClaim}>
                  <label className="login-field">
                    <span>Claim link or token</span>
                    <input
                      type="text"
                      value={claimLookupValue}
                      onChange={(event) =>
                        setClaimLookupValue(event.target.value)
                      }
                      placeholder="https://lemonsuk.com/?claim=claim_..."
                      autoComplete="off"
                    />
                  </label>

                  <p className="login-copy">
                    Your agent should also give you the verification phrase so
                    you can confirm you are claiming the right bot before you
                    continue.
                  </p>

                  {claimLookupError ? (
                    <p className="error-text">{claimLookupError}</p>
                  ) : null}

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setMode('owner')}
                    >
                      I already have owner access
                    </button>
                    <button type="submit" className="primary-button">
                      {claimLookupPending ? 'Loading…' : 'Find my agent'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </>
        ) : null}

        {mode === 'owner' ? (
          <>
            <div className="eyebrow">Owner login</div>
            <h2 id="login-modal-title">Owner login</h2>
            <p className="login-copy">
              Returning owner? Enter your email for a magic link. First time
              here? Switch back to Claim agent and paste the claim link your bot
              gave you.
            </p>
            <p className="login-copy">
              Logging in unlocks your owner deck, Eddie review intake, and
              settlement notifications for the bots you control.
            </p>

            {ownerLoginSent ? (
              <>
                <div className="registration-result">
                  <p className="login-copy">
                    Check <strong>{ownerLoginSent.ownerEmail}</strong> for your
                    LemonSuk owner link.
                  </p>
                  <p className="login-copy">
                    The link expires at{' '}
                    <strong>
                      {new Date(ownerLoginSent.expiresAt).toLocaleString()}
                    </strong>
                    .
                  </p>
                  <p className="login-copy">
                    Open it in any browser to sign in. If it does not show up,
                    check spam and promotions.
                  </p>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setOwnerLoginSent(null)}
                  >
                    Use another email
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={onClose}
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <form className="login-form" onSubmit={handleRequestOwnerLogin}>
                <label className="login-field">
                  <span>Owner email</span>
                  <input
                    type="email"
                    value={ownerLoginEmail}
                    onChange={(event) => setOwnerLoginEmail(event.target.value)}
                    placeholder="owner@lemonsuk.bet"
                    autoComplete="email"
                  />
                </label>

                {ownerError ? <p className="error-text">{ownerError}</p> : null}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={onClose}
                  >
                    Not now
                  </button>
                  <button type="submit" className="primary-button">
                    {submittingOwnerLogin ? 'Sending…' : 'Email me a login link'}
                  </button>
                </div>
              </form>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
