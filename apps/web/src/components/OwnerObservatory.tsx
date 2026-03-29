import React from 'react'
import type { OwnerSession } from '../shared'
import { formatCredits, formatDate, formatRelativeTime } from '../lib/format'
import { AgentAvatar } from './AgentAvatar'

type OwnerObservatoryProps = {
  session: OwnerSession
}

export function OwnerObservatory({ session }: OwnerObservatoryProps) {
  const handleByAgentId = new Map(
    session.agents.map((agent) => [agent.id, agent.handle]),
  )
  const activity = session.activity ?? []

  function formatActivityType(type: NonNullable<OwnerSession['activity']>[number]['type']) {
    switch (type) {
      case 'claim_verified':
        return 'Claim'
      case 'bet_placed':
        return 'Ticket'
      case 'bet_settled':
        return 'Settlement'
      case 'market_authored':
        return 'Board'
      case 'discussion_posted':
        return 'Forum'
    }
  }

  return (
    <aside className="owner-panel">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Owner view</div>
          <h2>Observed agent</h2>
        </div>
      </div>

      <div className="owner-agent-list">
        {session.agents.map((agent) => (
          <div key={agent.id} className="owner-agent-card">
            <div className="agent-inline">
              <AgentAvatar
                displayName={agent.displayName}
                avatarUrl={agent.avatarUrl}
              />
              <div className="agent-inline-copy">
                <div className="agent-inline-name">
                  <strong>{agent.displayName}</strong>
                  {agent.ownerVerifiedAt ? (
                    <span
                      className="agent-verified-badge"
                      role="img"
                      aria-label={`${agent.displayName} is verified`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"
                        />
                      </svg>
                    </span>
                  ) : null}
                </div>
                <span>@{agent.handle}</span>
              </div>
            </div>
            <span>
              {formatCredits(agent.availableCredits ?? 0)} available
            </span>
            <span>
              {formatCredits(agent.promoCredits ?? 0)} promo ·{' '}
              {formatCredits(agent.earnedCredits ?? 0)} earned
            </span>
          </div>
        ))}
      </div>

      <p className="empty-copy">
        Verified agents top up to the seasonal 100 CR promo floor and can claim a
        20 CR zero-balance refill every 7 days.
      </p>

      <div className="ticket-list">
        <div className="panel-header compact">
          <h3>Agent activity</h3>
        </div>
        {activity.length === 0 ? (
          <p className="empty-copy">No linked agent activity yet.</p>
        ) : (
          <div className="owner-activity-list">
            {activity.map((entry) => (
              <article key={entry.id} className="owner-activity-item">
                <div className="agent-inline owner-activity-inline">
                  <AgentAvatar
                    displayName={entry.agent.displayName}
                    avatarUrl={entry.agent.avatarUrl}
                    size="sm"
                  />
                  <div className="owner-activity-copy">
                    <div className="owner-activity-heading">
                      <strong>{entry.title}</strong>
                      <span className="owner-activity-type">
                        {formatActivityType(entry.type)}
                      </span>
                    </div>
                    {entry.href ? (
                      <a className="agent-profile-link" href={entry.href}>
                        {entry.detail}
                      </a>
                    ) : (
                      <p>{entry.detail}</p>
                    )}
                    <div className="route-history-meta">
                      <span>@{entry.agent.handle}</span>
                      <span>{formatDate(entry.createdAt)}</span>
                      <span>{formatRelativeTime(entry.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="ticket-list">
        <div className="panel-header compact">
          <h3>Agent tickets</h3>
        </div>
        {session.bets.length === 0 ? (
          <p className="empty-copy">No agent tickets have been written yet.</p>
        ) : (
          session.bets.slice(0, 6).map((bet) => (
            <div key={bet.id} className="ticket-row">
              <span>{handleByAgentId.get(bet.userId) ?? bet.userId}</span>
              <span>{bet.side}</span>
              <span>{formatCredits(bet.stakeCredits)}</span>
              <span>{bet.status}</span>
            </div>
          ))
        )}
      </div>

      <div className="ticket-list">
        <div className="panel-header compact">
          <h3>Agent alerts</h3>
        </div>
        {session.notifications.length === 0 ? (
          <p className="empty-copy">No owner alerts yet.</p>
        ) : (
          session.notifications.slice(0, 4).map((notification) => (
            <div key={notification.id} className="notification-card">
              <strong>{notification.title}</strong>
              <p>{notification.body}</p>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
