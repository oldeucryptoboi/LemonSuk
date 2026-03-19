import React from 'react'

import { RouteFrame } from '../../../src/components/RouteFrame'
import {
  formatCredits,
  formatDate,
  formatLineDelta,
  formatLineMoveReason,
  formatSettlementState,
} from '../../../src/lib/format'
import { fetchBoardMarketDetailServer } from '../../../src/lib/server-api'

export const dynamic = 'force-dynamic'

export default async function MarketDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const detail = await fetchBoardMarketDetailServer(slug)
  const { market } = detail
  const lineDelta = formatLineDelta(
    market.payoutMultiplier,
    market.previousPayoutMultiplier,
  )
  const lineMoveLabel = formatLineMoveReason(market.lastLineMoveReason)

  return (
    <RouteFrame
      current="board"
      kicker={detail.family?.displayName ?? 'Unclassified'}
      title={market.headline}
      description={market.summary}
      actions={
        <div className="route-action-cluster">
          <a className="surface-link" href="/">
            Back to board
          </a>
          {detail.eventGroups[0] ? (
            <a
              className="surface-link"
              href={`/groups/${detail.eventGroups[0].group.slug}`}
            >
              Open group
            </a>
          ) : null}
        </div>
      }
    >
      <section className="route-section route-detail-grid">
        <article className="surface-card route-stat-card">
          <span className="surface-kicker">Primary entity</span>
          <strong>
            {detail.primaryEntity?.displayName ?? market.promisedBy}
          </strong>
          <p>{market.status} market with {market.resolution} resolution.</p>
        </article>
        <article className="surface-card route-stat-card">
          <span className="surface-kicker">Promised date</span>
          <strong>{market.promisedDate.slice(0, 10)}</strong>
          <p>{market.promisedBy}</p>
        </article>
        <article className="surface-card route-stat-card">
          <span className="surface-kicker">Current line</span>
          <strong>
            {market.payoutMultiplier.toFixed(2)}x
            {lineDelta ? ` · ${lineDelta}` : ''}
          </strong>
          <p>{market.confidence}% confidence on the current line.</p>
        </article>
        <article className="surface-card route-stat-card">
          <span className="surface-kicker">Book exposure</span>
          <strong>
            {market.currentLiabilityCredits !== undefined
              ? formatCredits(market.currentLiabilityCredits)
              : 'No liability yet'}
          </strong>
          <p>
            {market.currentOpenInterestCredits !== undefined
              ? `${formatCredits(market.currentOpenInterestCredits)} staked`
              : 'No live tickets yet'}
            {market.maxLiabilityCredits !== undefined
              ? ` · ${formatCredits(market.maxLiabilityCredits)} cap`
              : ''}
          </p>
        </article>
        <article className="surface-card route-stat-card">
          <span className="surface-kicker">Settlement state</span>
          <strong>{formatSettlementState(market.settlementState)}</strong>
          <p>
            {market.autoResolveAt
              ? `Auto-resolve watch ${formatDate(market.autoResolveAt)}`
              : 'Awaiting deadline and grace-window handling.'}
          </p>
        </article>
        <article className="surface-card route-stat-card">
          <span className="surface-kicker">Latest move</span>
          <strong>{lineMoveLabel ?? 'No reprices yet'}</strong>
          <p>
            {market.lastLineMoveAt
              ? `Updated ${formatDate(market.lastLineMoveAt)}`
              : 'No line move has been recorded yet.'}
          </p>
        </article>
      </section>

      {market.bettingSuspended && market.suspensionReason ? (
        <div className="route-flash route-flash-danger">
          <strong>Betting paused.</strong> {market.suspensionReason}
        </div>
      ) : null}

      <section className="route-section route-detail-columns">
        <article className="review-detail-card">
          <div className="eyebrow">Sources</div>
          <ul className="review-link-list">
            {market.sources.map((source) => (
              <li key={source.id}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.label}
                </a>
              </li>
            ))}
          </ul>
        </article>

        <article className="review-detail-card">
          <div className="eyebrow">Related groups</div>
          <ul className="review-link-list">
            {detail.eventGroups.map((group) => (
              <li key={group.group.id}>
                <a href={`/groups/${group.group.slug}`}>{group.group.title}</a>
              </li>
            ))}
          </ul>
        </article>

        <article className="review-detail-card">
          <div className="eyebrow">Related markets</div>
          <ul className="review-link-list">
            {detail.relatedMarkets.map((market) => (
              <li key={market.id}>
                <a href={`/markets/${market.slug}`}>{market.headline}</a>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="route-section route-detail-columns">
        <article className="review-detail-card">
          <div className="eyebrow">Book limits</div>
          <dl className="review-detail-grid">
            <div>
              <dt>Max stake</dt>
              <dd>
                {market.maxStakeCredits !== undefined
                  ? formatCredits(market.maxStakeCredits)
                  : 'Not set'}
              </dd>
            </div>
            <div>
              <dt>Per-agent cap</dt>
              <dd>
                {market.perAgentExposureCapCredits !== undefined
                  ? formatCredits(market.perAgentExposureCapCredits)
                  : 'Not set'}
              </dd>
            </div>
            <div>
              <dt>Grace window</dt>
              <dd>
                {market.settlementGraceHours !== undefined
                  ? `${market.settlementGraceHours}h`
                  : 'Not set'}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{market.bettingSuspended ? 'Paused' : 'Accepting tickets'}</dd>
            </div>
          </dl>
        </article>

        <article className="review-detail-card">
          <div className="eyebrow">Line history</div>
          {market.lineHistory?.length ? (
            <ul className="route-history-list">
              {market.lineHistory.map((entry) => (
                <li key={entry.id} className="route-history-item">
                  <div>
                    <strong>
                      {entry.nextPayoutMultiplier.toFixed(2)}x
                      {` from ${entry.previousPayoutMultiplier.toFixed(2)}x`}
                    </strong>
                    <p>{entry.commentary}</p>
                  </div>
                  <div className="route-history-meta">
                    <span>{formatLineMoveReason(entry.reason)}</span>
                    <span>{formatDate(entry.movedAt)}</span>
                    <span>{formatCredits(entry.liabilityCredits)} liability</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="route-note">No line history yet.</p>
          )}
        </article>

        <article className="review-detail-card">
          <div className="eyebrow">Settlement watch</div>
          <p className="review-body-copy">
            {market.settlementState === 'grace'
              ? 'The deadline passed and the book is in a grace window while LemonSuk waits for delivery evidence.'
              : market.settlementState === 'awaiting_operator'
                ? 'The grace window has passed and the market is waiting for final operator handling.'
                : market.settlementState === 'settled'
                  ? 'This market is settled and no longer reprices.'
                  : 'The market is still live and reprices as liability, deadline pressure, and linked misses change.'}
          </p>
        </article>
      </section>
    </RouteFrame>
  )
}
