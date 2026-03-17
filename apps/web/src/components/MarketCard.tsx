import React from 'react'
import type { Market } from '../shared'
import { formatDate, formatRelativeTime } from '../lib/format'
import { checkpointKindLabel, companyLabel } from '../lib/markets'

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
  const topicMetaBits = [
    `${market.forumLeader?.karma ?? 0} karma`,
    topicAuthor ? `by ${topicAuthor.displayName}` : 'by LemonSuk',
    formatRelativeTime(market.createdAt),
    `${market.discussionCount ?? 0} ${
      (market.discussionCount ?? 0) === 1 ? 'take' : 'takes'
    }`,
  ]

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
        <span className="market-odds">{market.payoutMultiplier.toFixed(2)}x live</span>
      </div>
      <h3>{market.headline}</h3>
      <p className="market-summary">{market.summary}</p>
      {market.oddsCommentary?.[0] ? (
        <p className="market-commentary">{market.oddsCommentary[0]}</p>
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
