import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSeedStore } from '../data/seed'
import type { DashboardSnapshot } from '../shared'
import { createDashboardSnapshot } from './bonus'

class MockSocket {
  static readonly OPEN = 1

  readonly sent: string[] = []
  readonly OPEN = MockSocket.OPEN
  readyState = MockSocket.OPEN
  closed = false
  private readonly listeners = new Map<string, Array<() => void>>()

  on(type: string, listener: () => void): void {
    const collection = this.listeners.get(type) ?? []
    collection.push(listener)
    this.listeners.set(type, collection)
  }

  send(payload: string): void {
    this.sent.push(payload)
  }

  close(): void {
    this.closed = true
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener()
    }
  }
}

class MockWebSocketServer {
  static instances: MockWebSocketServer[] = []

  readonly options: { noServer: boolean }
  readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  nextClient: MockSocket | null = null
  closed = false
  upgradeCount = 0

  constructor(options: { noServer: boolean }) {
    this.options = options
    MockWebSocketServer.instances.push(this)
  }

  on(type: string, listener: (...args: unknown[]) => void): void {
    const collection = this.listeners.get(type) ?? []
    collection.push(listener)
    this.listeners.set(type, collection)
  }

  emit(type: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(...args)
    }
  }

  handleUpgrade(
    request: unknown,
    _socket: unknown,
    _head: unknown,
    callback: (client: MockSocket, request: unknown) => void,
  ): void {
    this.upgradeCount += 1
    callback(this.nextClient ?? new MockSocket(), request)
  }

  close(): void {
    this.closed = true
  }
}

vi.mock('ws', () => ({
  WebSocketServer: MockWebSocketServer,
}))

function buildSnapshot(now: string) {
  return createDashboardSnapshot(createSeedStore(), new Date(now))
}

function buildChangedSnapshot(now: string) {
  const snapshot = buildSnapshot(now)

  return {
    ...snapshot,
    markets: snapshot.markets.map((market, index) =>
      index === 0
        ? {
            ...market,
            payoutMultiplier: Number((market.payoutMultiplier + 0.1).toFixed(2)),
          }
        : market,
    ),
  }
}

function buildChangedSnapshotVariant(now: string) {
  const snapshot = buildSnapshot(now)

  return {
    ...snapshot,
    markets: snapshot.markets.map((market, index) =>
      index === 1
        ? {
            ...market,
            summary: `${market.summary} Updated.`,
          }
        : market,
    ),
  }
}

