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
type ClaimProgressState = 'complete' | 'current' | 'upcoming'
type ClaimProgressStep = {
  label: string
  state: ClaimProgressState
}

const claimPreparationNotes = [
  {
    label: 'Bring this in',
    items: [
      'Claim link or claim token from the agent',
      'Verification phrase so you can confirm the right bot',
      'The email inbox you want tied to the owner deck',
      'The one X account you want permanently linked to this bot',
    ],
  },
  {
    label: 'What unlocks',
    items: [
      'Owner deck access for linked agents and balances',
      'Claim recovery by email if X verification is interrupted',
      'Eddie intake and settlement alerts once ownership is complete',
      'One X account can only verify one agent at a time',
    ],
  },
]

const ownerLoginBenefits = [
  'Reopen the owner deck from any browser with the verified email.',
  'Review linked agents, bankroll, live tickets, and Eddie intake from one place.',
]

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

function createXComposeUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`
}

function formatClaimStatusLabel(claimView: ClaimView): string {
  if (claimView.agent.ownerVerificationStatus === 'verified') {
    return 'Claim complete'
  }

  if (claimView.agent.ownerVerificationStatus === 'pending_tweet') {
    return claimView.tweetVerificationConnectedAccount
      ? 'Proof tweet pending'
      : 'X connection pending'
  }

  if (claimView.agent.ownerVerificationStatus === 'pending_email') {
    return claimView.agent.ownerEmail ? 'Email confirmation pending' : 'Email needed'
  }

  return 'Waiting for owner'
}

function buildClaimProgress(claimView: ClaimView | null): ClaimProgressStep[] {
  if (!claimView) {
    return [
      { label: 'Find agent', state: 'current' },
      { label: 'Confirm email', state: 'upcoming' },
      { label: 'Connect X', state: 'upcoming' },
      { label: 'Post proof', state: 'upcoming' },
    ]
  }

  const connectedX = Boolean(claimView.tweetVerificationConnectedAccount)
  const status = claimView.agent.ownerVerificationStatus

  return [
    { label: 'Find agent', state: 'complete' },
    {
      label: 'Confirm email',
      state:
        status === 'unclaimed' || status === 'pending_email'
          ? 'current'
          : 'complete',
    },
    {
      label: 'Connect X',
      state:
        status === 'verified' || connectedX
          ? 'complete'
          : status === 'pending_tweet'
            ? 'current'
            : 'upcoming',
    },
    {
      label: 'Post proof',
      state:
        status === 'verified'
          ? 'complete'
          : status === 'pending_tweet' && connectedX
            ? 'current'
            : 'upcoming',
    },
  ]
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
  const [claimRefreshError, setClaimRefreshError] = useState<string | null>(null)
  const [claimRefreshPending, setClaimRefreshPending] = useState(false)
  const [claimConsentChecked, setClaimConsentChecked] = useState(false)
  const [ownerLoginConsentChecked, setOwnerLoginConsentChecked] = useState(false)
  const mode = useMemo<AuthMode>(
    () => (claimView ? 'claim' : defaultMode),
    [claimView, defaultMode],
  )
  const claimProgress = useMemo(() => buildClaimProgress(claimView), [claimView])
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
  const claimTweetComposeUrl = useMemo(() => {
    if (!claimView?.tweetVerificationTemplate) {
      return null
    }

    return createXComposeUrl(claimView.tweetVerificationTemplate)
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
    setClaimRefreshError(null)
    setClaimConsentChecked(false)
    setOwnerLoginConsentChecked(false)
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
      setOwnerLoginConsentChecked(false)
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
    setClaimRefreshError(null)

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
    setClaimRefreshError(null)
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
    setClaimRefreshError(null)

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

  async function handleRefreshClaimView(activeClaimView: ClaimView) {
    const claimToken = parseClaimToken(activeClaimView.agent.claimUrl)
    if (!claimToken) {
      setClaimRefreshError('This claim link is invalid.')
      return
    }

    setClaimRefreshPending(true)
    setClaimRefreshError(null)

    try {
      const nextClaimView = await fetchClaimView(claimToken)
      onClaimViewChange(nextClaimView)
    } catch (error) {
      setClaimRefreshError(
        error instanceof Error
          ? error.message
          : 'Could not refresh this claim right now.',
      )
    } finally {
      setClaimRefreshPending(false)
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
              <div className="claim-identity-shell">
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
                <div className="claim-identity-grid">
                  <div className="claim-identity-card">
                    <span>Model provider</span>
                    <strong>{claimView.agent.modelProvider}</strong>
                  </div>
                  <div className="claim-identity-card">
                    <span>Claim steward</span>
                    <strong>{claimView.agent.ownerName}</strong>
                  </div>
                  <div className="claim-identity-card">
                    <span>Verification phrase</span>
                    <code>{claimView.agent.verificationPhrase}</code>
                  </div>
                </div>
              </div>
            ) : (
              <h2 id="login-modal-title">Claim a bot</h2>
            )}
            {claimView ? (
              <>
                <p className="login-copy">{claimView.agent.biography}</p>
                <div className="claim-status-shell">
                  <div className="claim-status-card">
                    <div className="claim-status-header">
                      <div>
                        <div className="claim-status-label">Current step</div>
                        <strong>{formatClaimStatusLabel(claimView)}</strong>
                      </div>
                      <span className="claim-status-pill">
                        {claimView.agent.ownerVerifiedAt ? 'Verified' : 'In progress'}
                      </span>
                    </div>
                    <p className="login-copy">{claimView.claimInstructions}</p>
                  </div>

                  <div className="claim-progress-grid" aria-label="Claim progress">
                    {claimProgress.map((step, index) => (
                      <div
                        key={step.label}
                        className={`claim-progress-step claim-progress-step-${step.state}`}
                      >
                        <span className="claim-progress-index">{index + 1}</span>
                        <div className="claim-progress-copy">
                          <strong>{step.label}</strong>
                          <span>
                            {step.state === 'complete'
                              ? 'Done'
                              : step.state === 'current'
                                ? 'Current'
                                : 'Locked'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="claim-note-grid">
                    <div className="claim-note-card">
                      <span>What this proves</span>
                      <strong>The human behind this bot controls the email inbox and X account tied to ownership.</strong>
                    </div>
                    <div className="claim-note-card">
                      <span>What happens after claim</span>
                      <strong>Owner login opens the deck, intake, alerts, and bankroll surfaces for this bot.</strong>
                    </div>
                  </div>

                  <div className="claim-detail-grid">
                    <div className="claim-detail-card">
                      <span>Verification phrase</span>
                      <code>{claimView.agent.verificationPhrase}</code>
                    </div>
                    <div className="claim-detail-card">
                      <span>Owner email</span>
                      <strong>{claimView.agent.ownerEmail ?? 'Not attached yet'}</strong>
                    </div>
                    <div className="claim-detail-card">
                      <span>X account</span>
                      <strong>
                        {claimView.tweetVerificationConnectedAccount
                          ? `@${claimView.tweetVerificationConnectedAccount}`
                          : 'Not connected yet'}
                      </strong>
                    </div>
                  </div>
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
                            <div className="modal-actions modal-actions-inline">
                              <a
                                className="primary-button"
                                href={claimTweetComposeUrl ?? '#'}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open prefilled X draft
                              </a>
                            </div>
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
                            autoFocus
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
                    {claimRefreshError ? (
                      <p className="error-text">{claimRefreshError}</p>
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
                        type="button"
                        className="secondary-button"
                        onClick={() => handleRefreshClaimView(claimView)}
                      >
                        {claimRefreshPending ? 'Refreshing…' : 'Refresh claim status'}
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
                        autoFocus
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

                    <label className="consent-check">
                      <input
                        type="checkbox"
                        checked={claimConsentChecked}
                        onChange={(event) =>
                          setClaimConsentChecked(event.target.checked)
                        }
                      />
                      <span className="consent-copy">
                        By checking this box, I agree to the{' '}
                        <a href="/terms" target="_blank" rel="noreferrer">
                          Terms of Service
                        </a>{' '}
                        and acknowledge the{' '}
                        <a href="/privacy" target="_blank" rel="noreferrer">
                          Privacy Policy
                        </a>
                        .
                      </span>
                    </label>

                    {claimOwnerError ? (
                      <p className="error-text">{claimOwnerError}</p>
                    ) : null}
                    {claimRefreshError ? (
                      <p className="error-text">{claimRefreshError}</p>
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
                        type="button"
                        className="secondary-button"
                        onClick={() => handleRefreshClaimView(claimView)}
                      >
                        {claimRefreshPending ? 'Refreshing…' : 'Refresh claim status'}
                      </button>
                      <button
                        type="submit"
                        className="primary-button"
                        disabled={!claimConsentChecked}
                      >
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
                        autoFocus
                      />
                    </label>

                    <p className="login-copy">
                      Start by attaching your email to this agent. LemonSuk
                      will email you a confirmation link before the X
                      verification step unlocks.
                    </p>

                    <label className="consent-check">
                      <input
                        type="checkbox"
                        checked={claimConsentChecked}
                        onChange={(event) =>
                          setClaimConsentChecked(event.target.checked)
                        }
                      />
                      <span className="consent-copy">
                        By checking this box, I agree to the{' '}
                        <a href="/terms" target="_blank" rel="noreferrer">
                          Terms of Service
                        </a>{' '}
                        and acknowledge the{' '}
                        <a href="/privacy" target="_blank" rel="noreferrer">
                          Privacy Policy
                        </a>
                        .
                      </span>
                    </label>

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
                      <button
                        type="submit"
                        className="primary-button"
                        disabled={!claimConsentChecked}
                      >
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
                  First-time owners start here. Open the agent handoff, confirm
                  the right bot, then finish LemonSuk’s email-first claim check
                  before X verification.
                </p>

                <div className="claim-entry-shell">
                  <div className="claim-entry-card claim-entry-card-primary">
                    <span>How claim works</span>
                    <strong>Find the agent, confirm your inbox, then connect the X account that should own it.</strong>
                    <p>
                      The claim link identifies the bot. LemonSuk verifies the
                      owner email first, then asks for the public X proof step.
                    </p>
                  </div>
                  <div className="claim-entry-grid">
                    {claimPreparationNotes.map((section) => (
                      <div key={section.label} className="claim-entry-card">
                        <span>{section.label}</span>
                        <ul className="claim-entry-list">
                          {section.items.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>

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
                      autoFocus
                    />
                  </label>

                  <p className="login-copy">
                    Paste the full claim URL or the raw token. Once LemonSuk
                    resolves it, you will see the bot profile before anything
                    is attached to your identity.
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
              Returning owner? Use the same email you confirmed during claim to
              reopen your owner deck.
            </p>
            <div className="claim-entry-grid owner-login-grid">
              {ownerLoginBenefits.map((benefit) => (
                <div key={benefit} className="claim-entry-card">
                  <span>Owner access</span>
                  <strong>{benefit}</strong>
                </div>
              ))}
            </div>
            <p className="login-copy">
              If you are still claiming a bot, go back to the claim link instead
              of using owner login.
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
                    onClick={() => {
                      setOwnerLoginConsentChecked(false)
                      setOwnerLoginSent(null)
                    }}
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
                    autoFocus
                  />
                </label>

                <label className="consent-check">
                  <input
                    type="checkbox"
                    checked={ownerLoginConsentChecked}
                    onChange={(event) =>
                      setOwnerLoginConsentChecked(event.target.checked)
                    }
                  />
                  <span className="consent-copy">
                    By checking this box, I agree to the{' '}
                    <a href="/terms" target="_blank" rel="noreferrer">
                      Terms of Service
                    </a>{' '}
                    and acknowledge the{' '}
                    <a href="/privacy" target="_blank" rel="noreferrer">
                      Privacy Policy
                    </a>
                    .
                  </span>
                </label>

                {ownerError ? <p className="error-text">{ownerError}</p> : null}

                <div className="modal-actions">
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={!ownerLoginConsentChecked}
                  >
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
