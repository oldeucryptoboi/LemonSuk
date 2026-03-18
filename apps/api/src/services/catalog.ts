import type { PoolClient } from 'pg'

import type { Entity, EventGroup, PredictionFamily } from '../shared'
import { entitySchema, eventGroupSchema, predictionFamilySchema } from '../shared'
import { withDatabaseClient } from './database'
import { ensureCatalogFoundations } from './lead-intake'

type EntityRow = {
  id: string
  slug: string
  display_name: string
  entity_type: Entity['entityType']
  status: Entity['status']
  description: string | null
  aliases_json: string[]
}

type PredictionFamilyRow = {
  id: string
  slug: PredictionFamily['slug']
  display_name: string
  description: string
  default_resolution_mode: string
  default_time_horizon: string
  status: PredictionFamily['status']
}

type EventGroupRow = {
  id: string
  slug: string
  title: string
  description: string | null
  family_id: string | null
  primary_entity_id: string | null
  status: EventGroup['status']
  start_at: Date | null
  end_at: Date | null
  hero_market_id: string | null
  created_at: Date
  updated_at: Date
}

function mapEntity(row: EntityRow): Entity {
  return entitySchema.parse({
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    entityType: row.entity_type,
    status: row.status,
    description: row.description,
    aliases: row.aliases_json,
  })
}

function mapPredictionFamily(row: PredictionFamilyRow): PredictionFamily {
  return predictionFamilySchema.parse({
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    description: row.description,
    defaultResolutionMode: row.default_resolution_mode,
    defaultTimeHorizon: row.default_time_horizon,
    status: row.status,
  })
}

function mapEventGroup(row: EventGroupRow): EventGroup {
  return eventGroupSchema.parse({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    familyId: row.family_id,
    primaryEntityId: row.primary_entity_id,
    status: row.status,
    startAt: row.start_at?.toISOString() ?? null,
    endAt: row.end_at?.toISOString() ?? null,
    heroMarketId: row.hero_market_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  })
}

export async function readEntities(): Promise<Entity[]> {
  return withDatabaseClient((client) => readEntitiesFromClient(client))
}

export async function readEntitiesFromClient(
  client: PoolClient,
): Promise<Entity[]> {
  await ensureCatalogFoundations(client, new Date())
  const result = await client.query<EntityRow>(
    `
      SELECT
        id,
        slug,
        display_name,
        entity_type,
        status,
        description,
        aliases_json
      FROM entities
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'legacy' THEN 1
          ELSE 2
        END,
        slug ASC
    `,
  )

  return result.rows.map(mapEntity)
}

export async function readPredictionFamilies(): Promise<PredictionFamily[]> {
  return withDatabaseClient((client) => readPredictionFamiliesFromClient(client))
}

export async function readPredictionFamiliesFromClient(
  client: PoolClient,
): Promise<PredictionFamily[]> {
  await ensureCatalogFoundations(client, new Date())
  const result = await client.query<PredictionFamilyRow>(
    `
      SELECT
        id,
        slug,
        display_name,
        description,
        default_resolution_mode,
        default_time_horizon,
        status
      FROM prediction_families
      ORDER BY slug ASC
    `,
  )

  return result.rows.map(mapPredictionFamily)
}

export async function readEventGroups(): Promise<EventGroup[]> {
  return withDatabaseClient((client) => readEventGroupsFromClient(client))
}

export async function readEventGroupsFromClient(
  client: PoolClient,
): Promise<EventGroup[]> {
  await ensureCatalogFoundations(client, new Date())
  const result = await client.query<EventGroupRow>(
    `
      SELECT
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
      FROM event_groups
      ORDER BY updated_at DESC, slug ASC
    `,
  )

  return result.rows.map(mapEventGroup)
}