describe('live updates', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    MockWebSocketServer.instances = []
  })

  afterEach(async () => {
    const liveUpdates = await import('./live-updates')
    liveUpdates.__resetLiveUpdatesForTests()
    vi.useRealTimers()
  })

  it('attaches websocket upgrades, seeds clients, and deduplicates snapshots by content', async () => {
    const liveUpdates = await import('./live-updates')
    type UpgradeListener = (
      request: { url?: string; headers: { host?: string } },
      socket: unknown,
      head: unknown,
    ) => void
    const serverListeners = new Map<
      string,
      UpgradeListener
    >()
    const server = {
      on: vi.fn((type: string, listener: UpgradeListener) => {
        serverListeners.set(type, listener)
      }),
    }

    liveUpdates.attachDashboardLiveUpdates(server as never)
    liveUpdates.attachDashboardLiveUpdates(server as never)

    expect(server.on).toHaveBeenCalledTimes(1)
    expect(MockWebSocketServer.instances).toHaveLength(1)
    expect(MockWebSocketServer.instances[0]?.options).toEqual({ noServer: true })

    const nonLiveUpgrade = serverListeners.get('upgrade')
    if (!nonLiveUpgrade) {
      throw new Error('Expected upgrade listener.')
    }

    const noResolverClient = new MockSocket()
    MockWebSocketServer.instances[0]!.nextClient = noResolverClient
    nonLiveUpgrade(
      { url: '/api/v1/live', headers: { host: 'localhost' } },
      {},
      {},
    )
    await Promise.resolve()
    expect(noResolverClient.sent).toHaveLength(0)

    const resolver = vi.fn(async () => buildSnapshot('2026-03-17T00:00:00.000Z'))
    liveUpdates.setDashboardSnapshotResolver(resolver)

    nonLiveUpgrade({ url: '/health', headers: { host: 'localhost' } }, {}, {})
    expect(MockWebSocketServer.instances[0]?.upgradeCount).toBe(1)
    nonLiveUpgrade({ headers: {} }, {}, {})
    expect(MockWebSocketServer.instances[0]?.upgradeCount).toBe(1)

    const firstClient = new MockSocket()
    MockWebSocketServer.instances[0]!.nextClient = firstClient
    nonLiveUpgrade(
      { url: '/api/v1/live', headers: { host: 'localhost' } },
      {},
      {},
    )
    await Promise.resolve()

    expect(resolver).toHaveBeenCalledTimes(1)
    expect(firstClient.sent).toHaveLength(1)

    const cachedClient = new MockSocket()
    MockWebSocketServer.instances[0]!.nextClient = cachedClient
    nonLiveUpgrade(
      { url: '/api/v1/live', headers: { host: 'localhost' } },
      {},
      {},
    )
    await Promise.resolve()
    expect(resolver).toHaveBeenCalledTimes(1)
    expect(cachedClient.sent).toHaveLength(1)

    const closingClient = new MockSocket()
    MockWebSocketServer.instances[0]!.nextClient = closingClient
    nonLiveUpgrade(
      { url: '/api/v1/live', headers: { host: 'localhost' } },
      {},
      {},
    )
    await Promise.resolve()
    closingClient.emit('close')

    expect(
      liveUpdates.publishDashboardSnapshot(
        buildSnapshot('2026-03-17T00:05:00.000Z'),
      ),
    ).toBe(false)

    cachedClient.readyState = 0
    expect(
      liveUpdates.publishDashboardSnapshot(
        buildChangedSnapshot('2026-03-18T00:00:00.000Z'),
      ),
    ).toBe(true)
    expect(firstClient.sent).toHaveLength(2)
    expect(cachedClient.sent).toHaveLength(1)
    expect(closingClient.sent).toHaveLength(1)

    firstClient.emit('error')
    expect(
      liveUpdates.publishDashboardSnapshot(
        buildChangedSnapshotVariant('2026-03-19T00:00:00.000Z'),
      ),
    ).toBe(true)
    expect(firstClient.sent).toHaveLength(2)
  })

  it('starts a polling loop and closes sockets when snapshot seeding fails', async () => {
    const liveUpdates = await import('./live-updates')

    liveUpdates.startDashboardLiveLoop(1_000)

    const resolver = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(buildSnapshot('2026-03-17T00:00:00.000Z'))

    liveUpdates.setDashboardSnapshotResolver(resolver)

    type UpgradeListener = (
      request: { url?: string; headers: { host?: string } },
      socket: unknown,
      head: unknown,
    ) => void
    const serverListeners = new Map<
      string,
      UpgradeListener
    >()
    const server = {
      on: vi.fn((type: string, listener: UpgradeListener) => {
        serverListeners.set(type, listener)
      }),
    }

    liveUpdates.attachDashboardLiveUpdates(server as never)
    const failingClient = new MockSocket()
    MockWebSocketServer.instances[0]!.nextClient = failingClient
    serverListeners
      .get('upgrade')?.({ url: '/api/v1/live', headers: { host: 'localhost' } }, {}, {})
    await Promise.resolve()
    await Promise.resolve()
    expect(failingClient.closed).toBe(true)

    liveUpdates.startDashboardLiveLoop(1_000)
    await vi.runOnlyPendingTimersAsync()
    expect(resolver).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(resolver).toHaveBeenCalledTimes(4)

    let resolveSnapshot: ((value: DashboardSnapshot) => void) | null = null
    const pendingResolver = vi.fn(
      () =>
        new Promise<DashboardSnapshot>((resolve) => {
          resolveSnapshot = resolve
        }),
    )

    liveUpdates.__resetLiveUpdatesForTests()
    liveUpdates.setDashboardSnapshotResolver(pendingResolver)
    liveUpdates.startDashboardLiveLoop(1_000)
    expect(pendingResolver).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(pendingResolver).toHaveBeenCalledTimes(1)
    if (!resolveSnapshot) {
      throw new Error('Expected pending snapshot resolver.')
    }
    const completePendingSnapshot = resolveSnapshot as (
      value: DashboardSnapshot,
    ) => void
    completePendingSnapshot(buildSnapshot('2026-03-18T00:00:00.000Z'))
    await Promise.resolve()
  })
})
