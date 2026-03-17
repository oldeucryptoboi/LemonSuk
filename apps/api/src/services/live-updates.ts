import type { IncomingMessage, Server as HttpServer } from 'node:http'

import { WebSocketServer, type WebSocket } from 'ws'

import { apiConfig } from '../config'
import type { DashboardSnapshot } from '../shared'

type SnapshotResolver = () => Promise<DashboardSnapshot>

const clients = new Set<WebSocket>()
const livePath = `${apiConfig.apiBasePath}/live`

let webSocketServer: WebSocketServer | null = null
let snapshotResolver: SnapshotResolver | null = null
let pollTimer: NodeJS.Timeout | null = null
let pollInFlight = false
let lastSnapshotSignature: string | null = null
let lastSnapshotPayload: string | null = null

function createSnapshotEvent(snapshot: DashboardSnapshot): string {
  return JSON.stringify({
    type: 'snapshot',
    snapshot,
  })
}

// Ignore the transport timestamp when deciding whether the board actually changed.
function createSnapshotSignature(snapshot: DashboardSnapshot): string {
  return JSON.stringify({
    ...snapshot,
    now: '__stable__',
  })
}

function matchesLivePath(request: IncomingMessage): boolean {
  const requestUrl = new URL(
    request.url ?? '/',
    `http://${request.headers.host ?? 'localhost'}`,
  )

  return requestUrl.pathname === livePath
}

function broadcastRaw(payload: string): void {
  lastSnapshotPayload = payload

  for (const client of clients) {
    if (client.readyState !== client.OPEN) {
      clients.delete(client)
      continue
    }

    client.send(payload)
  }
}

export function setDashboardSnapshotResolver(
  resolver: SnapshotResolver,
): void {
  snapshotResolver = resolver
}

export function publishDashboardSnapshot(
  snapshot: DashboardSnapshot,
): boolean {
  const nextSignature = createSnapshotSignature(snapshot)
  if (nextSignature === lastSnapshotSignature) {
    return false
  }

  lastSnapshotSignature = nextSignature
  broadcastRaw(createSnapshotEvent(snapshot))
  return true
}

async function seedSocketWithCurrentSnapshot(socket: WebSocket): Promise<void> {
  if (lastSnapshotPayload) {
    socket.send(lastSnapshotPayload)
    return
  }

  if (!snapshotResolver) {
    return
  }

  const snapshot = await snapshotResolver()
  lastSnapshotSignature = createSnapshotSignature(snapshot)
  const payload = createSnapshotEvent(snapshot)
  lastSnapshotPayload = payload
  socket.send(payload)
}

export function attachDashboardLiveUpdates(server: HttpServer): void {
  if (webSocketServer) {
    return
  }

  const nextServer = new WebSocketServer({ noServer: true })
  webSocketServer = nextServer

  nextServer.on('connection', (socket) => {
    clients.add(socket)

    socket.on('close', () => {
      clients.delete(socket)
    })
    socket.on('error', () => {
      clients.delete(socket)
    })

    void seedSocketWithCurrentSnapshot(socket).catch(() => {
      socket.close()
    })
  })

  server.on('upgrade', (request, socket, head) => {
    if (!matchesLivePath(request)) {
      return
    }

    nextServer.handleUpgrade(request, socket, head, (client) => {
      nextServer.emit('connection', client, request)
    })
  })
}

export function startDashboardLiveLoop(intervalMs = 30_000): void {
  if (pollTimer || !snapshotResolver) {
    return
  }

  const poll = async () => {
    if (pollInFlight || !snapshotResolver) {
      return
    }

    pollInFlight = true

    try {
      publishDashboardSnapshot(await snapshotResolver())
    } finally {
      pollInFlight = false
    }
  }

  pollTimer = setInterval(() => {
    void poll()
  }, intervalMs)
  pollTimer.unref?.()

  void poll()
}

export function __resetLiveUpdatesForTests(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
  }
  pollTimer = null
  pollInFlight = false
  snapshotResolver = null
  lastSnapshotSignature = null
  lastSnapshotPayload = null
  clients.clear()
  webSocketServer?.close()
  webSocketServer = null
}
