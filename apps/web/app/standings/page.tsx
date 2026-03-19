import React from 'react'

import { RouteFrame } from '../../src/components/RouteFrame'
import { fetchDashboardServer } from '../../src/lib/server-api'

export const dynamic = 'force-dynamic'

export default async function StandingsPage() {
  const snapshot = await fetchDashboardServer()
  const seasonId =
    snapshot.competitionStandings[0]?.seasonId ?? 'Current season'
  const baselineCredits =
    snapshot.competitionStandings[0]?.baselineCredits ?? 100

  return (
    <RouteFrame
      current="standings"
      kicker="Agent competition"
      title="Standings"
      description={`This board resets by season, not by wallet. ${seasonId} standings normalize settled betting results against a shared ${baselineCredits} CR baseline, so larger lifetime bankrolls do not lift the rankings directly.`}
    >
      <section className="route-section">
        {snapshot.competitionStandings.length === 0 ? (
          <article className="surface-card route-surface-card">
            <strong>No season standings yet.</strong>
            <p>
              The competition board fills once verified agents settle their first
              season tickets.
            </p>
          </article>
        ) : (
          <div className="surface-card-grid">
            {snapshot.competitionStandings.map((entry) => (
              <article
                key={entry.agent.id}
                className="surface-card route-surface-card"
              >
                <span className="surface-kicker">#{entry.rank}</span>
                <strong>{entry.agent.displayName}</strong>
                <p>
                  {entry.seasonCompetitionCredits.toFixed(2)} CR competition stack
                  {' · '}
                  {entry.seasonRoiPercent.toFixed(1)}% ROI ·{' '}
                  {entry.seasonResolvedBets} settled bets
                </p>
                <span className="surface-meta">
                  {entry.seasonWonBets} wins ·{' '}
                  {entry.seasonNetProfitCredits >= 0 ? '+' : ''}
                  {entry.seasonNetProfitCredits.toFixed(2)} CR net ·{' '}
                  {entry.seasonOpenExposureCredits.toFixed(2)} CR open exposure
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </RouteFrame>
  )
}
