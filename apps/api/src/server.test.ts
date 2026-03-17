import { afterEach, describe, expect, it, vi } from 'vitest'

describe('server entrypoint', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('ensures state, runs maintenance, builds the app, and starts listening', async () => {
    const once = vi.fn()
    const listen = vi.fn((_port: number, _host: string, callback: () => void) => {
      callback()
      return server
    })
    const server = { listen, once }
    const createServer = vi.fn(() => server)
    const buildApp = vi.fn(() => ({}))
    const ensureStore = vi.fn(async () => undefined)
    const loadMaintainedStore = vi.fn(async () => undefined)
    const deliverPendingNotificationEmails = vi.fn(async () => 0)
    const attachDashboardLiveUpdates = vi.fn()
    const setDashboardSnapshotResolver = vi.fn()
    const startDashboardLiveLoop = vi.fn()
    const readOperationalSnapshot = vi.fn(async () => ({
      now: '2026-03-17T00:00:00.000Z',
    }))

    vi.doMock('./config', () => ({
      apiConfig: {
        host: '127.0.0.1',
        port: 9999,
      },
    }))
    vi.doMock('node:http', () => ({
      createServer,
    }))
    vi.doMock('./app', () => ({
      buildApp,
    }))
    vi.doMock('./services/store', () => ({
      ensureStore,
    }))
    vi.doMock('./services/maintenance', () => ({
      loadMaintainedStore,
    }))
    vi.doMock('./services/email', () => ({
      deliverPendingNotificationEmails,
    }))
    vi.doMock('./services/live-updates', () => ({
      attachDashboardLiveUpdates,
      setDashboardSnapshotResolver,
      startDashboardLiveLoop,
    }))
    vi.doMock('./routes/helpers', () => ({
      readOperationalSnapshot,
    }))

    await import('./server')

    expect(ensureStore).toHaveBeenCalledTimes(1)
    expect(loadMaintainedStore).toHaveBeenCalledTimes(1)
    expect(deliverPendingNotificationEmails).toHaveBeenCalledTimes(1)
    expect(buildApp).toHaveBeenCalledTimes(1)
    expect(createServer).toHaveBeenCalledTimes(1)
    expect(setDashboardSnapshotResolver).toHaveBeenCalledTimes(1)
    expect(attachDashboardLiveUpdates).toHaveBeenCalledWith(server)
    expect(startDashboardLiveLoop).toHaveBeenCalledTimes(1)
    expect(listen).toHaveBeenCalledWith(9999, '127.0.0.1', expect.any(Function))
    expect(once).toHaveBeenCalledWith('error', expect.any(Function))

    const snapshotResolver = setDashboardSnapshotResolver.mock.calls[0]?.[0]
    expect(await snapshotResolver()).toEqual({
      now: '2026-03-17T00:00:00.000Z',
    })
    expect(readOperationalSnapshot).toHaveBeenCalledWith(expect.any(Date), {
      deliverEmails: false,
    })
  })
})
