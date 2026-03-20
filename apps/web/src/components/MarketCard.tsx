import React from 'react'
import type { Market } from '../shared'
import {
  formatCredits,
  formatDate,
  formatLineDelta,
  formatLineMoveReason,
  formatRelativeTime,
  formatSettlementState,
} from '../lib/format'
import { checkpointKindLabel, companyLabel } from '../lib/markets'
import { AgentAvatar } from './AgentAvatar'

type MarketCardProps = {
  market: Market
  selected: boolean
  onSelect: (marketId: string) => void
  onOpenForum: (marketId: string) => void
}

export function MarketCard({
  market,
  selected,
  onSelect,
  onOpenForum,
}: MarketCardProps) {
  const topicAuthor = market.author ?? market.forumLeader
  const lineDelta = formatLineDelta(
    market.payoutMultiplier,
    market.previousPayoutMultiplier,
  )
  const lineMoveLabel = formatLineMoveReason(market.lastLineMoveReason)
  const topicMetaBits = [
    `${market.forumLeader?.karma ?? 0} karma`,
    formatRelativeTime(market.createdAt),
    `${market.discussionCount ?? 0} ${
      (market.discussionCount ?? 0) === 1 ? 'take' : 'takes'
    }`,
  ]
  const bookBits = [
    lineMoveLabel && market.lastLineMoveAt
      ? `${lineMoveLabel} ${formatRelativeTime(market.lastLineMoveAt)}`
      : null,
    market.currentOpenInterestCredits !== undefined
      ? `${formatCredits(market.currentOpenInterestCredits)} staked`
      : null,
    market.currentLiabilityCredits !== undefined
      ? `${formatCredits(market.currentLiabilityCredits)} liability`
      : null,
    market.maxLiabilityCredits !== undefined
      ? `${formatCredits(market.maxLiabilityCredits)} cap`
      : null,
    market.settlementState
      ? formatSettlementState(market.settlementState)
      : null,
  ].filter((entry): entry is string => Boolean(entry))

  return (
    <article
      className={`market-card ${market.status} ${selected ? 'selected' : ''}`}
    >
      <div className="market-topline">
        <div className="market-pill-row">
          <span className={`status-pill ${market.status}`}>{market.status}</span>
          {market.company ? (
            <span className="market-chip">{companyLabel(market.company)}</span>
          ) : null}
          <span className="market-chip">
            {checkpointKindLabel(market.checkpointKind)}
          </span>
        </div>
        <span className="market-odds">
          {market.payoutMultiplier.toFixed(2)}x live
          {lineDelta ? (
            <span
              className={`market-odds-delta ${
                lineDelta.startsWith('+')
                  ? 'up'
                  : lineDelta === 'flat'
                    ? 'flat'
                    : 'down'
              }`}
            >
              {lineDelta}
            </span>
          ) : null}
        </span>
      </div>
      <h3>{market.headline}</h3>
      <p className="market-summary">{market.summary}</p>
      {market.oddsCommentary?.[0] ? (
        <p className="market-commentary">{market.oddsCommentary[0]}</p>
      ) : null}
      {bookBits.length > 0 ? (
        <div className="market-book-strip">
          {bookBits.map((entry) => (
            <span key={`${market.id}-${entry}`} className="market-book-chip">
              {entry}
            </span>
          ))}
        </div>
      ) : null}
      {market.bettingSuspended && market.suspensionReason ? (
        <p className="market-risk-alert">{market.suspensionReason}</p>
      ) : null}
      {market.evidenceUpdates?.[0] ? (
        <p className="market-evidence-preview">
          <strong>Latest evidence:</strong> {market.evidenceUpdates[0].detail}
        </p>
      ) : null}
      <dl className="market-meta">
        <div>
          <dt>Subject</dt>
          <dd>{market.subject}</dd>
        </div>
        <div>
          <dt>Lane</dt>
          <dd>{market.seasonalLabel ?? 'Always on'}</dd>
        </div>
        <div>
          <dt>Deadline</dt>
          <dd>{formatDate(market.promisedDate)}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{market.confidence}%</dd>
        </div>
        <div>
          <dt>Forum</dt>
          <dd>
            {market.discussionCount ?? 0} takes /{' '}
            {market.discussionParticipantCount ?? 0} agents
          </dd>
        </div>
      </dl>
      {market.resolutionNotes ? (
        <p className="resolution-note">{market.resolutionNotes}</p>
      ) : null}
      <div className="market-sources">
        {market.sources.map((entry) => (
          <a key={entry.id} href={entry.url} target="_blank" rel="noreferrer">
            {entry.label}
          </a>
        ))}
      </div>
      <div className="market-card-actions">
        <button
          type="button"
          className="market-action"
          onClick={() => onOpenForum(market.id)}
        >
          Open topic
        </button>
        <div className="market-topic-meta">
          {topicAuthor ? (
            <span className="market-topic-author">
              <AgentAvatar
                displayName={topicAuthor.displayName}
                avatarUrl={topicAuthor.avatarUrl}
                size="sm"
              />
              <span>by {topicAuthor.displayName}</span>
            </span>
          ) : (
            <span>by LemonSuk</span>
          )}
          {topicMetaBits.map((entry, index) => (
            <React.Fragment key={`${market.id}-${entry}`}>
              {index > 0 ? <span className="market-topic-separator">|</span> : null}
              <span>{entry}</span>
            </React.Fragment>
          ))}
        </div>
        <button
          type="button"
          className="market-action secondary"
          onClick={() => onSelect(market.id)}
        >
          {selected ? 'Selected market' : 'Select market'}
        </button>
      </div>
    </article>
  )
}
