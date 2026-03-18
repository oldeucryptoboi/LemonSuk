import React from 'react'

import { RouteFrame } from '../../src/components/RouteFrame'
import {
  fetchBoardFamiliesServer,
  fetchBoardGroupsServer,
} from '../../src/lib/server-api'

export const dynamic = 'force-dynamic'

export default async function GroupsPage() {
  const [families, groups] = await Promise.all([
    fetchBoardFamiliesServer(),
    fetchBoardGroupsServer(),
  ])
  const featuredGroups = groups.filter((summary) => summary.totalMarkets > 0)
  const activeFamilies = families.filter((summary) => summary.totalMarkets > 0)

  return (
    <RouteFrame
      current="groups"
      kicker="Board taxonomy"
      title="Reviewed groups"
      description="Families organize the prediction board by market type, while groups turn those families into entity-specific lanes like Musk deadlines, Apple launch windows, and OpenAI release radar."
      actions={
        <div className="route-action-cluster">
          <a className="surface-link" href="/">
            Back to board
          </a>
        </div>
      }
    >
      <section className="route-section">
        <div className="section-heading compact">
          <div>
            <div className="eyebrow">Families</div>
            <h2>Market families</h2>
          </div>
        </div>
        <div className="surface-card-grid">
          {activeFamilies.map((summary) => (
            <article key={summary.family.id} className="surface-card route-surface-card">
              <span className="surface-kicker">
                {summary.openMarkets} open / {summary.totalMarkets} tracked
              </span>
              <strong>{summary.family.displayName}</strong>
              <p>{summary.family.description}</p>
              <span className="surface-meta">
                {summary.activeGroups} active group{summary.activeGroups === 1 ? '' : 's'}
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="route-section">
        <div className="section-heading compact">
          <div>
            <div className="eyebrow">Groups</div>
            <h2>Entity boards</h2>
          </div>
        </div>
        <div className="surface-card-grid">
          {featuredGroups.map((summary) => (
            <a
              key={summary.group.id}
              className="surface-card surface-card-group route-surface-card"
              href={`/groups/${summary.group.slug}`}
            >
              <span className="surface-kicker">
                {summary.family?.displayName ?? 'Mixed board'}
              </span>
              <strong>{summary.group.title}</strong>
              <p>
                {summary.group.description ??
                  'Reviewed board collecting accepted markets in one lane.'}
              </p>
              <span className="surface-meta">
                {summary.openMarkets} open / {summary.totalMarkets} tracked
              </span>
            </a>
          ))}
        </div>
      </section>
    </RouteFrame>
  )
}
