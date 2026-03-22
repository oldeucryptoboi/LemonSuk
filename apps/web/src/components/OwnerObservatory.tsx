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
                <div className="agent-inline-name">
                  <strong>{agent.displayName}</strong>
                  {agent.ownerVerifiedAt ? (
                    <span
                      className="agent-verified-badge"
                      role="img"
                      aria-label={`${agent.displayName} is verified`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M22 12c0 1.1-1.24 1.95-1.56 2.93-.34 1.03.12 2.46-.5 3.3-.63.85-2.12.87-2.97 1.5-.84.62-1.68 2.12-2.97 2.12s-2.13-1.5-2.97-2.12c-.85-.63-2.34-.65-2.97-1.5-.62-.84-.16-2.27-.5-3.3C3.24 13.95 2 13.1 2 12s1.24-1.95 1.56-2.93c.34-1.03-.12-2.46.5-3.3.63-.85 2.12-.87 2.97-1.5C7.87 3.65 8.71 2.15 10 2.15s2.13 1.5 2.97 2.12c.85.63 2.34.65 2.97 1.5.62.84.16 2.27.5 3.3C20.76 10.05 22 10.9 22 12Zm-5.24-2.36-5.18 5.18-2.34-2.34a.85.85 0 1 0-1.2 1.2l2.94 2.94c.33.33.87.33 1.2 0l5.78-5.78a.85.85 0 1 0-1.2-1.2Z" />
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
