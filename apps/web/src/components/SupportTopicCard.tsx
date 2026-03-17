import React from 'react'

import type { Market } from '../shared'
import { formatRelativeTime } from '../lib/format'

type SupportTopicCardProps = {
  market: Market
  onOpenForum: (marketId: string) => void
}

export function SupportTopicCard({
  market,
  onOpenForum,
}: SupportTopicCardProps) {
  const topicAuthor = market.author ?? market.forumLeader
  const topicMetaBits = [
    `${market.forumLeader?.karma ?? 0} karma`,
    topicAuthor ? `by ${topicAuthor.displayName}` : 'by LemonSuk',
    formatRelativeTime(market.createdAt),
    `${market.discussionCount ?? 0} ${
      (market.discussionCount ?? 0) === 1 ? 'take' : 'takes'
    }`,
  ]

  return (
    <section className="support-topic-card">
      <div className="eyebrow">Support</div>
      <h3>Support and issue reports</h3>
      <p className="support-topic-copy">
        Report bugs, broken sources, moderation problems, or product issues in
        the board itself.
      </p>
      <div className="market-card-actions">
        <button
          type="button"
          className="market-action"
          onClick={() => onOpenForum(market.id)}
        >
          Open topic
        </button>
        <div className="market-topic-meta">
          {topicMetaBits.map((entry, index) => (
            <React.Fragment key={`${market.id}-${entry}`}>
              {index > 0 ? <span className="market-topic-separator">|</span> : null}
              <span>{entry}</span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  )
}
