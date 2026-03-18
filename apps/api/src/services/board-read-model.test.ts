import { describe, expect, it } from 'vitest'

import { createSeedStore } from '../data/seed'
import {
  dashboardSnapshotSchema,
  entitySchema,
  eventGroupSchema,
  predictionFamilySchema,
  storeSchema,
} from '../shared'
import { createDashboardSnapshot } from './bonus'
import {
  createBoardEventGroupSummaries,
  createBoardFamilySummaries,
  createEventGroupDetail,
  createMarketDetail,
} from './board-read-model'

function buildCatalog() {
  const families = [
    predictionFamilySchema.parse({
      id: 'family_ai_launch',
      slug: 'ai_launch',
      displayName: 'AI launches',
      description: 'AI launch markets.',
      defaultResolutionMode: 'deadline',
      defaultTimeHorizon: '30d',
      status: 'active',
    }),
    predictionFamilySchema.parse({
      id: 'family_product_ship_date',
      slug: 'product_ship_date',
      displayName: 'Product ship dates',
      description: 'Product ship-date markets.',
      defaultResolutionMode: 'deadline',
      defaultTimeHorizon: '30d',
      status: 'active',
    }),
    predictionFamilySchema.parse({
      id: 'family_earnings_guidance',
      slug: 'earnings_guidance',
      displayName: 'Earnings / guidance misses',
      description: 'Guidance markets.',
      defaultResolutionMode: 'reported_outcome',
      defaultTimeHorizon: 'quarter',
      status: 'active',
    }),
    predictionFamilySchema.parse({
      id: 'family_policy_promise',
      slug: 'policy_promise',
      displayName: 'Government / policy promises',
      description: 'Policy promise markets.',
      defaultResolutionMode: 'deadline',
      defaultTimeHorizon: 'quarter',
      status: 'active',
    }),
    predictionFamilySchema.parse({
      id: 'family_ceo_claim',
      slug: 'ceo_claim',
      displayName: 'Creator / CEO claims',
      description: 'CEO claim markets.',
      defaultResolutionMode: 'deadline',
      defaultTimeHorizon: '30d',
      status: 'active',
    }),
  ]

  const entities = [
    entitySchema.parse({
      id: 'entity_elon_musk',
      slug: 'elon-musk',
      displayName: 'Elon Musk',
      entityType: 'person',
      status: 'active',
      aliases: ['elon'],
    }),
    entitySchema.parse({
      id: 'entity_doge',
      slug: 'doge',
      displayName: 'DOGE',
      entityType: 'government_body',
      status: 'active',
      aliases: [],
    }),
    entitySchema.parse({
      id: 'entity_apple',
      slug: 'apple',
      displayName: 'Apple',
      entityType: 'company',
      status: 'active',
      aliases: [],
    }),
    entitySchema.parse({
      id: 'entity_openai',
      slug: 'openai',
      displayName: 'OpenAI',
      entityType: 'company',
      status: 'active',
      aliases: [],
    }),
    entitySchema.parse({
      id: 'entity_anthropic',
      slug: 'anthropic',
      displayName: 'Anthropic',
      entityType: 'company',
      status: 'active',
      aliases: ['claude'],
    }),
    entitySchema.parse({
      id: 'entity_meta',
      slug: 'meta',
      displayName: 'Meta',
      entityType: 'company',
      status: 'active',
      aliases: [],
    }),
    entitySchema.parse({
      id: 'entity_tesla',
      slug: 'tesla',
      displayName: 'Tesla',
      entityType: 'company',
      status: 'active',
      aliases: [],
    }),
  ]

  const groups = [
    eventGroupSchema.parse({
      id: 'group_musk_deadline_board',
      slug: 'musk-deadline-board',
      title: 'Musk deadline board',
      description: 'Musk claims and deadlines.',
      familyId: 'family_ceo_claim',
      primaryEntityId: 'entity_elon_musk',
      status: 'active',
      startAt: null,
      endAt: null,
      heroMarketId: null,
      createdAt: '2026-03-18T00:00:00.000Z',
      updatedAt: '2026-03-18T00:00:00.000Z',
    }),
    eventGroupSchema.parse({
      id: 'group_doge_savings_watch',
      slug: 'doge-savings-watch',
      title: 'DOGE savings watch',
      description: 'DOGE policy watch.',
      familyId: 'family_policy_promise',
      primaryEntityId: 'entity_doge',
      status: 'active',
      startAt: null,
      endAt: null,
      heroMarketId: null,
      createdAt: '2026-03-18T00:00:00.000Z',
      updatedAt: '2026-03-18T00:00:00.000Z',
    }),
    eventGroupSchema.parse({
      id: 'group_apple_launch_calendar',
      slug: 'apple-launch-calendar',
      title: 'Apple launch calendar',
      description: 'Apple launch windows.',
      familyId: 'family_product_ship_date',
      primaryEntityId: 'entity_apple',
      status: 'active',
      startAt: null,
      endAt: null,
      heroMarketId: null,
      createdAt: '2026-03-18T00:00:00.000Z',
      updatedAt: '2026-03-18T00:00:00.000Z',
    }),
    eventGroupSchema.parse({
      id: 'group_openai_release_radar',
      slug: 'openai-release-radar',
      title: 'OpenAI release radar',
      description: 'OpenAI launches.',
      familyId: 'family_ai_launch',
      primaryEntityId: 'entity_openai',
      status: 'active',
      startAt: null,
      endAt: null,
      heroMarketId: null,
      createdAt: '2026-03-18T00:00:00.000Z',
      updatedAt: '2026-03-18T00:00:00.000Z',
    }),
    eventGroupSchema.parse({
      id: 'group_meta_ai_watch',
      slug: 'meta-ai-watch',
      title: 'Meta AI watch',
      description: 'Meta AI launches.',
      familyId: 'family_ai_launch',
      primaryEntityId: 'entity_meta',
      status: 'active',
      startAt: null,
      endAt: null,
      heroMarketId: null,
      createdAt: '2026-03-18T00:00:00.000Z',
      updatedAt: '2026-03-18T00:00:00.000Z',
    }),
    eventGroupSchema.parse({
      id: 'group_general_board_watch',
      slug: 'general-board-watch',
      title: 'General board watch',
      description: null,
      familyId: null,
      primaryEntityId: null,
      status: 'draft',
      startAt: null,
      endAt: null,
      heroMarketId: null,
      createdAt: '2026-03-18T00:00:00.000Z',
      updatedAt: '2026-03-18T00:00:00.000Z',
    }),
  ]

  return {
    families,
    entities,
    groups,
  }
}

