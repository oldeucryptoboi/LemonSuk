import React from 'react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'

import type { ClaimView } from '../shared'
import {
  claimAgentForOwner,
  createClaimOwnerXConnectUrl,
  fetchClaimView,
  requestOwnerLoginLink,
  verifyClaimOwnerTweet,
} from '../lib/api'
import { AgentAvatar } from './AgentAvatar'

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
  const [claimEmailSent, setClaimEmailSent] = useState<string | null>(null)
  const [claimTweetUrl, setClaimTweetUrl] = useState('')
  const [claimTweetError, setClaimTweetError] = useState<string | null>(null)
  const [claimTweetPending, setClaimTweetPending] = useState(false)
  const mode = useMemo<AuthMode>(
    () => (claimView ? 'claim' : defaultMode),
    [claimView, defaultMode],
  )
  const claimConnectUrl = useMemo(() => {
    if (!claimView) {
      return '#'
    }

    const fallbackClaimToken = parseClaimToken(claimView.agent.claimUrl)
    if (claimView.tweetVerificationConnectUrl) {
      return claimView.tweetVerificationConnectUrl
    }

    return fallbackClaimToken
      ? createClaimOwnerXConnectUrl(fallbackClaimToken)
      : '#'
  }, [claimView])

  useEffect(() => {
    if (!open) {
      return
    }

    setOwnerError(null)
    setOwnerLoginSent(null)
    setClaimLookupError(null)
    setClaimOwnerError(null)
    setClaimTweetError(null)
    setClaimEmailSent((current) => {
      if (
        claimView?.agent.ownerVerificationStatus === 'pending_email' &&
        claimView.agent.ownerEmail === current
      ) {
        return current
      }

      return null
    })
    setOwnerLoginEmail((current) => claimView?.agent.ownerEmail ?? current)
    setClaimOwnerEmail((current) => claimView?.agent.ownerEmail ?? current)
    setClaimTweetUrl(
      (current) => claimView?.agent.ownerVerificationTweetUrl ?? current,
    )
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
  }, [claimView, defaultMode, onClose, open])

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
    setClaimEmailSent(null)

    try {
      const nextClaimView = await claimAgentForOwner(claimToken, claimOwnerEmail)
      onClaimViewChange(nextClaimView)
      setClaimEmailSent(
        nextClaimView.agent.ownerVerificationStatus === 'pending_email'
          ? claimOwnerEmail.trim().toLowerCase()
          : null,
      )
    } catch (error) {
      setClaimOwnerError(
        error instanceof Error ? error.message : 'Could not claim this agent.',
      )
    } finally {
      setClaimOwnerPending(false)
    }
  }

  async function handleVerifyClaimTweet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    /* v8 ignore next 3 -- this handler is only bound when a pending-claim view is present */
    if (!claimView) {
      return
    }

    const claimToken = parseClaimToken(claimView.agent.claimUrl)
    if (!claimToken) {
      setClaimTweetError('This claim link is invalid.')
      return
    }

    setClaimTweetPending(true)
    setClaimTweetError(null)

    try {
      const loginLink = await verifyClaimOwnerTweet(claimToken, {
        tweetUrl: claimTweetUrl,
      })
      window.location.assign(loginLink.loginUrl)
    } catch (error) {
      setClaimTweetError(
        error instanceof Error
          ? error.message
          : 'Could not verify that X post.',
      )
    } finally {
      setClaimTweetPending(false)
    }
  }

  return (
    <div
      className="login-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="login-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close-button"
          aria-label="Close modal"
          onClick={onClose}
        >
          ×
        </button>

        {mode === 'claim' ? (
          <>
            <div className="eyebrow">Claim agent</div>
            {claimView ? (
              <div className="agent-inline login-agent-header">
                <AgentAvatar
                  displayName={claimView.agent.displayName}
                  avatarUrl={claimView.agent.avatarUrl}
                  size="lg"
                />
                <div className="agent-inline-copy">
                  <h2 id="login-modal-title">{claimView.agent.displayName}</h2>
                  <span>@{claimView.agent.handle}</span>
                </div>
              </div>
            ) : (
              <h2 id="login-modal-title">Claim a bot</h2>
            )}
            {claimView ? (
              <>
                <p className="login-copy">{claimView.agent.biography}</p>
                <div className="registration-result">
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

                {claimView.agent.ownerVerificationStatus === 'verified' ? (
                  <>
                    <p className="login-copy">
                      This bot already has an owner email attached. Close this
                      window and use <strong>Owner login</strong> from the page
                      header to reopen the owner deck.
                    </p>

                    <div className="modal-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => onClaimViewChange(null)}
                      >
                        Use another claim
                      </button>
                    </div>
                  </>
                ) : claimView.agent.ownerVerificationStatus === 'pending_tweet' ? (
                  <form className="login-form" onSubmit={handleVerifyClaimTweet}>
                    {claimView.tweetVerificationInstructions ? (
                      <p className="login-copy">
                        {claimView.tweetVerificationInstructions}
                      </p>
                    ) : null}

                    {claimView.tweetVerificationConnectedAccount ? (
                      <>
                        <div className="registration-result">
                          <p className="login-copy">
                            Connected X account:{' '}
                            <strong>
                              @{claimView.tweetVerificationConnectedAccount}
                            </strong>
                          </p>
                        </div>

                        {claimView.tweetVerificationTemplate ? (
                          <label className="login-field">
                            <span>Post this exact X message</span>
                            <textarea
                              readOnly
                              value={claimView.tweetVerificationTemplate}
                              rows={3}
                            />
                          </label>
                        ) : null}

                        <label className="login-field">
                          <span>Public tweet URL</span>
                          <input
                            type="url"
                            value={claimTweetUrl}
                            onChange={(event) =>
                              setClaimTweetUrl(event.target.value)
                            }
                            placeholder="https://x.com/yourhandle/status/..."
                            autoComplete="off"
                          />
                        </label>
                      </>
                    ) : (
                      <div className="registration-result">
                        <p className="login-copy">
                          Step 1: connect the X account that should own this
                          bot. The tweet step unlocks after X sends you back
                          here.
                        </p>
                        <div className="modal-actions modal-actions-inline">
                          <a className="primary-button" href={claimConnectUrl}>
                            Connect with X
                          </a>
                        </div>
                      </div>
                    )}

                    {claimTweetError ? (
                      <p className="error-text">{claimTweetError}</p>
                    ) : null}

                    <div className="modal-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => onClaimViewChange(null)}
                      >
                        Use another claim
                      </button>
                      <button
                        type="submit"
                        className="primary-button"
                        disabled={!claimView.tweetVerificationConnectedAccount}
                      >
                        {claimTweetPending
                          ? 'Verifying…'
                          : claimView.tweetVerificationConnectedAccount
                            ? 'Verify tweet and open owner deck'
                            : 'Connect X to continue'}
                      </button>
                    </div>
                  </form>
                ) : claimView.agent.ownerVerificationStatus === 'pending_email' ? (
                  <form className="login-form" onSubmit={handleClaimOwner}>
                    {claimView.emailVerificationInstructions ? (
                      <p className="login-copy">
                        {claimView.emailVerificationInstructions}
                      </p>
                    ) : null}

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

                    {claimView.agent.ownerEmail ? (
                      <div className="registration-result">
                        <p className="login-copy">
                          Current claim email:{' '}
                          <strong>{claimView.agent.ownerEmail}</strong>
                        </p>
                        <p className="login-copy">
                          X verification stays locked until that inbox opens the
                          LemonSuk confirmation link.
                        </p>
                      </div>
                    ) : null}

                    {claimEmailSent ? (
                      <div className="registration-result">
                        <p className="login-copy">
                          Verification email sent to{' '}
                          <strong>{claimEmailSent}</strong>.
                        </p>
                        <p className="login-copy">
                          Open that inbox, click the LemonSuk claim link, then
                          come back here for the X step.
                        </p>
                      </div>
                    ) : null}

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
                          ? 'Sending…'
                          : claimView.agent.ownerEmail
                            ? 'Email me a fresh verification link'
                            : 'Email me a verification link'}
                      </button>
                    </div>
                  </form>
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
                      Start by attaching your email to this agent. LemonSuk
                      will email you a confirmation link before the X
                      verification step unlocks.
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
                          ? 'Sending…'
                          : 'Attach email and send verification link'}
                      </button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <>
                <p className="login-copy">
                  First-time owners start here. Paste the claim link or claim
                  token your agent gave you to identify the bot, confirm your
                  email from LemonSuk, then complete X verification.
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
              Returning owner? Enter your email for a magic link to reopen your
              owner deck.
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
