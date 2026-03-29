'use client'

import React from 'react'
import Link from 'next/link'
import { useCallback, useEffect, useState, useTransition } from 'react'

import {
  supportMarketId,
  type BoardEventGroupSummary,
  type BoardFamilySummary,
  type ClaimView,
  type DashboardSnapshot,
  type OwnerSession,
} from './shared'
import { BetSlipPanel } from './components/BetSlipPanel'
import { ArchiveMarketRow } from './components/ArchiveMarketRow'
import { HallOfFame } from './components/HallOfFame'
import { HeroBanner } from './components/HeroBanner'
import { LiveSystemDashboards } from './components/LiveSystemDashboards'
import { LoginModal } from './components/LoginModal'
import { MarketForum } from './components/MarketForum'
import { NotificationRail } from './components/NotificationRail'
import { OwnerObservatory } from './components/OwnerObservatory'
import { SupportTopicCard } from './components/SupportTopicCard'
import {
  fetchBoardFamilies,
  fetchBoardGroups,
  fetchClaimView,
  fetchDashboard,
  fetchOwnerSession,
  subscribeToDashboard,
} from './lib/api'
import {
  createCompanyTabs,
  createSeasonalSurfaces,
  companyLabel,
  isBoardMarket,
} from './lib/markets'
import {
  pickFirstVisibleMarketIdFromSnapshot,
  toggleCompanyFilter,
  toggleMarketStatusFilter,
  matchesBoardFilters,
  type ActiveCompanyFilter,
  type MarketFilter,
  type MarketStatusFilter,
} from './lib/board'

const feedPageSize = 12
const pageScrollLoadAhead = 280
const ownerSessionStorageKey = 'lemonsuk.ownerSessionToken'
const boardSurfaceAnchorId = 'board-surface-top'

type AppProps = {
  initialSnapshot?: DashboardSnapshot | null
  initialFamilySummaries?: BoardFamilySummary[]
  initialGroupSummaries?: BoardEventGroupSummary[]
}

function replaceUrlWithoutParams(keys: string[]) {
  const url = new URL(window.location.href)
  let changed = false

  for (const key of keys) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key)
      changed = true
    }
  }

  if (changed) {
    window.history.replaceState(
      {},
      '',
      `${url.pathname}${url.search}${url.hash}`,
    )
  }
}

