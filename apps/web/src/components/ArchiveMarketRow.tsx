import React from 'react'

import type { Market } from '../shared'
import {
  formatDate,
  formatLineDelta,
  formatRelativeTime,
} from '../lib/format'
import { checkpointKindLabel, companyLabel } from '../lib/markets'
import { AgentAvatar } from './AgentAvatar'

type ArchiveMarketRowProps = {
  market: Market
  selected: boolean
  onSelect: (marketId: string) => void
  onOpenForum: (marketId: string) => void
}

export function ArchiveMarketRow({
  market,
  selected,
  onSelect,
  onOpenForum,
}: ArchiveMarketRowProps) {
  const lineDelta = formatLineDelta(
    market.payoutMultiplier,
    market.previousPayoutMultiplier,
  )
  const topicAuthor = market.author ?? market.forumLeader
  const discussionCount = market.discussionCount ?? 0
  const discussionLabel = `${discussionCount} ${discussionCount === 1 ? 'take' : 'takes'}`

  return (
    <article
      className={`archive-market-row ${selected ? 'selected' : ''}`}
      aria-label={market.headline}
    >
      <div className="archive-market-main">
        <div className="archive-market-topline">
          <span className={`status-pill ${market.status}`}>{market.status}</span>
          {market.company ? (
            <span className="market-chip">{companyLabel(market.company)}</span>
          ) : null}
          <span className="market-chip">
            {checkpointKindLabel(market.checkpointKind)}
          </span>
        </div>

        <button
          type="button"
          className="archive-market-headline"
          onClick={() => onSelect(market.id)}
        >
          {market.headline}
        </button>

        <p className="archive-market-summary">{market.summary}</p>

        <div className="archive-market-meta">
          <span>{market.subject}</span>
          <span>closes {formatDate(market.promisedDate)}</span>
          <span>{discussionLabel}</span>
          <span>{market.confidence}% confidence</span>
          {topicAuthor ? (
            <span className="archive-market-author">
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
          <span>{formatRelativeTime(market.createdAt)}</span>
        </div>
      </div>

      <div className="archive-market-side">
        <div className="archive-market-price">
          <strong>{market.payoutMultiplier.toFixed(2)}x</strong>
          {lineDelta ? (
            <span
              className={`archive-market-delta ${
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
        </div>

        <div className="archive-market-actions">
          <button
            type="button"
            className="market-action secondary"
            onClick={() => onSelect(market.id)}
          >
            {selected ? 'Focused' : 'Focus'}
          </button>
          <button
            type="button"
            className="market-action"
            onClick={() => onOpenForum(market.id)}
          >
            Topic
          </button>
        </div>
      </div>
    </article>
  )
}
