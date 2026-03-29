import React from 'react'

import type { DashboardSnapshot } from '../shared'
import {
  formatCredits,
  formatDate,
  formatLineDelta,
  formatLineMoveReason,
  formatRelativeTime,
} from '../lib/format'
import { isBoardMarket } from '../lib/markets'

type LiveSystemDashboardsProps = {
  snapshot: DashboardSnapshot
}

export function LiveSystemDashboards({
  snapshot,
}: LiveSystemDashboardsProps) {
  const boardMarkets = snapshot.markets.filter(isBoardMarket)
  const marketById = new Map(boardMarkets.map((market) => [market.id, market]))
  const agentHandleById = new Map<string, string>()

  for (const entry of snapshot.hallOfFame) {
    agentHandleById.set(entry.agent.id, entry.agent.handle)
  }

  for (const entry of snapshot.competitionStandings) {
    agentHandleById.set(entry.agent.id, entry.agent.handle)
  }

  const recentTickets = [...snapshot.bets]
    .sort((left, right) => Date.parse(right.placedAt) - Date.parse(left.placedAt))
    .slice(0, 4)

  const recentReprices = boardMarkets
    .filter((market) => market.lastLineMoveAt)
    .sort(
      (left, right) =>
        Date.parse(right.lastLineMoveAt as string) -
        Date.parse(left.lastLineMoveAt as string),
    )
    .slice(0, 4)

  const recentEvidence = boardMarkets
    .flatMap((market) =>
      (market.evidenceUpdates ?? []).map((entry) => ({
        id: entry.id,
        marketSlug: market.slug,
        marketHeadline: market.headline,
        title: entry.title,
        detail: entry.detail,
        publishedAt: entry.publishedAt,
      })),
    )
    .sort(
      (left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt),
    )
    .slice(0, 4)

  const sourceDomainCount = new Set(
    boardMarkets.flatMap((market) => market.sources.map((source) => source.domain)),
  ).size
  const evidenceDrivenMarketCount = boardMarkets.filter(
    (market) => (market.evidenceUpdates ?? []).length > 0,
  ).length
  const repricedMarketCount = boardMarkets.filter((market) => market.lastLineMoveAt).length

  const pulseItems = [
    {
      label: 'Live slips',
      value: `${snapshot.stats.activeBets}`,
      detail: `${formatCredits(
        snapshot.bets.reduce((total, bet) => total + bet.stakeCredits, 0),
      )} currently staked`,
    },
    {
      label: 'Repriced cards',
      value: `${repricedMarketCount}`,
      detail: 'markets with a recorded line move',
    },
    {
      label: 'Evidence-fed',
      value: `${evidenceDrivenMarketCount}`,
      detail: 'cards with published evidence updates',
    },
    {
      label: 'Source domains',
      value: `${sourceDomainCount}`,
      detail: 'public domains feeding the board',
    },
  ]

  return (
    <section className="board-surface-panel live-dashboard-panel">
      <div className="section-heading compact">
        <div>
          <div className="eyebrow">Live dashboards</div>
          <h2>Watch the board breathe</h2>
        </div>
        <span className="route-note">
          Ticket flow, repricing, and evidence updates from the live board.
        </span>
      </div>

      <div className="live-dashboard-grid">
        <article className="surface-card live-dashboard-card">
          <span className="surface-kicker">System pulse</span>
          <div className="live-pulse-grid">
            {pulseItems.map((item) => (
              <div key={item.label} className="live-pulse-card">
                <span className="live-pulse-label">{item.label}</span>
                <strong className="live-pulse-value">{item.value}</strong>
                <span className="live-pulse-detail">{item.detail}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="surface-card live-dashboard-card">
          <span className="surface-kicker">Ticket flow</span>
          {recentTickets.length === 0 ? (
            <p className="empty-copy">No live tickets have been written yet.</p>
          ) : (
            <ul className="route-history-list">
              {recentTickets.map((bet) => {
                const market = marketById.get(bet.marketId)
                const handle = agentHandleById.get(bet.userId)

                return (
                  <li key={bet.id} className="route-history-item">
                    <div>
                      <strong>
                        {handle ? `@${handle}` : 'Agent'} · {bet.side} ·{' '}
                        {formatCredits(bet.stakeCredits)}
                      </strong>
                      <p>{market?.headline ?? bet.marketId}</p>
                    </div>
                    <div className="route-history-meta">
                      <span>{bet.status}</span>
                      <span>{formatRelativeTime(bet.placedAt)}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </article>

        <article className="surface-card live-dashboard-card">
          <span className="surface-kicker">Repricing wire</span>
          {recentReprices.length === 0 ? (
            <p className="empty-copy">No reprices recorded yet.</p>
          ) : (
            <ul className="route-history-list">
              {recentReprices.map((market) => {
                const lineDelta = formatLineDelta(
                  market.payoutMultiplier,
                  market.previousPayoutMultiplier,
                )
                const reason =
                  formatLineMoveReason(market.lastLineMoveReason) ?? 'Repriced'

                return (
                  <li key={market.id} className="route-history-item">
                    <div>
                      <strong>{market.headline}</strong>
                      <p>
                        {reason} · {market.payoutMultiplier.toFixed(2)}x
                        {lineDelta ? ` (${lineDelta})` : ''}
                      </p>
                    </div>
                    <div className="route-history-meta">
                      <span>{formatDate(market.lastLineMoveAt as string)}</span>
                      <a href={`/markets/${market.slug}`}>Open market</a>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </article>

        <article className="surface-card live-dashboard-card">
          <span className="surface-kicker">Evidence wire</span>
          {recentEvidence.length === 0 ? (
            <p className="empty-copy">No evidence updates published yet.</p>
          ) : (
            <ul className="route-history-list">
              {recentEvidence.map((entry) => (
                <li key={entry.id} className="route-history-item">
                  <div>
                    <strong>{entry.title}</strong>
                    <p>{entry.marketHeadline}</p>
                  </div>
                  <div className="route-history-meta">
                    <span>{formatDate(entry.publishedAt)}</span>
                    <a href={`/markets/${entry.marketSlug}`}>Open market</a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </section>
  )
}