function buildSnapshot() {
  const store = createSeedStore()
  const baseMarket = store.markets.find((market) => market.id !== 'lemonsuk-support-and-issues')

  if (!baseMarket) {
    throw new Error('Expected seed store to contain at least one board market.')
  }

  const extendedStore = storeSchema.parse({
    ...store,
    markets: [
      ...store.markets,
      {
        ...baseMarket,
        id: 'apple-oled-macbook-2027',
        slug: 'apple-oled-macbook-2027',
        headline: 'Apple ships an OLED MacBook Pro by October 31, 2027',
        subject: 'Apple MacBook Pro',
        category: 'vehicle' as const,
        promisedBy: 'Mark Gurman',
        summary: 'Apple ships an OLED MacBook Pro on the reported 2027 window.',
        promisedDate: '2027-10-31T23:59:59.000Z',
        announcedOn: '2026-05-01T00:00:00.000Z',
        tags: ['apple', 'macbook', 'oled'],
      },
      {
        ...baseMarket,
        id: 'openai-gpt5-summer-2026',
        slug: 'openai-gpt5-summer-2026',
        headline: 'OpenAI launches GPT-5 by August 31, 2026',
        subject: 'OpenAI GPT-5',
        category: 'ai' as const,
        promisedBy: 'Sam Altman',
        summary: 'OpenAI ships GPT-5 within the summer 2026 window.',
        promisedDate: '2026-08-31T23:59:59.000Z',
        announcedOn: '2026-03-01T00:00:00.000Z',
        tags: ['openai', 'gpt-5', 'chatgpt'],
      },
      {
        ...baseMarket,
        id: 'meta-lab-showcase-2026',
        slug: 'meta-lab-showcase-2026',
        headline: 'Meta AI announces a new flagship model by July 31, 2026',
        subject: 'Meta AI',
        category: 'ai' as const,
        promisedBy: 'Meta',
        summary: 'Meta AI unveils a new flagship model before July closes.',
        promisedDate: '2026-07-31T23:59:59.000Z',
        announcedOn: '2026-03-15T00:00:00.000Z',
        tags: ['meta', 'meta ai', 'llama'],
      },
      {
        ...baseMarket,
        id: 'openai-gpt4-legacy-2025',
        slug: 'openai-gpt4-legacy-2025',
        headline: 'OpenAI launches GPT-4.6 by February 28, 2025',
        subject: 'OpenAI GPT-4.6',
        category: 'ai' as const,
        promisedBy: 'Sam Altman',
        summary: 'Legacy OpenAI launch market used to exercise group sorting.',
        promisedDate: '2025-02-28T23:59:59.000Z',
        announcedOn: '2024-12-10T00:00:00.000Z',
        tags: ['openai', 'gpt-4.6'],
        status: 'busted',
        resolution: 'missed',
        resolutionNotes: 'Missed the published date.',
        betWindowOpen: false,
        bustedAt: '2025-03-01T00:00:00.000Z',
      },
      {
        ...baseMarket,
        id: 'creator-social-claim-2026',
        slug: 'creator-social-claim-2026',
        headline: 'A creator launches paid subscriptions on X by June 30, 2026',
        subject: 'X Creator claims',
        category: 'social' as const,
        promisedBy: 'Creator CEO',
        summary: 'A creator-led claim market used to exercise the CEO-claim family.',
        promisedDate: '2026-06-30T23:59:59.000Z',
        announcedOn: '2026-03-10T00:00:00.000Z',
        tags: ['creator', 'x', 'subscriptions'],
      },
      {
        ...baseMarket,
        id: 'linked-openai-followup-2026',
        slug: 'linked-openai-followup-2026',
        headline: 'A linked follow-up resolves after GPT-5 by December 31, 2026',
        subject: 'Linked follow-up',
        category: 'government' as const,
        promisedBy: 'Operator',
        summary: 'Synthetic linked market used to exercise linked-market detail logic.',
        promisedDate: '2026-12-31T23:59:59.000Z',
        announcedOn: '2026-03-20T00:00:00.000Z',
        tags: ['linked'],
        linkedMarketIds: ['openai-gpt5-summer-2026'],
      },
    ],
  })

  return createDashboardSnapshot(
    extendedStore,
    new Date('2026-03-18T00:00:00.000Z'),
  )
}

