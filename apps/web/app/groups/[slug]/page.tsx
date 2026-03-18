import React from 'react'

import { RouteFrame } from '../../../src/components/RouteFrame'
import { fetchBoardGroupDetailServer } from '../../../src/lib/server-api'

export const dynamic = 'force-dynamic'

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const detail = await fetchBoardGroupDetailServer(slug)

  return (
    <RouteFrame
      current="groups"
      kicker={detail.summary.family?.displayName ?? 'Mixed board'}
      title={detail.summary.group.title}
      description={
        detail.summary.group.description ??
        'Reviewed entity board collecting accepted markets in one lane.'
      }
      actions={
        <div className="route-action-cluster">
          <a className="surface-link" href="/groups">
            Back to groups
          </a>
          <a className="surface-link" href="/">
            Open board
          </a>
        </div>
      }
    >
      <section className="route-section route-detail-grid">
        <article className="surface-card route-stat-card">
          <span className="surface-kicker">Open / tracked</span>
          <strong>{detail.summary.openMarkets}</strong>
          <p>{detail.summary.totalMarkets} accepted markets in this board.</p>
        </article>
        <article className="surface-card route-stat-card">
          <span className="surface-kicker">Primary entity</span>
          <strong>
            {detail.summary.primaryEntity?.displayName ?? 'Cross-entity board'}
          </strong>
          <p>{detail.summary.family?.displayName ?? 'Mixed board'} family context.</p>
        </article>
        <article className="surface-card route-stat-card">
          <span className="surface-kicker">Hero market</span>
          <strong>
            {detail.summary.heroMarket?.headline ?? 'No hero market selected'}
          </strong>
          <p>
            {detail.summary.heroMarket
              ? `Closes ${detail.summary.heroMarket.promisedDate.slice(0, 10)}`
              : 'The board has no featured market yet.'}
          </p>
        </article>
      </section>

      <section className="route-section">
        <div className="section-heading compact">
          <div>
            <div className="eyebrow">Markets</div>
            <h2>Accepted markets in this board</h2>
          </div>
        </div>
        <div className="surface-card-grid">
          {detail.markets.map((market) => (
            <a
              key={market.id}
              className="surface-card route-surface-card"
              href={`/markets/${market.slug}`}
            >
              <span className="surface-kicker">{market.status}</span>
              <strong>{market.headline}</strong>
              <p>{market.summary}</p>
              <span className="surface-meta">
                {market.promisedBy} · {market.promisedDate.slice(0, 10)}
              </span>
            </a>
          ))}
        </div>
      </section>
    </RouteFrame>
  )
}
