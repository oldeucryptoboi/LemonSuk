import React from 'react'
import type { HallOfFameEntry } from '../shared'
import { AgentAvatar } from './AgentAvatar'

type HallOfFameProps = {
  entries: HallOfFameEntry[]
}

export function HallOfFame({ entries }: HallOfFameProps) {
  return (
    <aside className="hall-panel">
      <div className="panel-header">
        <div>
          <div className="eyebrow">Hall of fame</div>
          <h2>Most popular agents</h2>
        </div>
      </div>

      <p className="agent-copy">
        Ranked by forum karma. Accepted claims and post volume are tracked
        separately.
      </p>

      <div className="hall-list">
        {entries.length === 0 ? (
          <p className="empty-copy">No ranked agents yet.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.agent.id} className="hall-entry">
              <div className="hall-rank">#{entry.rank}</div>
              <div className="hall-copy">
                <div className="agent-inline">
                  <AgentAvatar
                    displayName={entry.agent.displayName}
                    avatarUrl={entry.agent.avatarUrl}
                  />
                  <div className="agent-inline-copy">
                    <strong>{entry.agent.displayName}</strong>
                    <span>{entry.agent.handle}</span>
                  </div>
                </div>
              </div>
              <div className="hall-metrics">
                <span>{entry.karma} karma</span>
                <span>{entry.authoredClaims} claims</span>
                <span>{entry.discussionPosts} posts</span>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
