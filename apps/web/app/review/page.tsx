import React from 'react'
import type { Metadata } from 'next'

import { RouteFrame } from '../../src/components/RouteFrame'
import {
  fetchInternalClaudeReviewRunsServer,
  fetchInternalLeadInspectionServer,
  fetchInternalLeadQueueServer,
  isReviewConsoleAvailable,
  isReviewConsoleAuthorized,
} from '../../src/lib/internal-server-api'
import {
  buildReviewConsoleHref,
  readReviewConsoleState,
} from '../../src/lib/review-console'
import {
  formatDate,
} from '../../src/lib/format'
import { applyLeadReviewAction, applyLeadStatusAction } from './actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Review Desk',
  description:
    'Internal LemonSuk operator review desk for pending lead triage and offline board curation.',
  robots: {
    index: false,
    follow: false,
  },
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value)
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const state = readReviewConsoleState(await searchParams)
  const available = isReviewConsoleAvailable()

  if (!available) {
    return (
      <RouteFrame
        current="review"
        kicker="Operator review"
        title="Review desk"
        description="Pending leads stay off the public board until they are reviewed. Local review tools need the internal service token before this desk can connect."
      >
        <section className="review-lock-card">
          <h2>Review desk unavailable</h2>
          <p>
            This local web process is missing{' '}
            <code>INTERNAL_SERVICE_TOKEN</code>, so it cannot talk to the
            internal lead-review API.
          </p>
          <p className="route-note">
            Start local dev with <code>npm run dev</code> or provide the token
            before opening <code>/review</code>.
          </p>
        </section>
      </RouteFrame>
    )
  }

  const authorized = isReviewConsoleAuthorized(state.reviewKey)

  if (!authorized) {
    return (
      <RouteFrame
        current="review"
        kicker="Operator review"
        title="Review desk"
        description="Pending leads stay off the public board until they are reviewed. Unlock this desk with the operator review key."
      >
        <section className="review-lock-card">
          <h2>Review desk locked</h2>
          <p>
            Append the configured operator key as <code>?review_key=...</code> to
            open the pending-lead console.
          </p>
          <p className="route-note">
            This route is intentionally separate from owner access. It is for
            editorial review only.
          </p>
        </section>
      </RouteFrame>
    )
  }

  const queue = await fetchInternalLeadQueueServer({
    limit: state.limit,
    leadType: state.leadType,
    familySlug: state.familySlug,
    entitySlug: state.entitySlug,
    sourceDomain: state.sourceDomain,
  })
  const recentClaudeRuns = await fetchInternalClaudeReviewRunsServer(8)
  const activeLeadId = state.leadId ?? queue.items[0]?.id ?? null
  const detail = activeLeadId
    ? await fetchInternalLeadInspectionServer(activeLeadId)
    : null

  const baseHiddenFields = (
    <>
      <input type="hidden" name="review_key" value={state.reviewKey ?? ''} />
      <input type="hidden" name="leadId" value={activeLeadId ?? ''} />
      <input type="hidden" name="limit" value={String(state.limit ?? '')} />
      <input type="hidden" name="leadType" value={state.leadType ?? ''} />
      <input type="hidden" name="familySlug" value={state.familySlug ?? ''} />
      <input type="hidden" name="entitySlug" value={state.entitySlug ?? ''} />
      <input
        type="hidden"
        name="sourceDomain"
        value={state.sourceDomain ?? ''}
      />
    </>
  )

  return (
    <RouteFrame
      current="review"
      kicker="Operator review"
      title="Review desk"
      description="Review pending claim leads, inspect duplicate/context hints, and apply manual editorial decisions without exposing the queue on the public board."
      actions={
        <div className="route-action-cluster">
          <a
            className="surface-link"
            href={buildReviewConsoleHref({ reviewKey: state.reviewKey })}
          >
            Clear filters
          </a>
          <span className="route-note">
            {queue.pendingCount} pending lead{queue.pendingCount === 1 ? '' : 's'}
          </span>
        </div>
      }
    >
      {state.flash ? (
        <div className="route-flash" role="status">
          {state.flash}
        </div>
      ) : null}

      <section className="review-filter-panel">
        <form className="review-filter-grid" method="get">
          <input type="hidden" name="review_key" value={state.reviewKey ?? ''} />
          <label>
            Limit
            <input
              name="limit"
              type="number"
              min="1"
              max="100"
              defaultValue={state.limit ?? 25}
            />
          </label>
          <label>
            Lead type
            <select name="leadType" defaultValue={state.leadType ?? ''}>
              <option value="">All</option>
              <option value="structured_agent_lead">Agent packets</option>
              <option value="human_url_lead">Human URLs</option>
              <option value="system_discovery_lead">System discovery</option>
            </select>
          </label>
          <label>
            Family
            <select name="familySlug" defaultValue={state.familySlug ?? ''}>
              <option value="">All</option>
              <option value="ai_launch">AI launches</option>
              <option value="product_ship_date">Product ship dates</option>
              <option value="earnings_guidance">Earnings / guidance</option>
              <option value="policy_promise">Policy promises</option>
              <option value="ceo_claim">CEO claims</option>
            </select>
          </label>
          <label>
            Entity slug
            <input
              name="entitySlug"
              type="text"
              placeholder="apple"
              defaultValue={state.entitySlug ?? ''}
            />
          </label>
          <label>
            Source domain
            <input
              name="sourceDomain"
              type="text"
              placeholder="example.com"
              defaultValue={state.sourceDomain ?? ''}
            />
          </label>
          <button type="submit" className="session-status-action">
            Filter leads
          </button>
        </form>
      </section>

      <section className="review-console-grid">
        <aside className="review-inbox">
          <div className="section-heading compact">
            <div>
              <div className="eyebrow">Pending leads</div>
              <h2>Inbox</h2>
            </div>
          </div>
          {queue.items.length === 0 ? (
            <p className="empty-copy">No pending leads match this filter.</p>
          ) : (
            <div className="review-list">
              {queue.items.map((lead) => {
                const href = buildReviewConsoleHref({
                  ...state,
                  leadId: lead.id,
                })

                return (
                  <a
                    key={lead.id}
                    className={`review-list-item ${activeLeadId === lead.id ? 'active' : ''}`}
                    href={href}
                  >
                    <span className="review-list-kicker">
                      {lead.familyDisplayName ?? lead.leadType}
                    </span>
                    <strong>{lead.claimedHeadline ?? lead.sourceDomain}</strong>
                    <span className="review-list-meta">
                      {lead.primaryEntityDisplayName ?? 'Unassigned entity'} ·{' '}
                      {lead.sourceDomain}
                    </span>
                  </a>
                )
              })}
            </div>
          )}
        </aside>

        <div className="review-detail-column">
          {detail ? (
            <>
              <section className="review-detail-card">
                <div className="section-heading compact">
                  <div>
                    <div className="eyebrow">Lead detail</div>
                    <h2>{detail.lead.claimedHeadline ?? detail.lead.sourceDomain}</h2>
                  </div>
                </div>
                <dl className="review-detail-grid">
                  <div>
                    <dt>Status</dt>
                    <dd>{detail.lead.status}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>
                      <a href={detail.lead.sourceUrl} target="_blank" rel="noreferrer">
                        {detail.lead.sourceDomain}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt>Family</dt>
                    <dd>{detail.lead.familyDisplayName ?? 'Unassigned'}</dd>
                  </div>
                  <div>
                    <dt>Entity</dt>
                    <dd>{detail.lead.primaryEntityDisplayName ?? 'Unassigned'}</dd>
                  </div>
                  <div>
                    <dt>Lead type</dt>
                    <dd>{detail.lead.leadType}</dd>
                  </div>
                  <div>
                    <dt>Submitted by</dt>
                    <dd>
                      {detail.lead.submittedBy?.displayName ??
                        detail.lead.submittedByOwnerEmail ??
                        'Unknown'}
                    </dd>
                  </div>
                  <div>
                    <dt>Spam score</dt>
                    <dd>{detail.lead.spamScore.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>Duplicate target</dt>
                    <dd>
                      {detail.lead.duplicateOfLeadId ??
                        detail.lead.duplicateOfMarketId ??
                        'None'}
                    </dd>
                  </div>
                </dl>
                <p className="review-body-copy">
                  {detail.lead.summary ??
                    detail.lead.sourceNote ??
                    'No submission summary was attached to this lead.'}
                </p>
                {detail.lead.tags.length > 0 ? (
                  <div className="hero-marquee review-tag-row">
                    {detail.lead.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="review-form-grid">
                <form className="review-form-card" action={applyLeadStatusAction}>
                  {baseHiddenFields}
                  <div className="eyebrow">Manual status</div>
                  <label>
                    Status
                    <select name="status" defaultValue="in_review">
                      <option value="in_review">in_review</option>
                      <option value="escalated">escalated</option>
                      <option value="failed">failed</option>
                    </select>
                  </label>
                  <label>
                    Run id
                    <input name="runId" type="text" placeholder="manual-run-1" />
                  </label>
                  <label>
                    Provider run id
                    <input
                      name="providerRunId"
                      type="text"
                      placeholder="eddie-run-1"
                    />
                  </label>
                  <label>
                    Note
                    <textarea
                      name="note"
                      rows={4}
                      defaultValue={detail.lead.reviewNotes ?? ''}
                    />
                  </label>
                  <button type="submit" className="hero-action hero-action-secondary">
                    Update status
                  </button>
                </form>

                <form className="review-form-card" action={applyLeadReviewAction}>
                  {baseHiddenFields}
                  <div className="eyebrow">Manual decision</div>
                  <label>
                    Verdict
                    <select name="verdict" defaultValue="accept">
                      <option value="accept">accept</option>
                      <option value="reject">reject</option>
                      <option value="escalate">escalate</option>
                    </select>
                  </label>
                  <label>
                    Reviewer
                    <input
                      name="reviewer"
                      type="text"
                      defaultValue="LemonSuk operator"
                    />
                  </label>
                  <label>
                    Confidence
                    <input
                      name="confidence"
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      defaultValue="0.72"
                    />
                  </label>
                  <label>
                    Snapshot ref
                    <input
                      name="snapshotRef"
                      type="text"
                      placeholder="eddie://batch/42"
                    />
                  </label>
                  <label>
                    Linked market id
                    <input
                      name="linkedMarketId"
                      type="text"
                      defaultValue={detail.lead.linkedMarketId ?? ''}
                    />
                  </label>
                  <label>
                    Summary
                    <textarea
                      name="summary"
                      rows={4}
                      defaultValue={
                        detail.recentReviewResults[0]?.summary ??
                        'Manual review applied from the operator desk.'
                      }
                    />
                  </label>
                  <label>
                    Evidence URL
                    <input
                      name="evidenceUrl"
                      type="url"
                      defaultValue={detail.lead.sourceUrl}
                    />
                  </label>
                  <label>
                    Evidence excerpt
                    <textarea
                      name="evidenceExcerpt"
                      rows={3}
                      defaultValue={detail.lead.sourceNote ?? ''}
                    />
                  </label>
                  <label className="review-checkbox">
                    <input name="needsHumanReview" type="checkbox" />
                    Mark as needs human review
                  </label>
                  <button type="submit" className="hero-action hero-action-primary">
                    Apply review
                  </button>
                </form>
              </section>

              <section className="review-related-grid">
                <div className="review-detail-card">
                  <div className="eyebrow">Related pending leads</div>
                  {detail.relatedPendingLeads.length > 0 ? (
                    <ul className="review-link-list">
                      {detail.relatedPendingLeads.map((lead) => (
                        <li key={lead.id}>
                          <a
                            href={buildReviewConsoleHref({
                              ...state,
                              leadId: lead.id,
                            })}
                          >
                            {lead.claimedHeadline ?? lead.sourceDomain}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="empty-copy">No related pending leads.</p>
                  )}
                </div>

                <div className="review-detail-card">
                  <div className="eyebrow">Recent review results</div>
                  {detail.recentReviewResults.length > 0 ? (
                    <ul className="review-link-list">
                      {detail.recentReviewResults.map((result) => (
                        <li key={result.runId}>
                          <strong>{result.verdict}</strong> · {result.reviewer} ·{' '}
                          {result.summary}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="empty-copy">No recent review results.</p>
                  )}
                </div>

                <div className="review-detail-card">
                  <div className="eyebrow">Recent reviewed leads</div>
                  {detail.recentReviewedLeads.length > 0 ? (
                    <ul className="review-link-list">
                      {detail.recentReviewedLeads.map((lead) => (
                        <li key={lead.id}>
                          {lead.claimedHeadline ?? lead.sourceDomain} · {lead.status}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="empty-copy">No recent reviewed leads.</p>
                  )}
                </div>
              </section>
            </>
          ) : (
            <section className="review-detail-card">
              <h2>No lead selected</h2>
              <p className="empty-copy">
                Choose a pending lead from the inbox to inspect it.
              </p>
            </section>
          )}
        </div>
      </section>

      <section className="route-section">
        <article className="review-detail-card">
          <div className="section-heading compact">
            <div>
              <div className="eyebrow">Review runtime</div>
              <h2>Claude review runs</h2>
            </div>
            <span className="route-note">
              {recentClaudeRuns.length} recent run
              {recentClaudeRuns.length === 1 ? '' : 's'}
            </span>
          </div>
          {recentClaudeRuns.length > 0 ? (
            <ul className="route-history-list">
              {recentClaudeRuns.map((run) => {
                const href = buildReviewConsoleHref({
                  ...state,
                  leadId: run.leadId,
                })

                return (
                  <li key={run.id} className="route-history-item">
                    <div>
                      <strong>{run.promptSummary}</strong>
                      <p>
                        {run.recommendation
                          ? `${run.recommendation.verdict} · ${run.recommendation.summary}`
                          : run.errorMessage ??
                            run.finalSummary ??
                            'Run is still in progress.'}
                      </p>
                    </div>
                    <div className="route-history-meta">
                      <span>{run.status}</span>
                      <span>{run.agentKey}</span>
                      <span>{formatUsd(run.costUsd)}</span>
                      <span>{formatDate(run.startedAt)}</span>
                      <a href={href}>Open lead</a>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="empty-copy">No Claude review runs recorded yet.</p>
          )}
        </article>
      </section>
    </RouteFrame>
  )
}
