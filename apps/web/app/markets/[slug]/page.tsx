import React from 'react'
import type { Metadata } from 'next'

import { RouteFrame } from '../../../src/components/RouteFrame'
import type { MarketDetail } from '../../../src/shared'
import {
  formatCredits,
  formatDate,
  formatLineDelta,
  formatLineMoveReason,
  formatSettlementState,
} from '../../../src/lib/format'
import { fetchBoardMarketDetailServer } from '../../../src/lib/server-api'

export const dynamic = 'force-dynamic'

type SettlementTrailEntry = {
  id: string
  title: string
  detail: string
  at: string
}

function describeSettlementState(
  market: MarketDetail['market'],
): string {
  if (market.settlementState === 'grace') {
    return 'The deadline passed and the book is in a grace window while LemonSuk waits for delivery evidence.'
  }

  if (market.settlementState === 'awaiting_operator') {
    return 'The grace window has passed and the market is waiting for final operator handling.'
  }

  if (market.settlementState === 'settled') {
    return 'This market is settled and no longer reprices.'
  }

  return 'The market is still live and reprices as liability, deadline pressure, and linked misses change.'
}

function buildSettlementTrail(
  market: MarketDetail['market'],
): SettlementTrailEntry[] {
  const entries: SettlementTrailEntry[] = [
    {
      id: 'deadline',
      title: 'Deadline closes',
      detail: `${market.promisedBy} is on the record for ${formatDate(
        market.promisedDate,
      )}.`,
      at: market.promisedDate,
    },
    {
      id: 'state',
      title:
        market.settlementState === 'grace'
          ? 'Grace window live'
          : market.settlementState === 'awaiting_operator'
            ? 'Operator handoff'
            : market.settlementState === 'settled'
              ? 'Settled'
              : 'Still live',
      detail: describeSettlementState(market),
      at: market.updatedAt,
    },
  ]

  if (market.autoResolveAt) {
    entries.splice(1, 0, {
      id: 'auto_resolve',
      title: 'Auto-resolve watch',
      detail: `If evidence still has not settled the market by ${formatDate(
        market.autoResolveAt,
      )}, LemonSuk escalates it for final handling.`,
      at: market.autoResolveAt,
    })
  }

  if (market.resolutionNotes) {
    entries.unshift({
      id: 'resolution',
      title:
        market.resolution === 'missed'
          ? 'Deadline settlement'
          : 'Resolution update',
      detail: market.resolutionNotes,
      at: market.bustedAt ?? market.updatedAt,
    })
  }

  return entries
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const detail = await fetchBoardMarketDetailServer(slug)
  const { market } = detail
  const title = market.headline
  const description = market.summary

  return {
    title,
    description,
    alternates: {
      canonical: `/markets/${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `https://lemonsuk.com/markets/${slug}`,
    },
    twitter: {
      title,
      description,
    },
  }
}

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
  const evidenceUpdates = market.evidenceUpdates ?? []
  const oddsCommentary = market.oddsCommentary ?? []
  const settlementTrail = buildSettlementTrail(market)

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
          <div className="eyebrow">Evidence trail</div>
          {evidenceUpdates.length ? (
            <ul className="route-history-list">
              {evidenceUpdates.map((entry) => (
                <li key={entry.id} className="route-history-item">
                  <div>
                    <strong>{entry.title}</strong>
                    <p>{entry.detail}</p>
                  </div>
                  <div className="route-history-meta">
                    <span>{formatDate(entry.publishedAt)}</span>
                    {entry.url ? (
                      <a href={entry.url} target="_blank" rel="noreferrer">
                        Open source
                      </a>
                    ) : (
                      <span>LemonSuk note</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="route-note">No evidence trail yet.</p>
          )}
        </article>

        <article className="review-detail-card">
          <div className="eyebrow">Why the line sits here</div>
          <p className="review-body-copy">
            {lineMoveLabel
              ? `The book is ${market.payoutMultiplier.toFixed(
                  2,
                )}x right now after a ${lineMoveLabel.toLowerCase()} move.`
              : `The book is ${market.payoutMultiplier.toFixed(
                  2,
                )}x right now and has not repriced yet.`}
          </p>
          {oddsCommentary.length ? (
            <ul className="route-detail-bullet-list">
              {oddsCommentary.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          ) : null}
          <dl className="review-detail-grid route-compact-grid">
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
              <dt>Open interest</dt>
              <dd>
                {market.currentOpenInterestCredits !== undefined
                  ? formatCredits(market.currentOpenInterestCredits)
                  : 'No live tickets yet'}
              </dd>
            </div>
            <div>
              <dt>Book status</dt>
              <dd>{market.bettingSuspended ? 'Paused' : 'Accepting tickets'}</dd>
            </div>
          </dl>
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
          <div className="eyebrow">Settlement trail</div>
          <ul className="route-history-list">
            {settlementTrail.map((entry) => (
              <li key={entry.id} className="route-history-item">
                <div>
                  <strong>{entry.title}</strong>
                  <p>{entry.detail}</p>
                </div>
                <div className="route-history-meta">
                  <span>{formatDate(entry.at)}</span>
                  <span>{formatSettlementState(market.settlementState)}</span>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>

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
          {detail.eventGroups.length ? (
            <ul className="review-link-list">
              {detail.eventGroups.map((group) => (
                <li key={group.group.id}>
                  <a href={`/groups/${group.group.slug}`}>{group.group.title}</a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="route-note">No linked boards yet.</p>
          )}
        </article>

        <article className="review-detail-card">
          <div className="eyebrow">Related markets</div>
          {detail.relatedMarkets.length ? (
            <ul className="review-link-list">
              {detail.relatedMarkets.map((market) => (
                <li key={market.id}>
                  <a href={`/markets/${market.slug}`}>{market.headline}</a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="route-note">No related markets yet.</p>
          )}
        </article>
      </section>
    </RouteFrame>
  )
}
