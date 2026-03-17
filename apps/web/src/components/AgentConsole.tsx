import React, { useCallback, useEffect, useState } from 'react'

import type { CaptchaChallenge, DiscoveryReport } from '../shared'
import {
  fetchCaptchaChallenge,
  submitHumanReviewSubmission,
} from '../lib/api'

type AgentConsoleProps = {
  query: string
  report: DiscoveryReport | null
  running: boolean
  ownerSessionToken: string | null
  ownerEmail: string | null
  onQueryChange: (query: string) => void
  onRun: () => void
  onOpenOwnerModal: () => void
}

export function AgentConsole({
  query,
  report,
  running,
  ownerSessionToken,
  ownerEmail,
  onQueryChange,
  onRun,
  onOpenOwnerModal,
}: AgentConsoleProps) {
  const [leadUrl, setLeadUrl] = useState('')
  const [leadNote, setLeadNote] = useState('')
  const [captchaChallenge, setCaptchaChallenge] =
    useState<CaptchaChallenge | null>(null)
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [submittingLead, setSubmittingLead] = useState(false)
  const [leadMessage, setLeadMessage] = useState<string | null>(null)
  const [leadError, setLeadError] = useState<string | null>(null)

  const refreshCaptcha = useCallback(
    async (options: { clearError?: boolean } = {}) => {
      try {
        if (options.clearError !== false) {
          setLeadError(null)
        }
        setCaptchaChallenge(await fetchCaptchaChallenge())
      } catch (error) {
        setCaptchaChallenge(null)
        setLeadError(
          error instanceof Error
            ? error.message
            : 'Could not load the captcha challenge.',
        )
      }
    },
    [],
  )

  useEffect(() => {
    if (!ownerSessionToken) {
      setCaptchaChallenge(null)
      setCaptchaAnswer('')
      setLeadError(null)
      return
    }

    void refreshCaptcha()
  }, [ownerSessionToken, refreshCaptcha])

  async function handleLeadSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!ownerSessionToken) {
      setLeadError('Open the owner deck before sending review leads.')
      return
    }

    if (!captchaChallenge) {
      setLeadError('Request a captcha challenge before submitting a review lead.')
      return
    }

    setSubmittingLead(true)
    setLeadMessage(null)
    setLeadError(null)

    try {
      const receipt = await submitHumanReviewSubmission({
        sessionToken: ownerSessionToken,
        sourceUrl: leadUrl,
        note: leadNote.trim() || undefined,
        captchaChallengeId: captchaChallenge.id,
        captchaAnswer,
      })

      setLeadMessage(
        `${receipt.sourceDomain} queued for offline review. Nothing hits the board automatically.`,
      )
      setLeadUrl('')
      setLeadNote('')
      setCaptchaAnswer('')
      await refreshCaptcha()
    } catch (error) {
      setLeadError(
        error instanceof Error
          ? error.message
          : 'Could not queue this review lead.',
      )
      setCaptchaAnswer('')
      await refreshCaptcha({
        clearError: false,
      })
    } finally {
      setSubmittingLead(false)
    }
  }

  return (
    <section className="agent-panel">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Backend agent</div>
          <h2>Eddie / Karnival review desk</h2>
        </div>
      </div>
      <p className="agent-copy">
        Searches web results across news, blogs, official pages, and X/Twitter
        links. Humans can forward a source URL here for offline review. Nothing
        goes straight onto the board.
      </p>
      <div className="agent-controls">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <button
          type="button"
          className="primary-button"
          onClick={onRun}
          disabled={running}
        >
          {running ? 'Scanning…' : 'Run discovery'}
        </button>
      </div>
      <div className="agent-terminal">
        {report ? (
          <>
            <div>{`query: ${report.query}`}</div>
            <div>{`results: ${report.resultCount}`}</div>
            <div>{`candidates: ${report.candidateCount}`}</div>
            <div>{`created: ${report.createdMarketIds.length}`}</div>
            <div>{`updated: ${report.updatedMarketIds.length}`}</div>
            <div>{`discarded: ${report.discardedResults.length}`}</div>
          </>
        ) : (
          <div>awaiting discovery run…</div>
        )}
      </div>
      <form className="review-lead-form" onSubmit={handleLeadSubmit}>
        <div className="panel-header compact">
          <div>
            <div className="eyebrow">Human intake</div>
            <h3>Submit a source URL</h3>
          </div>
        </div>
        {ownerSessionToken ? (
          <>
            <p className="empty-copy review-lead-copy">
              Submitting as <strong>{ownerEmail}</strong>. Captcha, duplicate
              source checks, and owner-level cooldowns are enforced before
              Eddie reviews anything offline.
            </p>
            <label className="review-lead-field">
              <span>Potential claim URL</span>
              <input
                type="url"
                value={leadUrl}
                onChange={(event) => setLeadUrl(event.target.value)}
                placeholder="https://x.com/elonmusk/status/..."
                required
              />
            </label>
            <label className="review-lead-field">
              <span>Why this matters (optional)</span>
              <textarea
                value={leadNote}
                onChange={(event) => setLeadNote(event.target.value)}
                placeholder="Point to the date language, quote, or missing existing card."
                rows={3}
              />
            </label>
            <div className="captcha-block">
              <strong>Captcha challenge</strong>
              {captchaChallenge ? (
                <>
                  <span>{captchaChallenge.prompt}</span>
                  <input
                    value={captchaAnswer}
                    onChange={(event) => setCaptchaAnswer(event.target.value)}
                    placeholder={captchaChallenge.hint}
                    required
                  />
                </>
              ) : (
                <span>Challenge unavailable. Refresh it before submitting.</span>
              )}
              <button
                type="button"
                className="market-action secondary"
                onClick={() => {
                  void refreshCaptcha()
                }}
                disabled={submittingLead}
              >
                Refresh challenge
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="empty-copy review-lead-copy">
              Open the owner deck first. Only verified human owners can forward
              source URLs into Eddie&apos;s offline review queue.
            </p>
            <div className="review-lead-actions">
              <button
                type="button"
                className="primary-button"
                onClick={onOpenOwnerModal}
              >
                Open owner deck
              </button>
            </div>
          </>
        )}
        {leadMessage ? <p className="success-text">{leadMessage}</p> : null}
        {leadError ? <p className="error-text">{leadError}</p> : null}
        {ownerSessionToken ? (
          <div className="review-lead-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={submittingLead || !captchaChallenge}
            >
              {submittingLead ? 'Queueing…' : 'Queue for offline review'}
            </button>
          </div>
        ) : null}
      </form>
    </section>
  )
}
