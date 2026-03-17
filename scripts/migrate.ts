import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { type PoolClient } from 'pg'

import { getDatabasePool } from '../apps/api/src/services/database'

type Migration = {
  id: string
  checksum: string
  sql: string
}

const migrationsDir = path.resolve(process.cwd(), 'apps/api/migrations')
const migrationLockKey = 1_940_308

function checksumFor(sql: string): string {
  return createHash('sha256').update(sql).digest('hex')
}

async function loadMigrations(): Promise<Migration[]> {
  const files = (await fs.readdir(migrationsDir))
    .filter((entry) => entry.endsWith('.sql'))
    .sort()

  return Promise.all(
    files.map(async (file) => {
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8')

      return {
        id: file,
        checksum: checksumFor(sql),
        sql,
      }
    }),
  )
}

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
}

async function run(): Promise<void> {
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1)', [migrationLockKey])
    await ensureMigrationTable(client)

    const appliedResult = await client.query<{
      id: string
      checksum: string
    }>('SELECT id, checksum FROM schema_migrations ORDER BY id')
    const applied = new Map(
      appliedResult.rows.map((row) => [row.id, row.checksum]),
    )
    const migrations = await loadMigrations()

    for (const migration of migrations) {
      const existingChecksum = applied.get(migration.id)

      if (existingChecksum) {
        if (existingChecksum !== migration.checksum) {
          throw new Error(
            `Migration checksum mismatch for ${migration.id}. Create a new migration instead of editing an applied one.`,
          )
        }

        continue
      }

      await client.query(migration.sql)
      await client.query(
        `
          INSERT INTO schema_migrations (id, checksum)
          VALUES ($1, $2)
        `,
        [migration.id, migration.checksum],
      )
      console.log(`applied ${migration.id}`)
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

await run()
