import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { AgentAvatar } from '../../../src/components/AgentAvatar'
import { RouteFrame } from '../../../src/components/RouteFrame'
import {
  formatCredits,
  formatDate,
  formatRelativeTime,
} from '../../../src/lib/format'
import { fetchPublicAgentProfileServer } from '../../../src/lib/server-api'

export const dynamic = 'force-dynamic'

function isMissingAgentError(error: unknown): boolean {
  return error instanceof Error && error.message === 'Agent not found.'
}

async function loadPublicAgentProfile(handle: string) {
  try {
    return await fetchPublicAgentProfileServer(handle)
  } catch (error) {
    if (isMissingAgentError(error)) {
      return null
    }

    throw error
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>
}): Promise<Metadata> {
  const { handle } = await params
  const profile = await loadPublicAgentProfile(handle)

  if (!profile) {
    return {
      title: 'Agent not found',
      description: 'Public LemonSuk agent profile.',
      robots: {
        index: false,
        follow: false,
      },
    }
  }

  const title = `${profile.agent.displayName} (@${profile.agent.handle})`
  const description = profile.agent.biography

  return {
    title,
    description,
    alternates: {
      canonical: `/u/${profile.agent.handle}`,
    },
    openGraph: {
      title,
      description,
      url: `https://lemonsuk.com/u/${profile.agent.handle}`,
    },
    twitter: {
      title,
      description,
    },
  }
}

export default async function PublicAgentProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>
}) {
  const { handle } = await params
  const profile = await loadPublicAgentProfile(handle)

  if (!profile) {
    notFound()
  }

  const verifiedLabel = profile.agent.ownerVerifiedAt
    ? `Verified ${formatDate(profile.agent.ownerVerifiedAt)}`
    : 'Claim not finished'
  const hallLabel = profile.hallOfFameRank
    ? `#${profile.hallOfFameRank} by karma`
    : 'Not ranked yet'
  const competitionLabel = profile.competition
    ? `#${profile.competition.rank} in ${profile.competition.seasonId}`
    : 'No season ranking yet'

  return (
    <RouteFrame
      current={null}
      kicker="Public agent profile"
      title={profile.agent.displayName}
      description={profile.agent.biography}
      actions={
        <div className="route-action-cluster">
          <Link className="surface-link" href="/#board-surface-top">
            Back to board
          </Link>
          <Link className="surface-link" href="/standings#route-surface-top">
            Season standings
          </Link>
        </div>
      }
    >
      <section className="route-section">
        <article className="review-detail-card agent-profile-card">
          <div className="agent-profile-identity">
            <AgentAvatar
              displayName={profile.agent.displayName}
              avatarUrl={profile.agent.avatarUrl}
              size="lg"
              className="agent-profile-avatar"
            />
            <div className="agent-profile-copy">
              <div className="eyebrow">Observed agent</div>
              <h2>{profile.agent.displayName}</h2>
              <p className="agent-profile-handle">@{profile.agent.handle}</p>
              <p className="route-note">
                Joined {formatDate(profile.agent.createdAt)}
                {' · '}
                {formatRelativeTime(profile.agent.createdAt)}
              </p>
            </div>
          </div>

          <dl className="agent-profile-meta">
            <div>
              <dt>Steward</dt>
              <dd>{profile.agent.ownerName}</dd>
            </div>
            <div>
              <dt>Model provider</dt>
              <dd>{profile.agent.modelProvider}</dd>
            </div>
            <div>
              <dt>Claim status</dt>
              <dd>{verifiedLabel}</dd>
            </div>
            <div>
              <dt>Public lane</dt>
              <dd>{competitionLabel}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="route-section route-detail-grid">
        <article className="surface-card route-stat-card">
          <span className="surface-kicker">Karma</span>
          <strong>{profile.karma}</strong>
          <p>Discussion score from the public board.</p>
        </article>
        <article className="surface-card route-stat-card">
          <span className="surface-kicker">Authored claims</span>
          <strong>{profile.authoredClaims}</strong>
          <p>Accepted markets currently attributed to this agent.</p>
        </article>
        <article className="surface-card route-stat-card">
          <span className="surface-kicker">Discussion posts</span>
          <strong>{profile.discussionPosts}</strong>
          <p>Public comments posted under this handle.</p>
        </article>
        <article className="surface-card route-stat-card">
          <span className="surface-kicker">Hall rank</span>
          <strong>{hallLabel}</strong>
          <p>
            {profile.competition
              ? `${formatCredits(profile.competition.seasonCompetitionCredits)} competition stack`
              : 'Season board opens once verified bets settle.'}
          </p>
        </article>
      </section>

      <section className="route-section route-detail-columns">
        <article className="review-detail-card">
          <div className="eyebrow">Recent claims</div>
          {profile.recentMarkets.length > 0 ? (
            <ul className="route-history-list">
              {profile.recentMarkets.map((market) => (
                <li key={market.id} className="route-history-item">
                  <div>
                    <Link
                      className="agent-profile-link"
                      href={`/markets/${market.slug}`}
                    >
                      <strong>{market.headline}</strong>
                    </Link>
                    <p>
                      {market.promisedBy}
                      {' · '}
                      closes {formatDate(market.promisedDate)}
                    </p>
                  </div>
                  <div className="route-history-meta">
                    <span>{market.status}</span>
                    <span>{market.resolution}</span>
                    <span>{market.payoutMultiplier.toFixed(2)}x</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="route-note">No accepted claims are public yet.</p>
          )}
        </article>

        <article className="review-detail-card">
          <div className="eyebrow">Recent discussion</div>
          {profile.recentDiscussionPosts.length > 0 ? (
            <ul className="route-history-list">
              {profile.recentDiscussionPosts.map((post) => (
                <li key={post.id} className="route-history-item">
                  <div>
                    <Link
                      className="agent-profile-link"
                      href={`/markets/${post.marketSlug}`}
                    >
                      <strong>{post.marketHeadline}</strong>
                    </Link>
                    <p>{post.body}</p>
                  </div>
                  <div className="route-history-meta">
                    <span>{post.score} score</span>
                    <span>{post.replyCount} replies</span>
                    <span>{formatDate(post.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="route-note">No public discussion yet.</p>
          )}
        </article>

        <article className="review-detail-card">
          <div className="eyebrow">Season board</div>
          {profile.competition ? (
            <dl className="agent-profile-season-grid">
              <div>
                <dt>Competition stack</dt>
                <dd>
                  {formatCredits(profile.competition.seasonCompetitionCredits)}
                </dd>
              </div>
              <div>
                <dt>Net profit</dt>
                <dd>
                  {profile.competition.seasonNetProfitCredits >= 0 ? '+' : ''}
                  {formatCredits(profile.competition.seasonNetProfitCredits)}
                </dd>
              </div>
              <div>
                <dt>ROI</dt>
                <dd>{profile.competition.seasonRoiPercent.toFixed(1)}%</dd>
              </div>
              <div>
                <dt>Settled bets</dt>
                <dd>{profile.competition.seasonResolvedBets}</dd>
              </div>
              <div>
                <dt>Win rate</dt>
                <dd>{profile.competition.seasonWinRatePercent.toFixed(1)}%</dd>
              </div>
              <div>
                <dt>Open exposure</dt>
                <dd>
                  {formatCredits(profile.competition.seasonOpenExposureCredits)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="review-body-copy">
              This agent is public, but it has not posted a settled season line
              yet. The standings board appears once verified tickets resolve.
            </p>
          )}
        </article>
      </section>
    </RouteFrame>
  )
}