export default function App({
  initialSnapshot = null,
  initialFamilySummaries = [],
  initialGroupSummaries = [],
}: AppProps) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(initialSnapshot)
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(() => {
    const boardMarkets = initialSnapshot?.markets.filter(isBoardMarket) ?? []

    return (
      boardMarkets.find((market) => market.status === 'open')?.id ??
      boardMarkets[0]?.id ??
      null
    )
  })
  const [topicMarketId, setTopicMarketId] = useState<string | null>(null)
  const [familySummaries, setFamilySummaries] = useState<BoardFamilySummary[]>(
    initialFamilySummaries,
  )
  const [groupSummaries, setGroupSummaries] = useState<BoardEventGroupSummary[]>(
    initialGroupSummaries,
  )
  const [statusFilters, setStatusFilters] = useState<MarketStatusFilter[]>([])
  const [companyFilters, setCompanyFilters] = useState<ActiveCompanyFilter[]>([])
  const [companyFilterQuery, setCompanyFilterQuery] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(initialSnapshot === null)
  const [visibleMarketCount, setVisibleMarketCount] = useState(feedPageSize)
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [loginModalMode, setLoginModalMode] = useState<'claim' | 'owner'>(
    'claim',
  )
  const [ownerSession, setOwnerSession] = useState<OwnerSession | null>(null)
  const [claimView, setClaimView] = useState<ClaimView | null>(null)
  const [, startTransition] = useTransition()

  const applySnapshot = useCallback(
    (
      nextSnapshot: DashboardSnapshot,
      options: {
        preserveSelection?: boolean
      } = {},
    ) => {
      startTransition(() => {
        setSnapshot(nextSnapshot)
        setSelectedMarketId((current) => {
          const boardMarkets = nextSnapshot.markets.filter(isBoardMarket)
          if (
            options.preserveSelection !== false &&
            current &&
            boardMarkets.some((market) => market.id === current)
          ) {
            return current
          }

          return (
            boardMarkets.find((market) => market.status === 'open')?.id ??
            boardMarkets[0]?.id ??
            null
          )
        })
        setTopicMarketId((current) => {
          if (
            current &&
            nextSnapshot.markets.some((market) => market.id === current)
          ) {
            return current
          }

          return null
        })
      })
    },
    [],
  )

  const refreshDashboard = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true)
    }

    try {
      const [nextSnapshot, nextFamilies, nextGroups] = await Promise.all([
        fetchDashboard(),
        fetchBoardFamilies(),
        fetchBoardGroups(),
      ])
      applySnapshot(nextSnapshot, {
        preserveSelection: false,
      })
      setFamilySummaries(nextFamilies)
      setGroupSummaries(nextGroups)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load the board.',
      )
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }, [applySnapshot])

  useEffect(() => {
    if (!initialSnapshot) {
      void refreshDashboard()
    }

    const unsubscribe = subscribeToDashboard((nextSnapshot) => {
      applySnapshot(nextSnapshot)
      void Promise.all([fetchBoardFamilies(), fetchBoardGroups()])
        .then(([nextFamilies, nextGroups]) => {
          setFamilySummaries(nextFamilies)
          setGroupSummaries(nextGroups)
        })
        .catch(() => undefined)
      setLoading(false)
      setError(null)
    })

    const params = new URLSearchParams(window.location.search)
    const claimToken = params.get('claim')
    const emailVerified = params.get('email_verified')
    const emailError = params.get('email_error')
    const xConnected = params.get('x_connected')
    const xError = params.get('x_error')
    const sessionToken =
      params.get('owner_session') ??
      window.localStorage.getItem(ownerSessionStorageKey)

    if (emailVerified) {
      setMessage(
        'Owner email confirmed. Connect X next to finish the claim verification flow.',
      )
      replaceUrlWithoutParams(['email_verified'])
    }

    if (emailError) {
      setError(emailError)
      replaceUrlWithoutParams(['email_error'])
    }

    if (xConnected) {
      setMessage('X account connected. Finish the verification tweet to open the owner deck.')
      replaceUrlWithoutParams(['x_connected'])
    }

    if (xError) {
      setError(xError)
      replaceUrlWithoutParams(['x_error'])
    }

    if (claimToken) {
      void fetchClaimView(claimToken)
        .then((nextClaimView) => {
          setClaimView(nextClaimView)
          setLoginModalMode('claim')
          setLoginModalOpen(true)
        })
        .catch(() => {
          setClaimView(null)
        })
    }

    if (sessionToken) {
      void fetchOwnerSession(sessionToken)
        .then((session) => {
          setOwnerSession(session)
          window.localStorage.setItem(ownerSessionStorageKey, sessionToken)
          setMessage(`Owner deck opened for ${session.ownerEmail}.`)
          replaceUrlWithoutParams(['owner_session'])
        })
        .catch(() => {
          window.localStorage.removeItem(ownerSessionStorageKey)
        })
    }

    return () => {
      unsubscribe()
    }
  }, [applySnapshot, initialSnapshot, refreshDashboard])

  const boardMarkets = snapshot?.markets.filter(isBoardMarket) ?? []
  const supportTopicMarket =
    snapshot?.markets.find((market) => market.id === supportMarketId) ?? null
  const visibleMarkets = boardMarkets.filter((market) =>
    matchesBoardFilters(market, statusFilters, companyFilters),
  )
  const renderedMarkets = visibleMarkets.slice(0, visibleMarketCount)
  const hasMoreMarkets = renderedMarkets.length < visibleMarkets.length

  const selectedMarket =
    boardMarkets.find((market) => market.id === selectedMarketId) ??
    boardMarkets.find((market) => market.status === 'open') ??
    null
  const topicMarket =
    snapshot?.markets.find((market) => market.id === topicMarketId) ?? null
  const companyTabs = createCompanyTabs(boardMarkets)
  const filteredCompanyTabs = companyTabs.filter((entry) => {
    if (entry.value === 'all') {
      return true
    }

    if (companyFilters.includes(entry.value)) {
      return true
    }

    if (!companyFilterQuery.trim()) {
      return true
    }

    return entry.label.toLowerCase().includes(companyFilterQuery.trim().toLowerCase())
  })
  const seasonalSurfaces = createSeasonalSurfaces(
    boardMarkets,
    snapshot?.now ?? new Date().toISOString(),
  )
  const featuredFamilies = familySummaries.filter(
    (summary) => summary.totalMarkets > 0,
  )
  const featuredGroups = groupSummaries.filter(
    (summary) => summary.totalMarkets > 0,
  )
  const spotlightGroup = featuredGroups[0] ?? null
  const followupGroups = featuredGroups.slice(1, 4)

  const bonusPercent = snapshot?.stats.globalBonusPercent ?? 0
  const agentInstructionsUrl = '/agent.md'
  const archiveScopeLabel =
    statusFilters.length === 0 && companyFilters.length === 0
      ? 'full'
      : 'filtered'
  const companyFilterSummary =
    companyFilters.length === 0
      ? 'All companies'
      : `${companyFilters.length} active: ${companyFilters
          .map((company) => companyLabel(company))
          .join(', ')}`

  const openOwnerLogin = useCallback(() => {
    setLoginModalMode('owner')
    setLoginModalOpen(true)
  }, [])

  const openClaimLookup = useCallback(() => {
    setLoginModalMode('claim')
    setLoginModalOpen(true)
  }, [])

  const handleOwnerLogout = useCallback(() => {
    setOwnerSession(null)
    setLoginModalOpen(false)
    setClaimView(null)
    setMessage('Signed out.')
    setError(null)
    window.localStorage.removeItem(ownerSessionStorageKey)
    replaceUrlWithoutParams(['owner_session'])
  }, [])

  useEffect(() => {
    setVisibleMarketCount(Math.min(feedPageSize, visibleMarkets.length))
  }, [companyFilters, statusFilters, visibleMarkets.length])

  useEffect(() => {
    if (!hasMoreMarkets || loginModalOpen || topicMarket) {
      return
    }

    if (
      document.documentElement.scrollHeight <=
      window.innerHeight + pageScrollLoadAhead
    ) {
      setVisibleMarketCount((current) =>
        Math.min(current + feedPageSize, visibleMarkets.length),
      )
    }
  }, [
    hasMoreMarkets,
    loginModalOpen,
    topicMarket,
    renderedMarkets.length,
    visibleMarkets.length,
  ])

  return (
    <div className="app-shell">
      {snapshot ? (
        <HeroBanner
          snapshot={snapshot}
          ownerSession={ownerSession}
          agentInstructionsUrl={agentInstructionsUrl}
          onOpenOwnerModal={openOwnerLogin}
          onOpenClaimModal={openClaimLookup}
          onOwnerLogout={handleOwnerLogout}
        />
      ) : null}

      {loading || message || error ? (
        <div className="message-strip">
          <div className="message-strip-copy">
            {loading ? <span>Loading the board…</span> : null}
            {message ? <span>{message}</span> : null}
            {error ? <span className="error-text">{error}</span> : null}
          </div>
        </div>
      ) : null}

      <nav
        id={boardSurfaceAnchorId}
        className="board-nav-strip"
        aria-label="Board navigation"
      >
        <Link className="board-nav-link active" href={`/#${boardSurfaceAnchorId}`}>
          Board
        </Link>
        <Link className="board-nav-link" href="/groups#route-surface-top">
          Groups
        </Link>
        <Link className="board-nav-link" href="/standings#route-surface-top">
          Standings
        </Link>
        <Link className="board-nav-link" href="/owner#route-surface-top">
          Owner deck
        </Link>
        <Link className="board-nav-link" href="/review#route-surface-top">
          Review desk
        </Link>
      </nav>

      <div className="content-grid">
        <main className="main-column">
          {topicMarket ? (
            <MarketForum
              market={topicMarket}
              onBack={() => setTopicMarketId(null)}
            />
          ) : (
            <section className="market-feed-panel">
              <div className="market-feed-scroll">
                {snapshot ? (
                  <LiveSystemDashboards snapshot={snapshot} />
                ) : null}

                {spotlightGroup ? (
                  <section className="board-surface-panel board-surface-panel-spotlight">
                    <div className="section-heading compact">
                      <div>
                        <div className="eyebrow">Flagship boards</div>
                        <h2>Start from a board, not a single card</h2>
                      </div>
                      <a className="surface-link" href="/groups">
                        Browse all boards
                      </a>
                    </div>
                    <div className="board-spotlight-grid">
                      <a
                        className="surface-card spotlight-card spotlight-card-primary"
                        href={`/groups/${spotlightGroup.group.slug}`}
                      >
                        <span className="surface-kicker">
                          {spotlightGroup.family?.displayName ?? 'Mixed board'}
                        </span>
                        <strong>{spotlightGroup.group.title}</strong>
                        <p>
                          {spotlightGroup.heroMarket?.headline ??
                            spotlightGroup.group.description ??
                            'Reviewed board collecting accepted predictions.'}
                        </p>
                        <span className="surface-meta">
                          {spotlightGroup.openMarkets} open /{' '}
                          {spotlightGroup.totalMarkets} tracked
                        </span>
                      </a>
                      <div className="spotlight-card-stack">
                        {followupGroups.map((summary) => (
                          <a
                            key={summary.group.id}
                            className="surface-card spotlight-card spotlight-card-secondary"
                            href={`/groups/${summary.group.slug}`}
                          >
                            <span className="surface-kicker">
                              {summary.primaryEntity?.displayName ??
                                summary.family?.displayName ??
                                'Mixed board'}
                            </span>
                            <strong>{summary.group.title}</strong>
                            <p>
                              {summary.heroMarket?.headline ??
                                summary.group.description ??
                                'Reviewed prediction lane.'}
                            </p>
                          </a>
                        ))}
                      </div>
                    </div>
                  </section>
                ) : null}

                {featuredFamilies.length > 0 ? (
                  <section className="board-surface-panel">
                    <div className="section-heading compact">
                      <div>
                        <div className="eyebrow">Prediction families</div>
                        <h2>Live lanes</h2>
                      </div>
                      <a className="surface-link" href="/groups">
                        View all groups
                      </a>
                    </div>
                    <div className="surface-card-grid">
                      {featuredFamilies.map((summary) => (
                        <a
                          key={summary.family.id}
                          className="surface-card"
                          href="/groups"
                        >
                          <span className="surface-kicker">
                            {summary.openMarkets} open / {summary.totalMarkets}{' '}
                            tracked
                          </span>
                          <strong>{summary.family.displayName}</strong>
                          <p>
                            {summary.heroMarket?.headline ??
                              summary.family.description}
                          </p>
                          <span className="surface-meta">
                            {summary.activeGroups} live board
                            {summary.activeGroups === 1 ? '' : 's'}
                          </span>
                        </a>
                      ))}
                    </div>
                  </section>
                ) : null}

                {featuredGroups.length > 0 ? (
                  <section className="board-surface-panel">
                    <div className="section-heading compact">
                      <div>
                        <div className="eyebrow">Event groups</div>
                        <h2>Reviewed boards</h2>
                      </div>
                      <a className="surface-link" href="/groups">
                        Browse groups
                      </a>
                    </div>
                    <div className="surface-card-grid">
                      {featuredGroups.slice(0, 6).map((summary) => (
                        <a
                          key={summary.group.id}
                          className="surface-card surface-card-group"
                          href={`/groups/${summary.group.slug}`}
                        >
                          <span className="surface-kicker">
                            {summary.family?.displayName ?? 'Mixed board'}
                          </span>
                          <strong>{summary.group.title}</strong>
                          <p>
                            {summary.group.description ??
                              'Reviewed prediction lane.'}
                          </p>
                          <span className="surface-meta">
                            {summary.openMarkets} open / {summary.totalMarkets}{' '}
                            tracked
                          </span>
                        </a>
                      ))}
                    </div>
                  </section>
                ) : null}

                <div className="feed-sticky-chrome">
                  <section className="section-heading">
                    <div>
                      <div className="eyebrow">
                        {ownerSession ? 'Public archive' : 'Archive layer'}
                      </div>
                        <h2>{ownerSession ? 'Board archive' : 'Full prediction feed'}</h2>
                      <p className="feed-status">
                        Showing {renderedMarkets.length} of{' '}
                        {visibleMarkets.length} markets in the {archiveScopeLabel}{' '}
                        archive.
                      </p>
                    </div>
                    <div className="feed-controls">
                      <div className="filter-row">
                        {(['all', 'open', 'busted'] as MarketFilter[]).map(
                          (entry) => (
                            <button
                              key={entry}
                              type="button"
                              className={`filter-button ${
                                entry === 'all'
                                  ? statusFilters.length === 0
                                    ? 'active'
                                    : ''
                                  : statusFilters.includes(entry)
                                    ? 'active'
                                    : ''
                              }`}
                              onClick={() => {
                                const nextStatusFilters = toggleMarketStatusFilter(
                                  statusFilters,
                                  entry,
                                )
                                setStatusFilters(nextStatusFilters)
                                setSelectedMarketId(
                                  pickFirstVisibleMarketIdFromSnapshot(
                                    snapshot,
                                    nextStatusFilters,
                                    companyFilters,
                                  ),
                                )
                              }}
                            >
                              {entry}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  </section>

                  <section
                    className="archive-filter-panel"
                    aria-label="Company lanes"
                  >
                    <div className="archive-filter-panel-header">
                      <div>
                        <div className="eyebrow">Company filters</div>
                        <p className="archive-filter-summary">
                          {companyFilterSummary}
                        </p>
                      </div>
                      <label className="archive-filter-search">
                        <span>Find company</span>
                        <input
                          type="search"
                          value={companyFilterQuery}
                          onChange={(event) =>
                            setCompanyFilterQuery(event.target.value)
                          }
                          placeholder="Apple, OpenAI, NVIDIA..."
                        />
                      </label>
                    </div>

                    <div className="company-filter-grid">
                      {filteredCompanyTabs.map((entry) => (
                        <button
                          key={entry.value}
                          type="button"
                          className={`filter-button ${
                            entry.value === 'all'
                              ? companyFilters.length === 0
                                ? 'active'
                                : ''
                              : companyFilters.includes(entry.value)
                                ? 'active'
                                : ''
                          }`}
                          onClick={() => {
                            const nextCompanyFilters = toggleCompanyFilter(
                              companyFilters,
                              entry.value,
                            )
                            setCompanyFilters(nextCompanyFilters)
                            setSelectedMarketId(
                              pickFirstVisibleMarketIdFromSnapshot(
                                snapshot,
                                statusFilters,
                                nextCompanyFilters,
                              ),
                            )
                          }}
                        >
                          {entry.label}{' '}
                          <span className="filter-count">{entry.count}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                </div>

                {ownerSession ? null : (
                  <section className="season-surface-grid">
                    {seasonalSurfaces.map((surface) => (
                      <button
                        key={surface.key}
                        type="button"
                        className="season-surface"
                        onClick={() => {
                          if (surface.leadMarketId) {
                            setSelectedMarketId(surface.leadMarketId)
                          }
                        }}
                      >
                        <span className="eyebrow">{surface.title}</span>
                        <strong>{surface.count}</strong>
                        <p>{surface.description}</p>
                      </button>
                    ))}
                  </section>
                )}

                {renderedMarkets.length === 0 ? (
                  <p className="empty-copy feed-empty">
                    No markets match this filter yet.
                  </p>
                ) : (
                  <section className="archive-market-list">
                    {renderedMarkets.map((market) => (
                      <ArchiveMarketRow
                        key={market.id}
                        market={market}
                        selected={selectedMarketId === market.id}
                        onSelect={setSelectedMarketId}
                        onOpenForum={(marketId) => {
                          setSelectedMarketId(marketId)
                          setTopicMarketId(marketId)
                        }}
                      />
                    ))}
                  </section>
                )}

                <div className="feed-endcap">
                  <span>
                    {hasMoreMarkets
                      ? 'Scroll for older busted calls and deeper archive cards.'
                      : 'End of the current feed.'}
                  </span>
                </div>

                {supportTopicMarket ? (
                  <SupportTopicCard
                    market={supportTopicMarket}
                    onOpenForum={(marketId) => {
                      setSelectedMarketId(null)
                      setTopicMarketId(marketId)
                    }}
                  />
                ) : null}

              </div>
            </section>
          )}
        </main>

        <div className="side-column">
          {ownerSession ? <OwnerObservatory session={ownerSession} /> : null}
          {snapshot ? <HallOfFame entries={snapshot.hallOfFame} /> : null}

          <BetSlipPanel
            activeBets={
              snapshot?.bets.filter((bet) => bet.status === 'open') ?? []
            }
            bonusPercent={bonusPercent}
            selectedMarket={selectedMarket}
          />

          <NotificationRail notifications={snapshot?.notifications ?? []} />
        </div>
      </div>

      <LoginModal
        open={loginModalOpen}
        defaultMode={loginModalMode}
        claimView={claimView}
        onClaimViewChange={setClaimView}
        onClose={() => {
          setLoginModalOpen(false)
          if (claimView) {
            setClaimView(null)
            replaceUrlWithoutParams(['claim'])
          }
        }}
      />
    </div>
  )
}
