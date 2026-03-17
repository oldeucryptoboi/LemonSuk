import { describe, expect, it, vi } from 'vitest'

describe('database service', () => {
  it('creates a pool, sets parsers, and runs client/transaction helpers', async () => {
    vi.resetModules()

    const query = vi.fn(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [] }
      }

      return { rows: [] }
    })
    const release = vi.fn()
    const connect = vi.fn(async () => ({ query, release }))
    const pool = { connect }
    const Pool = vi.fn(() => pool)
    const setTypeParser = vi.fn()

    vi.doMock('pg', () => ({
      Pool,
      types: {
        setTypeParser,
      },
    }))
    vi.doMock('../config', () => ({
      apiConfig: {
        databaseUrl: 'postgresql://example/test',
        databaseSsl: true,
      },
    }))

    const database = await import('./database')

    expect(database.getDatabasePool()).toBe(pool)
    expect(setTypeParser).toHaveBeenCalledWith(1700, expect.any(Function))

    const clientResult = await database.withDatabaseClient(async () => 'ok')
    expect(clientResult).toBe('ok')
    expect(release).toHaveBeenCalledTimes(1)

    const transactionResult = await database.withDatabaseTransaction(async () => {
      return 'tx-ok'
    })
    expect(transactionResult).toBe('tx-ok')
    expect(query).toHaveBeenCalledWith('BEGIN')
    expect(query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock($1)', [
      1_940_307,
    ])
    expect(query).toHaveBeenCalledWith('COMMIT')
  })

  it('rolls back transactions when the callback fails', async () => {
    vi.resetModules()

    const query = vi.fn(async () => ({ rows: [] }))
    const release = vi.fn()
    const connect = vi.fn(async () => ({ query, release }))

    vi.doMock('pg', () => ({
      Pool: vi.fn(() => ({ connect })),
      types: {
        setTypeParser: vi.fn(),
      },
    }))
    vi.doMock('../config', () => ({
      apiConfig: {
        databaseUrl: 'postgresql://example/test',
        databaseSsl: false,
      },
    }))

    const database = await import('./database')

    await expect(
      database.withDatabaseTransaction(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(query).toHaveBeenCalledWith('ROLLBACK')
    expect(release).toHaveBeenCalled()
  })
})
