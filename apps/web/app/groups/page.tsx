import React from 'react'
import type { Metadata } from 'next'

import { RouteFrame } from '../../src/components/RouteFrame'
import {
  fetchBoardFamiliesServer,
  fetchBoardGroupsServer,
} from '../../src/lib/server-api'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Reviewed Groups',
  description:
    'Browse LemonSuk prediction families and reviewed boards across AI launches, product ship dates, CEO claims, policy promises, and more.',
  alternates: {
    canonical: '/groups',
  },
}

type GroupsPageProps = {
  searchParams?: {
    family?: string
  }
}

export default async function GroupsPage({ searchParams }: GroupsPageProps) {
  const [families, groups] = await Promise.all([
    fetchBoardFamiliesServer(),
    fetchBoardGroupsServer(),
  ])
  const activeFamilySlug = searchParams?.family?.trim() || null
  const featuredGroups = groups.filter((summary) => {
    if (summary.totalMarkets <= 0) {
      return false
    }

    if (!activeFamilySlug) {
      return true
    }

    return summary.family?.slug === activeFamilySlug
  })
  const activeFamilies = families.filter((summary) => summary.totalMarkets > 0)
  const activeFamily = activeFamilySlug
    ? activeFamilies.find((summary) => summary.family.slug === activeFamilySlug) ??
      null
    : null

  return (
    <RouteFrame
      current="groups"
      kicker="Board taxonomy"
      title="Reviewed groups"
      description={
        activeFamily
          ? `${activeFamily.family.displayName} groups on the board right now. Clear the filter to return to the full reviewed catalog.`
          : 'Families organize the prediction board by market type, while groups turn those families into entity-specific lanes like Apple launch windows, OpenAI release radar, and NVIDIA AI roadmaps.'
      }
      actions={
        <div className="route-action-cluster">
          {activeFamily ? (
            <a className="surface-link" href="/groups">
              Show all families
            </a>
          ) : null}
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
            <a
              key={summary.family.id}
              className={`surface-card route-surface-card ${
                activeFamilySlug === summary.family.slug ? 'surface-card-selected' : ''
              }`}
              href={
                activeFamilySlug === summary.family.slug
                  ? '/groups'
                  : `/groups?family=${summary.family.slug}`
              }
            >
              <span className="surface-kicker">
                {summary.openMarkets} open / {summary.totalMarkets} tracked
              </span>
              <strong>{summary.family.displayName}</strong>
              <p>{summary.family.description}</p>
              <span className="surface-meta">
                {summary.activeGroups} active group{summary.activeGroups === 1 ? '' : 's'}
              </span>
            </a>
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
          {featuredGroups.length > 0 ? (
            featuredGroups.map((summary) => (
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
            ))
          ) : (
            <article className="surface-card route-surface-card">
              <span className="surface-kicker">No matching groups</span>
              <strong>
                {activeFamily
                  ? `No ${activeFamily.family.displayName} groups yet`
                  : 'No reviewed groups yet'}
              </strong>
              <p>
                {activeFamily
                  ? 'This family is active on the board taxonomy, but there are no reviewed entity boards in it yet.'
                  : 'Accepted groups will show up here once the review desk promotes them onto the board.'}
              </p>
            </article>
          )}
        </div>
      </section>
    </RouteFrame>
  )
}
