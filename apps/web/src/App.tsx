'use client'

import React from 'react'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'

import {
  supportMarketId,
  type ClaimView,
  type DashboardSnapshot,
  type DiscoveryReport,
  type OwnerSession,
} from './shared'
import { AgentConsole } from './components/AgentConsole'
import { BetSlipPanel } from './components/BetSlipPanel'
import { HallOfFame } from './components/HallOfFame'
import { HeroBanner } from './components/HeroBanner'
import { LoginModal } from './components/LoginModal'
import { MarketForum } from './components/MarketForum'
import { MarketCard } from './components/MarketCard'
import { NotificationRail } from './components/NotificationRail'
import { OwnerObservatory } from './components/OwnerObservatory'
import { SupportTopicCard } from './components/SupportTopicCard'
import {
  fetchClaimView,
  fetchDashboard,
  fetchOwnerSession,
  runDiscovery,
  subscribeToDashboard,
} from './lib/api'
import {
  companyLabel,
  createCompanyTabs,
  createSeasonalSurfaces,
  isBoardMarket,
  type CompanyFilter,
} from './lib/markets'
import {
  pickFirstVisibleMarketIdFromSnapshot,
  type MarketFilter,
} from './lib/board'

const feedPageSize = 4
const pageScrollLoadAhead = 280
const secondCardPromptOffset = 160
const ownerSessionStorageKey = 'lemonsuk.ownerSessionToken'

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

