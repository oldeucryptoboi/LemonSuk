import React from 'react'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSeedStore } from '../../api/src/data/seed'
import { createDashboardSnapshot } from '../../api/src/services/bonus'
import App from './App'
import { supportMarketId } from './shared'
import { pickFirstVisibleMarketIdFromSnapshot } from './lib/board'

const apiMocks = vi.hoisted(() => ({
  fetchBoardFamilies: vi.fn(),
  fetchBoardGroups: vi.fn(),
  fetchClaimView: vi.fn(),
  fetchDashboard: vi.fn(),
  fetchOwnerSession: vi.fn(),
  runDiscovery: vi.fn(),
  subscribeToDashboard: vi.fn(() => () => undefined),
}))

vi.mock('./lib/api', () => apiMocks)

vi.mock('./components/AgentConsole', () => ({
  AgentConsole: ({
    query,
    report,
    ownerSessionToken,
    ownerEmail,
    onQueryChange,
    onRun,
    onOpenOwnerModal,
  }: {
    query: string
    report: { query: string } | null
    ownerSessionToken: string | null
    ownerEmail: string | null
    onQueryChange: (query: string) => void
    onRun: () => void
    onOpenOwnerModal: () => void
  }) => (
    <div>
      <span>{query}</span>
      <span>{report?.query ?? 'no-report'}</span>
      <span>{ownerSessionToken ?? 'no-owner-session'}</span>
      <span>{ownerEmail ?? 'no-owner-email'}</span>
      <button type="button" onClick={() => onQueryChange('fresh query')}>
        set query
      </button>
      <button type="button" onClick={onRun}>
        run discovery
      </button>
      <button type="button" onClick={onOpenOwnerModal}>
        open owner modal
      </button>
    </div>
  ),
}))

vi.mock('./components/BetSlipPanel', () => ({
  BetSlipPanel: ({
    selectedMarket,
  }: {
    selectedMarket: { id: string } | null
  }) => (
    <div>
      <span>{selectedMarket?.id ?? 'no-market'}</span>
      <span>agent-only slip</span>
    </div>
  ),
}))

vi.mock('./components/HallOfFame', () => ({
  HallOfFame: () => <div>hall of fame</div>,
}))

vi.mock('./components/HeroBanner', () => ({
  HeroBanner: ({
    onOpenOwnerModal,
    onOpenClaimModal,
  }: {
    onOpenOwnerModal: () => void
    onOpenClaimModal: () => void
  }) => (
    <div>
      <span>hero banner</span>
      <button type="button" onClick={onOpenOwnerModal}>
        hero owner
      </button>
      <button type="button" onClick={onOpenClaimModal}>
        hero claim
      </button>
    </div>
  ),
}))

vi.mock('./components/LoginModal', () => ({
  LoginModal: ({
    open,
    defaultMode,
    claimView,
    onClaimViewChange,
    onClose,
  }: {
    open: boolean
    defaultMode: string
    claimView: unknown
    onClaimViewChange: (claimView: unknown) => void
    onClose: () => void
  }) =>
    open ? (
      <div data-testid="login-modal">
        <span>{defaultMode}</span>
        <span>{claimView ? 'claim-view' : 'login-view'}</span>
        <button type="button" onClick={() => onClaimViewChange(null)}>
          clear claim
        </button>
        <button type="button" onClick={onClose}>
          close modal
        </button>
      </div>
    ) : null,
}))

vi.mock('./components/MarketForum', () => ({
  MarketForum: ({
    market,
    onBack,
  }: {
    market: { id: string } | null
    onBack: () => void
  }) => (
    <div>
      <span>{market?.id ?? 'no-forum-market'}</span>
      <span>market forum</span>
      <button type="button" onClick={onBack}>
        close forum
      </button>
    </div>
  ),
}))

