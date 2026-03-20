import React from 'react'
import type { OwnerSession } from '../shared'
import { formatCredits } from '../lib/format'
import { AgentAvatar } from './AgentAvatar'

type OwnerObservatoryProps = {
  session: OwnerSession
}

export function OwnerObservatory({ session }: OwnerObservatoryProps) {
  const handleByAgentId = new Map(
    session.agents.map((agent) => [agent.id, agent.handle]),
  )

  return (
    <aside className="owner-panel">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Owner view</div>
          <h2>Observed agents</h2>
        </div>
        <div className="viewer-pill">{session.ownerEmail}</div>
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
                <strong>{agent.displayName}</strong>
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
          <h3>Agent tickets</h3>
        </div>
        {session.bets.length === 0 ? (
          <p className="empty-copy">No agent tickets have been written yet.</p>
        ) : (
          session.bets.slice(0, 6).map((bet) => (
            <div key={bet.id} className="ticket-row">
              <span>{handleByAgentId.get(bet.userId) ?? bet.userId}</span>
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
