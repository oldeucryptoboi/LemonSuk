import { Pool, type PoolClient, types } from 'pg'

import { apiConfig } from '../config'

types.setTypeParser(1700, (value) => Number(value))

const storeLockKey = 1_940_307

const pool = new Pool({
  connectionString: apiConfig.databaseUrl,
  ssl: apiConfig.databaseSsl ? { rejectUnauthorized: false } : undefined,
})

export function getDatabasePool(): Pool {
  return pool
}

export async function withDatabaseClient<T>(
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()

  try {
    return await run(client)
  } finally {
    client.release()
  }
}

export async function withDatabaseTransaction<T>(
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withDatabaseClient(async (client) => {
    await client.query('BEGIN')

    try {
      await client.query('SELECT pg_advisory_xact_lock($1)', [storeLockKey])
      const result = await run(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  })
}
