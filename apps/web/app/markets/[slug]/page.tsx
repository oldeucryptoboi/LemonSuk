import React from 'react'

import { RouteFrame } from '../../../src/components/RouteFrame'
import { fetchBoardMarketDetailServer } from '../../../src/lib/server-api'

export const dynamic = 'force-dynamic'

export default async function MarketDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const detail = await fetchBoardMarketDetailServer(slug)

  return (
    <RouteFrame
      current="board"
      kicker={detail.family?.displayName ?? 'Unclassified'}
      title={detail.market.headline}
      description={detail.market.summary}
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
            {detail.primaryEntity?.displayName ?? detail.market.promisedBy}
          </strong>
          <p>{detail.market.status} market with {detail.market.resolution} resolution.</p>
        </article>
        <article className="surface-card route-stat-card">
          <span className="surface-kicker">Promised date</span>
          <strong>{detail.market.promisedDate.slice(0, 10)}</strong>
          <p>{detail.market.promisedBy}</p>
        </article>
        <article className="surface-card route-stat-card">
          <span className="surface-kicker">Pricing</span>
          <strong>{detail.market.payoutMultiplier.toFixed(2)}x</strong>
          <p>{detail.market.confidence}% confidence on the current line.</p>
        </article>
      </section>

      <section className="route-section route-detail-columns">
        <article className="review-detail-card">
          <div className="eyebrow">Sources</div>
          <ul className="review-link-list">
            {detail.market.sources.map((source) => (
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
    </RouteFrame>
  )
}