describe('board read model', () => {
  it('builds family and group summaries across the expanded catalog', () => {
    const snapshot = buildSnapshot()
    const catalog = buildCatalog()

    const familySummaries = createBoardFamilySummaries(snapshot, catalog)
    const groupSummaries = createBoardEventGroupSummaries(snapshot, catalog)

    expect(familySummaries[0]?.family.slug).toBe('product_ship_date')
    const aiLaunchSummary = familySummaries.find(
      (summary) => summary.family.slug === 'ai_launch',
    )
    expect(aiLaunchSummary).toEqual(
      expect.objectContaining({
        activeGroups: expect.any(Number),
        heroMarket: expect.objectContaining({
          company: expect.stringMatching(/^(openai|anthropic|meta|xai)$/),
        }),
        primaryEntities: expect.arrayContaining([
          expect.objectContaining({
            slug: 'openai',
          }),
          expect.objectContaining({
            slug: 'meta',
          }),
          expect.objectContaining({
            slug: 'anthropic',
          }),
        ]),
      }),
    )
    expect(aiLaunchSummary?.totalMarkets).toBeGreaterThanOrEqual(4)
    expect(aiLaunchSummary?.openMarkets).toBeGreaterThanOrEqual(3)

    const ceoClaimSummary = familySummaries.find(
      (summary) => summary.family.slug === 'ceo_claim',
    )
    expect(ceoClaimSummary).toEqual(
      expect.objectContaining({
        heroMarket: expect.objectContaining({
          promisedBy: expect.any(String),
        }),
      }),
    )
    expect(ceoClaimSummary?.totalMarkets).toBeGreaterThanOrEqual(2)
    expect(ceoClaimSummary?.openMarkets).toBeGreaterThanOrEqual(2)

    expect(
      groupSummaries.find((summary) => summary.group.slug === 'musk-deadline-board'),
    ).toEqual(
      expect.objectContaining({
        totalMarkets: expect.any(Number),
        openMarkets: expect.any(Number),
        heroMarket: expect.objectContaining({
          promisedBy: expect.stringMatching(/elon/i),
        }),
      }),
    )
    const openaiGroupSummary = groupSummaries.find(
      (summary) => summary.group.slug === 'openai-release-radar',
    )
    expect(openaiGroupSummary).toEqual(
      expect.objectContaining({
        primaryEntity: expect.objectContaining({
          slug: 'openai',
        }),
        heroMarket: expect.objectContaining({
          slug: 'openai-gpt5-summer-2026',
        }),
      }),
    )
    expect(openaiGroupSummary?.totalMarkets).toBeGreaterThanOrEqual(2)
    expect(openaiGroupSummary?.openMarkets).toBeGreaterThanOrEqual(1)
  })

  it('builds group and market detail views and returns null for misses', () => {
    const snapshot = buildSnapshot()
    const catalog = buildCatalog()

    expect(createEventGroupDetail('missing', snapshot, catalog)).toBeNull()
    expect(createMarketDetail('missing', snapshot, catalog)).toBeNull()

    const appleGroupDetail = createEventGroupDetail(
      'apple-launch-calendar',
      snapshot,
      catalog,
    )
    expect(appleGroupDetail).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          primaryEntity: expect.objectContaining({
            slug: 'apple',
          }),
          heroMarket: expect.objectContaining({
            company: 'apple',
          }),
        }),
        markets: expect.arrayContaining([
          expect.objectContaining({
            slug: 'apple-command-center-2025',
          }),
          expect.objectContaining({
            slug: 'apple-oled-macbook-2027',
          }),
        ]),
      }),
    )
    expect(appleGroupDetail?.summary.totalMarkets).toBeGreaterThanOrEqual(1)

    expect(createMarketDetail('openai-gpt5-summer-2026', snapshot, catalog))
      .toEqual(
        expect.objectContaining({
          family: expect.objectContaining({
            slug: 'ai_launch',
          }),
          primaryEntity: expect.objectContaining({
            slug: 'openai',
          }),
          eventGroups: [
            expect.objectContaining({
              group: expect.objectContaining({
                slug: 'openai-release-radar',
              }),
            }),
          ],
          relatedMarkets: expect.arrayContaining([
            expect.objectContaining({
              slug: 'meta-lab-showcase-2026',
            }),
            expect.objectContaining({
              slug: 'linked-openai-followup-2026',
            }),
          ]),
        }),
      )
  })

  it('covers secondary group sorting and linked-market relatedness branches', () => {
    const catalog = buildCatalog()
    const snapshot = buildSnapshot()

    const groupSummaries = createBoardEventGroupSummaries(snapshot, catalog)
    const openaiIndex = groupSummaries.findIndex(
      (summary) => summary.group.slug === 'openai-release-radar',
    )
    const metaIndex = groupSummaries.findIndex(
      (summary) => summary.group.slug === 'meta-ai-watch',
    )

    expect(openaiIndex).toBeLessThan(metaIndex)
  })

  it('falls back to group title sorting when open and total counts are tied', () => {
    const catalog = {
      families: buildCatalog().families,
      entities: buildCatalog().entities,
      groups: [
        eventGroupSchema.parse({
          id: 'group_zulu_tie',
          slug: 'zulu-tie',
          title: 'Zulu board',
          description: 'Zulu tie board.',
          familyId: null,
          primaryEntityId: null,
          status: 'active',
          startAt: null,
          endAt: null,
          heroMarketId: null,
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z',
        }),
        eventGroupSchema.parse({
          id: 'group_alpha_tie',
          slug: 'alpha-tie',
          title: 'Alpha board',
          description: 'Alpha tie board.',
          familyId: null,
          primaryEntityId: null,
          status: 'active',
          startAt: null,
          endAt: null,
          heroMarketId: null,
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z',
        }),
        eventGroupSchema.parse({
          id: 'group_mid_tie',
          slug: 'mid-tie',
          title: 'Mid board',
          description: 'Mid tie board.',
          familyId: null,
          primaryEntityId: null,
          status: 'active',
          startAt: null,
          endAt: null,
          heroMarketId: null,
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z',
        }),
      ],
    }

    const baseMarket = buildSnapshot().markets.find(
      (market) => market.slug === 'openai-gpt5-summer-2026',
    )
    const supportMarket = buildSnapshot().markets.find(
      (market) => market.id === 'lemonsuk-support-and-issues',
    )
    if (!baseMarket || !supportMarket) {
      throw new Error('Expected tie-sort snapshot fixtures.')
    }

    const snapshot = {
      ...buildSnapshot(),
      markets: [
        {
          ...baseMarket,
          id: 'alpha-tie-market',
          slug: 'alpha-tie-market',
          headline: 'Alpha tie market',
          subject: 'Alpha tie',
          company: 'openai' as const,
          linkedMarketIds: [],
        },
        {
          ...baseMarket,
          id: 'zulu-tie-market',
          slug: 'zulu-tie-market',
          headline: 'Zulu tie market',
          subject: 'Zulu tie',
          company: 'meta' as const,
          linkedMarketIds: [],
        },
        {
          ...baseMarket,
          id: 'mid-tie-market',
          slug: 'mid-tie-market',
          headline: 'Mid tie market',
          subject: 'Mid tie',
          company: 'meta' as const,
          linkedMarketIds: [],
        },
        supportMarket,
      ],
    }

    expect(
      createBoardEventGroupSummaries(snapshot, catalog).map(
        (summary) => summary.group.title,
      ),
    ).toEqual(['Alpha board', 'Mid board', 'Zulu board'])
  })

  it('covers family-summary tie breaking when open counts are equal', () => {
    const catalog = {
      families: buildCatalog().families.slice(0, 2),
      entities: buildCatalog().entities,
      groups: [],
    }
    const baseMarket = buildSnapshot().markets.find(
      (market) => market.id !== 'lemonsuk-support-and-issues',
    )

    if (!baseMarket) {
      throw new Error('Expected snapshot to contain at least one market.')
    }

    const snapshot = createDashboardSnapshot(
      {
        ...createSeedStore(),
        markets: [
          {
            ...baseMarket,
            id: 'family-a-open',
            slug: 'family-a-open',
            category: 'ai' as const,
            headline: 'OpenAI ships tool A by June 30, 2026',
            summary: 'AI family open market.',
            tags: ['openai'],
            status: 'open' as const,
            resolution: 'pending' as const,
            resolutionNotes: null,
            betWindowOpen: true,
            bustedAt: null,
          },
          {
            ...baseMarket,
            id: 'family-a-busted',
            slug: 'family-a-busted',
            category: 'ai' as const,
            headline: 'OpenAI ships tool B by May 31, 2026',
            summary: 'AI family busted market.',
            tags: ['openai'],
            status: 'busted' as const,
            resolution: 'missed' as const,
            resolutionNotes: 'Missed.',
            betWindowOpen: false,
            bustedAt: '2026-06-01T00:00:00.000Z',
          },
          {
            ...baseMarket,
            id: 'family-b-open',
            slug: 'family-b-open',
            category: 'vehicle' as const,
            headline: 'Apple ships device C by June 30, 2026',
            summary: 'Product family open market.',
            tags: ['apple'],
            status: 'open' as const,
            resolution: 'pending' as const,
            resolutionNotes: null,
            betWindowOpen: true,
            bustedAt: null,
          },
        ],
        bets: [],
        notifications: [],
      },
      new Date('2026-03-18T00:00:00.000Z'),
    )

    const summaries = createBoardFamilySummaries(snapshot, catalog)

    expect(summaries[0]?.family.slug).toBe('ai_launch')
    expect(summaries[1]?.family.slug).toBe('product_ship_date')
  })

  it('infers anthropic, generic elon, and null primary entities without company hints', () => {
    const catalog = buildCatalog()
    const baseSnapshot = buildSnapshot()
    const baseMarket = baseSnapshot.markets.find(
      (market) => market.id !== 'lemonsuk-support-and-issues',
    )

    if (!baseMarket) {
      throw new Error('Expected snapshot to contain at least one board market.')
    }

    const snapshot = dashboardSnapshotSchema.parse({
      ...baseSnapshot,
      markets: [
        ...baseSnapshot.markets.filter(
          (market) => market.id !== 'lemonsuk-support-and-issues',
        ),
        {
          ...baseMarket,
          id: 'anthropic-claude-2026',
          slug: 'anthropic-claude-2026',
          headline: 'Anthropic launches Claude Neptune by August 31, 2026',
          subject: 'Anthropic Claude',
          category: 'ai' as const,
          company: undefined,
          promisedBy: 'Anthropic',
          summary: 'Anthropic ships a new Claude release this summer.',
          promisedDate: '2026-08-31T23:59:59.000Z',
          announcedOn: '2026-04-01T00:00:00.000Z',
          tags: ['anthropic', 'claude'],
        },
        {
          ...baseMarket,
          id: 'apple-switch-fallback-2026',
          slug: 'apple-switch-fallback-2026',
          headline: 'Command deck lands by September 30, 2026',
          subject: 'Command deck',
          category: 'software_release' as const,
          company: 'apple' as const,
          promisedBy: 'Operator',
          summary: 'Company-switch fallback coverage with no explicit brand text.',
          promisedDate: '2026-09-30T23:59:59.000Z',
          announcedOn: '2026-03-18T00:00:00.000Z',
          tags: ['command-deck'],
        },
        {
          ...baseMarket,
          id: 'generic-elon-claim-2026',
          slug: 'generic-elon-claim-2026',
          headline: 'Elon says a secret build lands by May 31, 2026',
          subject: 'Elon project',
          category: 'social' as const,
          company: undefined,
          promisedBy: 'Elon Musk',
          summary: 'A generic Elon claim with no company-specific hint.',
          promisedDate: '2026-05-31T23:59:59.000Z',
          announcedOn: '2026-03-01T00:00:00.000Z',
          tags: ['surprise'],
        },
        {
          ...baseMarket,
          id: 'unknown-brand-deadline-2026',
          slug: 'unknown-brand-deadline-2026',
          headline: 'Mystery gadget ships by September 30, 2026',
          subject: 'Mystery gadget',
          category: 'vehicle' as const,
          company: undefined,
          promisedBy: 'Mystery Builder',
          summary: 'Unknown entity market used to exercise null entity inference.',
          promisedDate: '2026-09-30T23:59:59.000Z',
          announcedOn: '2026-03-05T00:00:00.000Z',
          tags: ['mystery'],
        },
        {
          ...baseMarket,
          id: 'earnings-guidance-watch-2026',
          slug: 'earnings-guidance-watch-2026',
          headline: 'Apple misses its delivery target guidance by July 31, 2026',
          subject: 'Apple guidance watch',
          category: 'vehicle' as const,
          company: undefined,
          promisedBy: 'Supply chain analyst',
          summary: 'A guidance-focused market used to exercise earnings-family inference.',
          promisedDate: '2026-07-31T23:59:59.000Z',
          announcedOn: '2026-03-12T00:00:00.000Z',
          tags: ['guidance', 'delivery target'],
        },
        {
          ...baseMarket,
          id: 'tesla-switch-fallback-2026',
          slug: 'tesla-switch-fallback-2026',
          headline: 'Roadster lands by September 30, 2026',
          subject: 'Roadster',
          category: 'vehicle' as const,
          company: 'tesla' as const,
          promisedBy: 'Operator',
          summary: 'Tesla fallback branch coverage with no explicit company text.',
          promisedDate: '2026-09-30T23:59:59.000Z',
          announcedOn: '2026-03-20T00:00:00.000Z',
          tags: ['roadster'],
        },
      ],
    })

    expect(createMarketDetail('anthropic-claude-2026', snapshot, catalog))
      .toEqual(
        expect.objectContaining({
          family: expect.objectContaining({
            slug: 'ai_launch',
          }),
          primaryEntity: expect.objectContaining({
            slug: 'anthropic',
          }),
        }),
      )

    expect(createMarketDetail('generic-elon-claim-2026', snapshot, catalog))
      .toEqual(
        expect.objectContaining({
          family: expect.objectContaining({
            slug: 'ceo_claim',
          }),
          primaryEntity: expect.objectContaining({
            slug: 'elon-musk',
          }),
        }),
      )

    expect(createMarketDetail('unknown-brand-deadline-2026', snapshot, catalog))
      .toEqual(
        expect.objectContaining({
          family: expect.objectContaining({
            slug: 'product_ship_date',
          }),
          primaryEntity: null,
        }),
      )

    expect(createMarketDetail('earnings-guidance-watch-2026', snapshot, catalog))
      .toEqual(
        expect.objectContaining({
          family: expect.objectContaining({
            slug: 'earnings_guidance',
          }),
        }),
      )

    expect(createMarketDetail('tesla-switch-fallback-2026', snapshot, catalog))
      .toEqual(
        expect.objectContaining({
          primaryEntity: expect.objectContaining({
            slug: 'tesla',
          }),
        }),
      )

    expect(createMarketDetail('apple-switch-fallback-2026', snapshot, catalog))
      .toEqual(
        expect.objectContaining({
          primaryEntity: expect.objectContaining({
            slug: 'apple',
          }),
        }),
      )
  })

  it('returns null family and entity metadata when catalog lookups are missing', () => {
    const baseCatalog = buildCatalog()
    const sparseCatalog = {
      families: baseCatalog.families.filter((family) => family.slug !== 'ai_launch'),
      entities: baseCatalog.entities.filter((entity) => entity.slug !== 'openai'),
      groups: [
        eventGroupSchema.parse({
          id: 'group_missing_refs',
          slug: 'missing-refs',
          title: 'Missing refs',
          description: 'Group with unresolved catalog refs.',
          familyId: 'family_missing',
          primaryEntityId: 'entity_missing',
          status: 'active',
          startAt: null,
          endAt: null,
          heroMarketId: null,
          createdAt: '2026-03-18T00:00:00.000Z',
          updatedAt: '2026-03-18T00:00:00.000Z',
        }),
      ],
    }
    const snapshot = buildSnapshot()

    expect(createBoardEventGroupSummaries(snapshot, sparseCatalog)[0]).toEqual(
      expect.objectContaining({
        family: null,
        primaryEntity: null,
      }),
    )

    expect(createMarketDetail('openai-gpt5-summer-2026', snapshot, sparseCatalog))
      .toEqual(
        expect.objectContaining({
          family: null,
          primaryEntity: null,
        }),
      )
  })
})
