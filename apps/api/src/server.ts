import { createServer } from 'node:http'

import { apiConfig } from './config'
import { buildApp } from './app'
import {
  attachDashboardLiveUpdates,
  setDashboardSnapshotResolver,
  startDashboardLiveLoop,
} from './services/live-updates'
import { deliverPendingNotificationEmails } from './services/email'
import { ensureStore } from './services/store'
import { loadMaintainedStore } from './services/maintenance'
import { readOperationalSnapshot } from './routes/helpers'

await ensureStore()
await loadMaintainedStore()
await deliverPendingNotificationEmails()

const app = buildApp()
const server = createServer(app)

setDashboardSnapshotResolver(() =>
  readOperationalSnapshot(new Date(), {
    deliverEmails: false,
  }),
)
attachDashboardLiveUpdates(server)
startDashboardLiveLoop()

await new Promise<void>((resolve, reject) => {
  server.listen(apiConfig.port, apiConfig.host, () => resolve())
  server.once('error', reject)
})