vi.mock('./components/MarketCard', () => ({
  MarketCard: ({
    market,
    onSelect,
    onOpenForum,
  }: {
    market: { id: string; headline: string }
    onSelect: (id: string) => void
    onOpenForum: (id: string) => void
  }) => (
    <div>
      <button type="button" onClick={() => onSelect(market.id)}>
        {market.headline}
      </button>
      <button type="button" onClick={() => onOpenForum(market.id)}>
        forum {market.id}
      </button>
    </div>
  ),
}))

vi.mock('./components/NotificationRail', () => ({
  NotificationRail: () => <div>notifications</div>,
}))

vi.mock('./components/OwnerObservatory', () => ({
  OwnerObservatory: ({ session }: { session: { ownerEmail: string } }) => (
    <div>{session.ownerEmail}</div>
  ),
}))

function setPageMetrics({
  scrollHeight = 2400,
  innerHeight = 900,
  scrollY = 0,
}: {
  scrollHeight?: number
  innerHeight?: number
  scrollY?: number
}) {
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  })
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: innerHeight,
    writable: true,
  })
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    value: scrollY,
    writable: true,
  })
}

describe('App', () => {
  const baseSnapshot = createDashboardSnapshot(
    createSeedStore(),
    new Date('2026-03-16T00:00:00.000Z'),
  )

  beforeEach(() => {
    vi.resetAllMocks()
    apiMocks.fetchBoardFamilies.mockResolvedValue([])
    apiMocks.fetchBoardGroups.mockResolvedValue([])
    apiMocks.subscribeToDashboard.mockReturnValue(() => undefined)
    const storage = new Map<string, string>()

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: () => storage.clear(),
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => {
          storage.delete(key)
        },
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        },
      },
    })

    window.localStorage.clear()
    window.history.pushState({}, '', '/')
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    })
    setPageMetrics({})
  })

  afterEach(() => {
    window.history.pushState({}, '', '/')
  })

  it('loads the board, handles owner and claim params, and runs discovery', async () => {
    const user = userEvent.setup()
    const openSpacexMarket = baseSnapshot.markets.find(
      (market) => market.company === 'spacex' && market.status === 'open',
    )!
    const q4LeadMarket = baseSnapshot.markets.find((market) => {
      const promised = new Date(market.promisedDate)
      return (
        market.status === 'open' &&
        promised.getUTCFullYear() === 2026 &&
        promised.getUTCMonth() >= 9
      )
    })!

    apiMocks.fetchDashboard.mockResolvedValue(baseSnapshot)
    apiMocks.fetchClaimView.mockResolvedValue({
      agent: {
        id: 'agent-1',
        handle: 'deadlinebot',
        displayName: 'Deadline Bot',
        ownerName: 'Owner',
        modelProvider: 'OpenAI',
        biography: 'Tracks deadlines.',
        ownerEmail: null,
        ownerVerifiedAt: null,
        createdAt: '2026-03-16T00:00:00.000Z',
        claimUrl: '/?claim=claim_1',
        challengeUrl: '/api/v1/auth/claims/claim_1',
        verificationPhrase: 'busted-oracle-42',
      },
      claimInstructions: 'Confirm the phrase.',
    })
    apiMocks.fetchOwnerSession.mockResolvedValue({
      sessionToken: 'owner_1',
      ownerEmail: 'owner@example.com',
      expiresAt: '2026-03-18T00:00:00.000Z',
      agents: [],
      bets: [],
      notifications: [],
    })
    apiMocks.runDiscovery.mockResolvedValue({
      report: {
        query: 'fresh query',
        searchedAt: '2026-03-16T00:00:00.000Z',
        resultCount: 3,
        candidateCount: 1,
        createdMarketIds: ['market-9'],
        updatedMarketIds: [],
        discardedResults: [],
      },
      snapshot: baseSnapshot,
    })

    window.history.pushState({}, '', '/?claim=claim_1&owner_session=owner_1')
    render(<App />)

    await waitFor(() => {
      expect(
        screen.getByText('Owner deck opened for owner@example.com.'),
      ).not.toBeNull()
    })
    expect(screen.getByText('Q2 close')).not.toBeNull()
    expect(screen.getByText('Year-end graveyard')).not.toBeNull()
    expect(screen.getByText(/Signed in as/i)).not.toBeNull()
    expect(screen.getAllByText('owner@example.com').length).toBeGreaterThan(0)
    expect(window.localStorage.getItem('lemonsuk.ownerSessionToken')).toBe(
      'owner_1',
    )
    expect(window.location.search).toBe('?claim=claim_1')
    expect(screen.getByTestId('login-modal')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'close modal' }))
    expect(window.location.search).toBe('')

    await user.click(screen.getByRole('button', { name: 'Log out' }))
    expect(screen.getByText('Not signed in')).not.toBeNull()
    expect(window.localStorage.getItem('lemonsuk.ownerSessionToken')).toBeNull()

    const subscribeCalls = vi.mocked(apiMocks.subscribeToDashboard).mock
      .calls as unknown as Array<[(snapshot: typeof baseSnapshot) => void]>
    const liveSubscription = subscribeCalls[0]?.[0]
    if (!liveSubscription) {
      throw new Error('Expected dashboard subscription callback.')
    }
    liveSubscription(baseSnapshot)
    await waitFor(() => {
      expect(screen.queryByText('End of the current feed.')).toBeNull()
    })

    await user.click(
      screen.getByRole('button', { name: /Q4 deadline cluster/i }),
    )
    expect(screen.getByText(q4LeadMarket.id)).not.toBeNull()

    const companyLaneSection = screen.getByLabelText('Company lanes')
    await user.click(
      within(companyLaneSection).getByRole('button', {
        name: /SpaceX/i,
      }),
    )
    expect(screen.getByText(/SpaceX archive\./)).not.toBeNull()

    await user.click(
      screen.getByRole('button', {
        name: openSpacexMarket.headline,
      }),
    )
    expect(screen.getByText(openSpacexMarket.id)).not.toBeNull()
    expect(screen.getByText('agent-only slip')).not.toBeNull()
    expect(screen.queryByText('market forum')).toBeNull()

    await user.click(
      screen.getByRole('button', {
        name: `forum ${openSpacexMarket.id}`,
      }),
    )
    expect(screen.getAllByText(openSpacexMarket.id)).toHaveLength(2)
    expect(screen.getByText('market forum')).not.toBeNull()

    liveSubscription(baseSnapshot)
    await waitFor(() => {
      expect(screen.getByText('market forum')).not.toBeNull()
    })

    await user.click(screen.getByRole('button', { name: 'close forum' }))
    expect(screen.queryByText('market forum')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'set query' }))
    await user.click(screen.getByRole('button', { name: 'run discovery' }))

    expect(apiMocks.runDiscovery).toHaveBeenCalledWith('fresh query')
    expect(
      await screen.findByText(/Discovery scanned 3 results/),
    ).not.toBeNull()
    expect(screen.getAllByText('fresh query')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'busted' }))
    expect(screen.getByText('No cards match this filter yet.')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'all' }))
    expect(screen.getByText('End of the current feed.')).not.toBeNull()
    expect(screen.getByText('Support and issue reports')).not.toBeNull()
    await user.click(
      within(
        screen
          .getByText('Support and issue reports')
          .closest('section') as HTMLElement,
      ).getByRole('button', { name: 'Open topic' }),
    )
    expect(screen.getByText(supportMarketId)).not.toBeNull()
  })

  it('renders family and group board surfaces when catalog summaries are available', async () => {
    apiMocks.fetchDashboard.mockResolvedValue(baseSnapshot)
    apiMocks.fetchBoardFamilies.mockResolvedValue([
      {
        family: {
          id: 'family_ai_launch',
          slug: 'ai_launch',
          displayName: 'AI launches',
          description: 'AI launch markets.',
          defaultResolutionMode: 'deadline',
          defaultTimeHorizon: '30d',
          status: 'active',
        },
        totalMarkets: 4,
        openMarkets: 3,
        activeGroups: 2,
        primaryEntities: [],
        heroMarket: baseSnapshot.markets[0]!,
      },
    ])
    apiMocks.fetchBoardGroups.mockResolvedValue([
      {
        group: {
          id: 'group_openai_release_radar',
          slug: 'openai-release-radar',
          title: 'OpenAI release radar',
          description: null,
          familyId: 'family_ai_launch',
          primaryEntityId: 'entity_openai',
          heroMarketId: null,
          startAt: null,
          endAt: null,
          status: 'active',
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z',
        },
        family: {
          id: 'family_ai_launch',
          slug: 'ai_launch',
          displayName: 'AI launches',
          description: 'AI launch markets.',
          defaultResolutionMode: 'deadline',
          defaultTimeHorizon: '30d',
          status: 'active',
        },
        primaryEntity: null,
        totalMarkets: 2,
        openMarkets: 1,
        heroMarket: baseSnapshot.markets[0]!,
      },
      {
        group: {
          id: 'group_mixed_board',
          slug: 'mixed-board',
          title: 'Cross-family board',
          description: 'Cross-family review lane.',
          familyId: null,
          primaryEntityId: null,
          heroMarketId: null,
          startAt: null,
          endAt: null,
          status: 'active',
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z',
        },
        family: undefined as never,
        primaryEntity: null,
        totalMarkets: 1,
        openMarkets: 1,
        heroMarket: baseSnapshot.markets[0]!,
      },
    ])

    render(<App />)

    await screen.findByText('Live lanes')
    expect(screen.getAllByText('AI launches').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Reviewed boards')).not.toBeNull()
    expect(screen.getAllByText('OpenAI release radar').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Cross-family board').length).toBeGreaterThanOrEqual(1)
    expect(
      screen.getAllByText('Mixed board', { selector: '.surface-kicker' }).length,
    ).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Reviewed prediction lane.')).not.toBeNull()
    expect(screen.getByText('Cross-family review lane.')).not.toBeNull()
  })

  it('renders board-surface fallback copy when hero markets and descriptions are missing', async () => {
    apiMocks.fetchDashboard.mockResolvedValue(baseSnapshot)
    apiMocks.fetchBoardFamilies.mockResolvedValue([
      {
        family: {
          id: 'family_ceo_claim',
          slug: 'ceo_claim',
          displayName: 'CEO claims',
          description: 'Direct public deadline claims.',
          defaultResolutionMode: 'deadline',
          defaultTimeHorizon: '30d',
          status: 'active',
        },
        totalMarkets: 3,
        openMarkets: 1,
        activeGroups: 1,
        primaryEntities: [],
        heroMarket: null,
      },
    ])
    apiMocks.fetchBoardGroups.mockResolvedValue([
      {
        group: {
          id: 'group_flagship',
          slug: 'flagship-board',
          title: 'Flagship board',
          description: null,
          familyId: 'family_ceo_claim',
          primaryEntityId: null,
          heroMarketId: null,
          startAt: null,
          endAt: null,
          status: 'active',
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z',
        },
        family: undefined as never,
        primaryEntity: null,
        totalMarkets: 2,
        openMarkets: 1,
        heroMarket: null,
      },
      {
        group: {
          id: 'group_followup',
          slug: 'followup-board',
          title: 'Follow-up board',
          description: null,
          familyId: null,
          primaryEntityId: null,
          heroMarketId: null,
          startAt: null,
          endAt: null,
          status: 'active',
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z',
        },
        family: {
          id: 'family_ceo_claim',
          slug: 'ceo_claim',
          displayName: 'CEO claims',
          description: 'Direct public deadline claims.',
          defaultResolutionMode: 'deadline',
          defaultTimeHorizon: '30d',
          status: 'active',
        },
        primaryEntity: {
          id: 'entity_apple',
          slug: 'apple',
          displayName: 'Apple',
          entityType: 'company',
          status: 'active',
        },
        totalMarkets: 1,
        openMarkets: 0,
        heroMarket: null,
      },
      {
        group: {
          id: 'group_family-followup',
          slug: 'family-followup-board',
          title: 'Family follow-up board',
          description: null,
          familyId: 'family_ceo_claim',
          primaryEntityId: null,
          heroMarketId: null,
          startAt: null,
          endAt: null,
          status: 'active',
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z',
        },
        family: {
          id: 'family_ceo_claim',
          slug: 'ceo_claim',
          displayName: 'CEO claims',
          description: 'Direct public deadline claims.',
          defaultResolutionMode: 'deadline',
          defaultTimeHorizon: '30d',
          status: 'active',
        },
        primaryEntity: null,
        totalMarkets: 1,
        openMarkets: 1,
        heroMarket: null,
      },
    ])

    render(<App />)

    await screen.findByText('Start from a board, not a single card')
    expect(
      screen.getByText('Reviewed board collecting accepted predictions.'),
    ).not.toBeNull()
    expect(
      screen.getAllByText('Mixed board', { selector: '.surface-kicker' }).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText('Apple', { selector: '.surface-kicker' })).not.toBeNull()
    expect(
      screen.getAllByText('CEO claims', { selector: '.surface-kicker' }).length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('Reviewed prediction lane.').length).toBeGreaterThan(0)
    expect(screen.getByText('Direct public deadline claims.')).not.toBeNull()
  })

  it('opens manual login and clears rejected session tokens', async () => {
    const user = userEvent.setup()

    apiMocks.fetchDashboard.mockResolvedValue({
      ...baseSnapshot,
      markets: [],
    })
    apiMocks.fetchClaimView.mockRejectedValue(new Error('missing claim'))
    apiMocks.fetchOwnerSession.mockRejectedValue(new Error('bad session'))

    window.localStorage.setItem('lemonsuk.ownerSessionToken', 'stale-session')
    window.history.pushState({}, '', '/?claim=missing')
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('No cards match this filter yet.')).not.toBeNull()
    })
    expect(window.localStorage.getItem('lemonsuk.ownerSessionToken')).toBeNull()

    await user.click(screen.getAllByRole('button', { name: 'Owner login' })[0]!)
    expect(screen.getByTestId('login-modal')).not.toBeNull()
    expect(screen.getByText('owner')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'close modal' }))
    await user.click(screen.getByRole('button', { name: 'open owner modal' }))
    expect(screen.getByTestId('login-modal')).not.toBeNull()
    expect(screen.getByText('owner')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'close modal' }))
    await user.click(screen.getByRole('button', { name: 'hero owner' }))
    expect(screen.getByTestId('login-modal')).not.toBeNull()
    expect(screen.getByText('owner')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'close modal' }))
    await user.click(screen.getByRole('button', { name: 'hero claim' }))
    expect(screen.getByTestId('login-modal')).not.toBeNull()
    expect(screen.getByText('claim')).not.toBeNull()
  })

  it('picks the first visible market from a snapshot or returns null', () => {
    expect(pickFirstVisibleMarketIdFromSnapshot(null, 'all', 'all')).toBeNull()
    expect(
      pickFirstVisibleMarketIdFromSnapshot(baseSnapshot, 'open', 'spacex'),
    ).toBe(
      baseSnapshot.markets.find(
        (market) => market.company === 'spacex' && market.status === 'open',
      )?.id ?? null,
    )
  })

  it('selects the first market when the dashboard has no open cards', async () => {
    apiMocks.fetchDashboard.mockResolvedValue({
      ...baseSnapshot,
      markets: [
        {
          ...baseSnapshot.markets[0]!,
          id: 'market-fallback',
          status: 'busted',
          betWindowOpen: false,
        },
      ],
    })

    render(<App />)

    expect(await screen.findByText('hero banner')).not.toBeNull()
    expect(screen.getByText('market-fallback')).not.toBeNull()
  })

  it('filters the board down to open cards when requested', async () => {
    const user = userEvent.setup()
    const filteredSnapshot = {
      ...baseSnapshot,
      markets: baseSnapshot.markets.map((market, index) =>
        index === 0
          ? {
              ...market,
              status: 'busted' as const,
              betWindowOpen: false,
            }
          : market,
      ),
    }
    const openMarket = filteredSnapshot.markets.find(
      (market) => market.id !== supportMarketId && market.status === 'open',
    )!
    const bustedMarket = filteredSnapshot.markets[0]!

    apiMocks.fetchDashboard.mockResolvedValue(filteredSnapshot)

    render(<App />)

    expect(await screen.findByText('hero banner')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'open' }))

    expect(
      screen.getByRole('button', {
        name: openMarket.headline,
      }),
    ).not.toBeNull()
    expect(
      screen.queryByRole('button', {
        name: bustedMarket.headline,
      }),
    ).toBeNull()
  })

  it('does not open the login modal from scroll alone', async () => {
    apiMocks.fetchDashboard.mockResolvedValue({
      ...baseSnapshot,
    })

    render(<App />)
    expect(await screen.findByText('hero banner')).not.toBeNull()
    await screen.findByRole('button', {
      name: baseSnapshot.markets[0]?.headline ?? '',
    })

    setPageMetrics({
      scrollHeight: 2400,
      innerHeight: 800,
      scrollY: 60,
    })
    fireEvent.scroll(window)
    expect(screen.queryByTestId('login-modal')).toBeNull()
  })

  it('shows fallback discovery error copy after scrolling near the bottom', async () => {
    apiMocks.fetchDashboard.mockResolvedValue(baseSnapshot)
    apiMocks.runDiscovery.mockRejectedValueOnce('discovery failed')

    render(<App />)
    expect(await screen.findByText('hero banner')).not.toBeNull()
    await screen.findByRole('button', {
      name: baseSnapshot.markets[0]?.headline ?? '',
    })

    setPageMetrics({
      scrollHeight: 2000,
      innerHeight: 300,
      scrollY: 1450,
    })
    fireEvent.scroll(window)
    fireEvent.scroll(window)

    fireEvent.click(screen.getByRole('button', { name: 'run discovery' }))
    expect(await screen.findByText('Discovery failed.')).not.toBeNull()
  })

  it('auto-expands the feed when the page is shorter than the viewport', async () => {
    apiMocks.fetchDashboard.mockResolvedValue({
      ...baseSnapshot,
      markets: baseSnapshot.markets.slice(0, 5),
    })

    setPageMetrics({
      scrollHeight: 640,
      innerHeight: 900,
      scrollY: 0,
    })

    render(<App />)

    expect(await screen.findByText('hero banner')).not.toBeNull()
    expect(
      await screen.findByText('Showing 5 of 5 cards in the full archive.'),
    ).not.toBeNull()
  })

  it('shows dashboard and discovery errors', async () => {
    apiMocks.fetchDashboard.mockRejectedValueOnce(new Error('board offline'))

    const { unmount } = render(<App />)
    expect(await screen.findByText('board offline')).not.toBeNull()
    unmount()

    apiMocks.fetchDashboard.mockRejectedValueOnce('board offline')
    const fallbackLoad = render(<App />)
    expect(await screen.findByText('Unable to load the board.')).not.toBeNull()
    fallbackLoad.unmount()

    apiMocks.fetchDashboard.mockResolvedValue(baseSnapshot)
    apiMocks.runDiscovery.mockRejectedValueOnce(new Error('discovery failed'))

    render(<App />)
    expect(await screen.findByText('hero banner')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'run discovery' }))
    expect(await screen.findByText('discovery failed')).not.toBeNull()
  })
})
