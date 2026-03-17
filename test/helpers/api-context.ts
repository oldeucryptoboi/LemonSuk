import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { DataType, newDb } from 'pg-mem'
import { vi } from 'vitest'

type SetupApiContextOptions = {
  applyMocks?: () => void
}

export async function setupApiContext(options: SetupApiContextOptions = {}) {
  vi.resetModules()

  const db = newDb({
    autoCreateForeignKeyIndices: true,
  })

  db.public.registerFunction({
    name: 'pg_advisory_xact_lock',
    args: [DataType.integer],
    returns: DataType.integer,
    implementation: (value: number) => value,
  })

  const adapter = db.adapters.createPg()
  const setTypeParser = vi.fn()

  vi.doMock('pg', () => ({
    Pool: adapter.Pool,
    types: {
      setTypeParser,
    },
  }))

  options.applyMocks?.()

  const database = await import('../../apps/api/src/services/database')
  const pool = database.getDatabasePool()
  const migrationsDir = path.resolve(process.cwd(), 'apps/api/migrations')

  for (const file of readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()) {
    await pool.query(readFileSync(path.join(migrationsDir, file), 'utf8'))
  }

  return {
    db,
    pool,
    setTypeParser,
    buildApp: (await import('../../apps/api/src/app')).buildApp,
    store: await import('../../apps/api/src/services/store'),
    identity: await import('../../apps/api/src/services/identity'),
    bonus: await import('../../apps/api/src/services/bonus'),
    maintenance: await import('../../apps/api/src/services/maintenance'),
  }
}
