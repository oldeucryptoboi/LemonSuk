import { describe, expect, it } from 'vitest'

import { setupApiContext } from '../../../../test/helpers/api-context'

describe('catalog service', () => {
  it('reads seeded entities, families, and event groups', async () => {
    const context = await setupApiContext()
    const catalog = await import('./catalog')
    await context.store.ensureStore()

    const [families, entities] = await Promise.all([
      catalog.readPredictionFamilies(),
      catalog.readEntities(),
    ])

    await context.pool.query(
      `
        INSERT INTO event_groups (
          id,
          slug,
          title,
          description,
          family_id,
          primary_entity_id,
          status,
          start_at,
          end_at,
          hero_market_id,
          created_at,
          updated_at
        )
        VALUES (
          'group_musk_claims',
          'musk-claims',
          'Musk claims',
          'A seeded group used to verify event-group catalog reads.',
          'family_ceo_claim',
          'entity_elon_musk',
          'active',
          '2026-03-01T00:00:00.000Z',
          '2026-03-31T23:59:59.000Z',
          'optimus-customizable-2026',
          '2026-03-01T00:00:00.000Z',
          '2026-03-02T00:00:00.000Z'
        )
      `,
    )
    await context.pool.query(
      `
        INSERT INTO event_groups (
          id,
          slug,
          title,
          description,
          family_id,
          primary_entity_id,
          status,
          start_at,
          end_at,
          hero_market_id,
          created_at,
          updated_at
        )
        VALUES (
          'group_null_window',
          'null-window',
          'Null window',
          NULL,
          'family_ai_launch',
          'entity_openai',
          'draft',
          NULL,
          NULL,
          NULL,
          '2026-03-03T00:00:00.000Z',
          '2026-03-04T00:00:00.000Z'
        )
      `,
    )

    const groups = await catalog.readEventGroups()

    expect(families.map((family) => family.slug)).toEqual([
      'ai_launch',
      'ceo_claim',
      'earnings_guidance',
      'policy_promise',
      'product_ship_date',
    ])
    expect(entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'tesla',
          displayName: 'Tesla',
          status: 'active',
        }),
        expect.objectContaining({
          slug: 'apple',
          displayName: 'Apple',
          status: 'active',
        }),
        expect.objectContaining({
          slug: 'solarcity',
          displayName: 'SolarCity',
          status: 'legacy',
        }),
      ]),
    )
    expect(groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'musk-claims',
          title: 'Musk claims',
          familyId: 'family_ceo_claim',
          primaryEntityId: 'entity_elon_musk',
          heroMarketId: 'optimus-customizable-2026',
          startAt: '2026-03-01T00:00:00.000Z',
          endAt: '2026-03-31T23:59:59.000Z',
        }),
        expect.objectContaining({
          slug: 'null-window',
          title: 'Null window',
          familyId: 'family_ai_launch',
          primaryEntityId: 'entity_openai',
          heroMarketId: null,
          startAt: null,
          endAt: null,
        }),
      ]),
    )

    await context.pool.end()
  })
})
