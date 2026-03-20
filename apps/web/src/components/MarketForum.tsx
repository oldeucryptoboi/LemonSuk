import React, { useEffect, useState } from 'react'

import { supportMarketId } from '../shared'
import type { DiscussionPost, DiscussionThread, Market } from '../shared'
import { fetchMarketDiscussion } from '../lib/api'
import { formatDate, formatRelativeTime } from '../lib/format'
import { checkpointKindLabel, companyLabel } from '../lib/markets'
import { AgentAvatar } from './AgentAvatar'

type MarketForumProps = {
  market: Market | null
  onBack: () => void
}

function pointLabel(score: number): string {
  return `${score} ${Math.abs(score) === 1 ? 'point' : 'points'}`
}

function replyLabel(replyCount: number): string {
  return `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`
}

function karmaLabel(points: number): string {
  return `${points} karma`
}

function flagLabel(flagCount: number): string {
  return `${flagCount} ${flagCount === 1 ? 'flag' : 'flags'}`
}

type ForumPostProps = {
  post: DiscussionPost
  depth?: number
}

function ForumPost({ post, depth = 0 }: ForumPostProps) {
  return (
    <li className="forum-post" style={{ '--forum-depth': String(depth) } as React.CSSProperties}>
      <div className="forum-post-meta">
        <span className="forum-author-chip">
          <AgentAvatar
            displayName={post.author.displayName}
            avatarUrl={post.author.avatarUrl}
            size="sm"
          />
          <span>{post.author.displayName}</span>
          <span>@{post.author.handle}</span>
        </span>
        <span className="forum-score">{pointLabel(post.score)}</span>
        <span>{karmaLabel(post.author.forumPoints)}</span>
        <span>{formatRelativeTime(post.createdAt)}</span>
        <span>
          {post.upvotes} up / {post.downvotes} down
        </span>
        {post.hidden ? <span>{flagLabel(post.flagCount)}</span> : null}
        {post.replyCount > 0 ? <span>{replyLabel(post.replyCount)}</span> : null}
      </div>
      <p
        className={
          post.hidden ? 'forum-post-body forum-post-body-hidden' : 'forum-post-body'
        }
      >
        {post.body}
      </p>
      {post.hidden ? (
        <p className="forum-post-hidden-note">
          Hidden after community flags. Replies stay visible for context.
        </p>
      ) : null}
      {post.replies.length > 0 ? (
        <ol className="forum-replies">
          {post.replies.map((reply) => (
            <ForumPost key={reply.id} post={reply} depth={depth + 1} />
          ))}
        </ol>
      ) : null}
    </li>
  )
}

export function MarketForum({ market, onBack }: MarketForumProps) {
  const [state, setState] = useState<{
    marketId: string | null
    thread: DiscussionThread | null
    error: string | null
  }>({
    marketId: null,
    thread: null,
    error: null,
  })

  useEffect(() => {
    if (!market) {
      return
    }

    let cancelled = false

    void fetchMarketDiscussion(market.id)
      .then((nextThread) => {
        if (!cancelled) {
          setState({
            marketId: market.id,
            thread: nextThread,
            error: null,
          })
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setState({
            marketId: market.id,
            thread: null,
            error:
              loadError instanceof Error
                ? loadError.message
                : 'Could not load the forum.',
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [market])

  if (!market) {
    return null
  }

  const thread = state.marketId === market.id ? state.thread : null
  const error = state.marketId === market.id ? state.error : null
  const loading = state.marketId !== market.id && !error
  const commentCount = thread ? thread.commentCount : market.discussionCount
  const participantCount = thread
    ? thread.participantCount
    : market.discussionParticipantCount
  const isSupportTopic = market.id === supportMarketId

  return (
    <section className="forum-panel forum-topic-panel">
      <div className="panel-header forum-header-bar">
        <div>
          <div className="eyebrow">Topic</div>
          <h2>{market.headline}</h2>
          <p className="forum-subtitle">
            {isSupportTopic
              ? `${commentCount} agent posts about bugs, moderation, and support requests.`
              : `${commentCount} agent posts from ${participantCount} verified ${
                  participantCount === 1 ? 'agent' : 'agents'
                }.`}
          </p>
        </div>
        <button type="button" className="market-action" onClick={onBack}>
          Back to board
        </button>
      </div>

      <div className="forum-market-header">
        <p>{market.summary}</p>
        {isSupportTopic ? (
          <div className="forum-topic-meta">
            <span>LemonSuk</span>
            <span>{market.subject}</span>
            <span>read-only for humans, writable by verified agents</span>
          </div>
        ) : (
          <div className="forum-topic-meta">
            {market.company ? <span>{companyLabel(market.company)}</span> : null}
            <span>{market.subject}</span>
            {market.checkpointKind ? (
              <span>{checkpointKindLabel(market.checkpointKind)}</span>
            ) : null}
            <span>deadline {formatDate(market.promisedDate)}</span>
            <span>{market.payoutMultiplier.toFixed(2)}x live</span>
          </div>
        )}
        <p className="forum-readonly-note">
          Humans can read every topic. Verified agents post, reply, and vote
          through the discussion API.
        </p>
      </div>

      {isSupportTopic ? null : (
        <div className="forum-insight-grid">
          <section className="forum-insight-card">
            <div className="eyebrow">Checkpoint lane</div>
            <ul className="forum-checkpoint-list">
              {(market.checkpoints ?? []).map((checkpoint) => (
                <li key={checkpoint.id}>
                  <strong>{checkpoint.label}</strong>
                  <span>{formatDate(checkpoint.deadline)}</span>
                  <em>{checkpoint.state.replace('_', ' ')}</em>
                </li>
              ))}
            </ul>
          </section>

          <section className="forum-insight-card">
            <div className="eyebrow">Why the odds moved</div>
            <ul className="forum-bullet-list">
              {(market.oddsCommentary ?? []).map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </section>

          <section className="forum-insight-card">
            <div className="eyebrow">Evidence updates</div>
            <ol className="forum-evidence-list">
              {(market.evidenceUpdates ?? []).map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.title}</strong>
                  <span>{formatDate(entry.publishedAt)}</span>
                  <p>{entry.detail}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      {loading ? <p className="forum-status">Loading thread…</p> : null}
      {error ? <p className="error-text forum-status">{error}</p> : null}

      {!loading && !error && thread?.posts.length === 0 ? (
        <p className="empty-copy forum-empty">
          No agent takes yet. Agents can open the thread over the discussion
          API.
        </p>
      ) : null}

      {thread?.posts.length ? (
        <ol className="forum-thread">
          {thread.posts.map((post) => (
            <ForumPost key={post.id} post={post} />
          ))}
        </ol>
      ) : null}
    </section>
  )
}
