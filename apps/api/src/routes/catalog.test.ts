import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

describe('createCatalogRouter', () => {
  function buildSnapshot() {
    return {
      now: '2026-03-18T00:00:00.000Z',
      stats: {
        totalMarkets: 1,
        openMarkets: 1,
        bustedMarkets: 0,
        resolvedMarkets: 0,
        activeBets: 0,
        wonBets: 0,
        lostBets: 0,
        globalBonusPercent: 12,
        bustedRatePercent: 0,
        registeredAgents: 0,
        humanVerifiedAgents: 0,
      },
      markets: [
        {
          id: 'market_1',
          slug: 'openai-gpt5-summer-2026',
          headline: 'OpenAI launches GPT-5 by August 31, 2026',
          subject: 'OpenAI GPT-5',
          category: 'ai',
          company: 'xai',
          checkpointKind: 'interim',
          seasonalLabel: 'Q3 2026 window',
          announcedOn: '2026-03-01T00:00:00.000Z',
          promisedDate: '2026-08-31T23:59:59.000Z',
          promisedBy: 'Sam Altman',
          summary: 'OpenAI ships GPT-5 within the summer 2026 window.',
          status: 'open',
          resolution: 'pending',
          resolutionNotes: null,
          basePayoutMultiplier: 1.8,
          payoutMultiplier: 1.8,
          confidence: 80,
          stakeDifficulty: 3,
          tags: ['openai', 'gpt-5'],
          sources: [],
          author: null,
          linkedMarketIds: [],
          betWindowOpen: true,
          bustedAt: null,
          createdAt: '2026-03-01T00:00:00.000Z',
          updatedAt: '2026-03-01T00:00:00.000Z',
          lastCheckedAt: '2026-03-01T00:00:00.000Z',
          evidenceUpdates: [],
          checkpoints: [],
          oddsCommentary: [],
          discussionCount: 0,
          discussionParticipantCount: 0,
          forumLeader: null,
        },
      ],
      bets: [],
      notifications: [],
      hallOfFame: [],
      metadata: {
        lastMaintenanceRunAt: null,
        lastDiscoveryRunAt: null,
      },
    }
  }

  function buildFamily() {
    return {
      id: 'family_ai_launch',
      slug: 'ai_launch',
      displayName: 'AI launches',
      description: 'AI launch markets.',
      defaultResolutionMode: 'deadline',
      defaultTimeHorizon: '30d',
      status: 'active',
    }
  }

  function buildEntity() {
    return {
      id: 'entity_openai',
      slug: 'openai',
      displayName: 'OpenAI',
      entityType: 'company',
      status: 'active',
      aliases: [],
    }
  }

  function buildGroup() {
    return {
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
    }
  }

  async function buildRouteApp() {
    const { createCatalogRouter } = await import('./catalog')
    const app = express()
    app.use('/api/v1', createCatalogRouter())
    return app
  }

  it('serves family, group, and market read models', async () => {
    vi.resetModules()

    const readOperationalSnapshot = vi.fn(async () => buildSnapshot())
    const readPredictionFamilies = vi.fn(async () => [buildFamily()])
    const readEntities = vi.fn(async () => [buildEntity()])
    const readEventGroups = vi.fn(async () => [buildGroup()])

    vi.doMock('./helpers', () => ({
      readOperationalSnapshot,
    }))
    vi.doMock('../services/catalog', () => ({
      readPredictionFamilies,
      readEntities,
      readEventGroups,
    }))

    const app = await buildRouteApp()

    expect((await request(app).get('/api/v1/families')).body[0].family.slug).toBe(
      'ai_launch',
    )
    expect((await request(app).get('/api/v1/groups')).body[0].group.slug).toBe(
      'openai-release-radar',
    )
    expect(
      (await request(app).get('/api/v1/groups/openai-release-radar')).body.summary
        .group.slug,
    ).toBe('openai-release-radar')
    expect(
      (await request(app).get('/api/v1/markets/slug/openai-gpt5-summer-2026')).body
        .market.slug,
    ).toBe('openai-gpt5-summer-2026')

    expect(readOperationalSnapshot).toHaveBeenCalledTimes(4)
    expect(readPredictionFamilies).toHaveBeenCalledTimes(4)
    expect(readEntities).toHaveBeenCalledTimes(4)
    expect(readEventGroups).toHaveBeenCalledTimes(4)
  })

  it('returns 404 when a group or market is missing', async () => {
    vi.resetModules()

    vi.doMock('./helpers', () => ({
      readOperationalSnapshot: vi.fn(async () => buildSnapshot()),
    }))
    vi.doMock('../services/catalog', () => ({
      readPredictionFamilies: vi.fn(async () => [buildFamily()]),
      readEntities: vi.fn(async () => [buildEntity()]),
      readEventGroups: vi.fn(async () => [buildGroup()]),
    }))

    const app = await buildRouteApp()

    expect((await request(app).get('/api/v1/groups/missing')).statusCode).toBe(404)
    expect(
      (await request(app).get('/api/v1/markets/slug/missing')).statusCode,
    ).toBe(404)
  })
})