export default function App() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null)
  const [topicMarketId, setTopicMarketId] = useState<string | null>(null)
  const [filter, setFilter] = useState<MarketFilter>('all')
  const [companyFilter, setCompanyFilter] = useState<CompanyFilter>('all')
  const [agentQuery, setAgentQuery] = useState(
    'Elon Musk Tesla SpaceX X xAI Neuralink Boring SolarCity Hyperloop DOGE deadline promises',
  )
  const [report, setReport] = useState<DiscoveryReport | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [runningAgent, setRunningAgent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [visibleMarketCount, setVisibleMarketCount] = useState(feedPageSize)
  const [loginModalOpen, setLoginModalOpen] = useState(false)
  const [loginModalMode, setLoginModalMode] = useState<'claim' | 'owner'>(
    'claim',
  )
  const [loginPromptShown, setLoginPromptShown] = useState(false)
  const [ownerSession, setOwnerSession] = useState<OwnerSession | null>(null)
  const [claimView, setClaimView] = useState<ClaimView | null>(null)
  const [, startTransition] = useTransition()
  const secondCardRef = useRef<HTMLDivElement | null>(null)

  const applySnapshot = useCallback((
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
  }, [])

  const refreshDashboard = useCallback(async () => {
    setLoading(true)
    try {
      applySnapshot(await fetchDashboard(), {
        preserveSelection: false,
      })
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load the board.',
      )
    } finally {
      setLoading(false)
    }
  }, [applySnapshot])

  useEffect(() => {
    void refreshDashboard()
    const unsubscribe = subscribeToDashboard((nextSnapshot) => {
      applySnapshot(nextSnapshot)
      setLoading(false)
      setError(null)
    })

    const params = new URLSearchParams(window.location.search)
    const claimToken = params.get('claim')
    const sessionToken =
      params.get('owner_session') ??
      window.localStorage.getItem(ownerSessionStorageKey)

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
  }, [applySnapshot, refreshDashboard])

  const boardMarkets = snapshot?.markets.filter(isBoardMarket) ?? []
  const supportTopicMarket =
    snapshot?.markets.find((market) => market.id === supportMarketId) ?? null
  const visibleMarkets =
    boardMarkets.filter((market) => {
      if (companyFilter !== 'all' && market.company !== companyFilter) {
        return false
      }

      if (filter === 'all') {
        return true
      }

      return market.status === filter
    }) ?? []
  const renderedMarkets = visibleMarkets.slice(0, visibleMarketCount)
  const hasMoreMarkets = renderedMarkets.length < visibleMarkets.length

  const selectedMarket =
    boardMarkets.find((market) => market.id === selectedMarketId) ??
    boardMarkets.find((market) => market.status === 'open') ??
    null
  const topicMarket =
    snapshot?.markets.find((market) => market.id === topicMarketId) ?? null
  const companyTabs = createCompanyTabs(boardMarkets)
  const seasonalSurfaces = createSeasonalSurfaces(
    boardMarkets,
    snapshot?.now ?? new Date().toISOString(),
  )

  const bonusPercent = snapshot?.stats.globalBonusPercent ?? 0
  const agentInstructionsUrl = '/agent.md'

  useEffect(() => {
    setVisibleMarketCount(Math.min(feedPageSize, visibleMarkets.length))
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [companyFilter, filter, visibleMarkets.length])

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

  useEffect(() => {
    function handlePageScroll() {
      const remainingDistance =
        document.documentElement.scrollHeight -
        (window.scrollY + window.innerHeight)

      if (hasMoreMarkets && remainingDistance < pageScrollLoadAhead) {
        setVisibleMarketCount((current) =>
          Math.min(current + feedPageSize, visibleMarkets.length),
        )
      }

      if (
        loginPromptShown ||
        ownerSession ||
        loginModalOpen ||
        topicMarket ||
        window.scrollY < 36
      ) {
        return
      }

      const secondCard = secondCardRef.current
      if (!secondCard) {
        return
      }

      if (secondCard.getBoundingClientRect().top <= secondCardPromptOffset) {
        setLoginPromptShown(true)
        setLoginModalMode('owner')
        setLoginModalOpen(true)
      }
    }

    window.addEventListener('scroll', handlePageScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handlePageScroll)
    }
  }, [
    hasMoreMarkets,
    loginModalOpen,
    loginPromptShown,
    ownerSession,
    topicMarket,
    visibleMarkets.length,
  ])

  async function handleRunDiscovery() {
    setRunningAgent(true)
    setError(null)

    try {
      const response = await runDiscovery(agentQuery)
      applySnapshot(response.snapshot)
      startTransition(() => {
        setReport(response.report)
      })
      setMessage(
        `Discovery scanned ${response.report.resultCount} results and wrote ${response.report.createdMarketIds.length} new cards.`,
      )
    } catch (discoveryError) {
      setError(
        discoveryError instanceof Error
          ? discoveryError.message
          : 'Discovery failed.',
      )
    } finally {
      setRunningAgent(false)
    }
  }

  return (
    <div className="app-shell">
      {snapshot ? (
        <HeroBanner
          snapshot={snapshot}
          agentInstructionsUrl={agentInstructionsUrl}
          onOpenOwnerModal={() => {
            setLoginModalMode('claim')
            setLoginModalOpen(true)
          }}
        />
      ) : null}

      <div className="message-strip">
        {loading ? <span>Loading the board…</span> : null}
        {message ? <span>{message}</span> : null}
        {error ? <span className="error-text">{error}</span> : null}
      </div>

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
                <div className="feed-sticky-chrome">
                  <section className="section-heading">
                    <div>
                      <div className="eyebrow">The book</div>
                      <h2>Deadline cards</h2>
                      <p className="feed-status">
                        Showing {renderedMarkets.length} of {visibleMarkets.length}{' '}
                        cards in the{' '}
                        {companyFilter === 'all' ? 'full' : companyLabel(companyFilter)}{' '}
                        feed.
                      </p>
                    </div>
                    <div className="feed-controls">
                      {!ownerSession ? (
                        <button
                          type="button"
                          className="filter-button"
                          onClick={() => {
                            setLoginModalMode('owner')
                            setLoginModalOpen(true)
                          }}
                        >
                          owner deck
                        </button>
                      ) : null}
                      <div className="filter-row">
                        {(['all', 'open', 'busted'] as MarketFilter[]).map((entry) => (
                          <button
                            key={entry}
                            type="button"
                            className={`filter-button ${filter === entry ? 'active' : ''}`}
                            onClick={() => {
                              setFilter(entry)
                              setSelectedMarketId(
                                pickFirstVisibleMarketIdFromSnapshot(
                                  snapshot,
                                  entry,
                                  companyFilter,
                                ),
                              )
                            }}
                          >
                            {entry}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>

                  <section className="company-tab-row" aria-label="Company lanes">
                    {companyTabs.map((entry) => (
                      <button
                        key={entry.value}
                        type="button"
                        className={`filter-button ${companyFilter === entry.value ? 'active' : ''}`}
                        onClick={() => {
                          setCompanyFilter(entry.value)
                          setSelectedMarketId(
                            pickFirstVisibleMarketIdFromSnapshot(
                              snapshot,
                              filter,
                              entry.value,
                            ),
                          )
                        }}
                      >
                        {entry.label}{' '}
                        <span className="filter-count">{entry.count}</span>
                      </button>
                    ))}
                  </section>
                </div>

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

                {renderedMarkets.length === 0 ? (
                  <p className="empty-copy feed-empty">
                    No cards match this filter yet.
                  </p>
                ) : (
                  <section className="market-grid">
                    {renderedMarkets.map((market, index) => (
                      <div
                        key={market.id}
                        ref={index === 1 ? secondCardRef : undefined}
                        className="market-card-slot"
                      >
                        <MarketCard
                          market={market}
                          selected={selectedMarketId === market.id}
                          onSelect={setSelectedMarketId}
                          onOpenForum={(marketId) => {
                            setSelectedMarketId(marketId)
                            setTopicMarketId(marketId)
                          }}
                        />
                      </div>
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

                <AgentConsole
                  query={agentQuery}
                  report={report}
                  running={runningAgent}
                  onQueryChange={setAgentQuery}
                  onRun={handleRunDiscovery}
                />
              </div>
            </section>
          )}
        </main>

        <div className="side-column">
          {ownerSession ? <OwnerObservatory session={ownerSession} /> : null}
          {snapshot ? <HallOfFame entries={snapshot.hallOfFame} /> : null}

          <BetSlipPanel
            activeBets={snapshot?.bets.filter((bet) => bet.status === 'open') ?? []}
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
