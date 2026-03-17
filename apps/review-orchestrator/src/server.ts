import express from 'express'

import { createEddieCallbackHandler } from './callback'
import { reviewOrchestratorConfig } from './config'
import { startReviewWorker } from './worker'

type ReviewOrchestratorServerDependencies = {
  app?: express.Express
  workerEnabled?: boolean
  startWorker?: typeof startReviewWorker
  log?: (message: string) => void
}

export function buildReviewOrchestratorApp(): express.Express {
  const app = express()

  app.get('/health', (_request, response) => {
    response.json({ ok: true })
  })

  app.post(
    `${reviewOrchestratorConfig.reviewBasePath}/callback/eddie`,
    express.raw({
      type: 'application/json',
    }),
    createEddieCallbackHandler(),
  )

  return app
}

export function startReviewOrchestratorServer(
  dependencies: ReviewOrchestratorServerDependencies = {},
): ReturnType<express.Express['listen']> {
  /* v8 ignore next */
  const app = dependencies.app ?? buildReviewOrchestratorApp()
  const startWorker = dependencies.startWorker ?? startReviewWorker
  const workerEnabled =
    dependencies.workerEnabled ?? reviewOrchestratorConfig.workerEnabled
  const log = dependencies.log ?? console.log
  const server = app.listen(
    reviewOrchestratorConfig.port,
    reviewOrchestratorConfig.host,
    () => {
      log(
        `review orchestrator listening on ${reviewOrchestratorConfig.host}:${reviewOrchestratorConfig.port}`,
      )
    },
  )

  const abortController = new AbortController()
  server.on('close', () => {
    abortController.abort()
  })

  if (workerEnabled) {
    void startWorker(abortController.signal)
  }

  return server
}

/* v8 ignore next 3 */
if (import.meta.url === `file://${process.argv[1]}`) {
  void startReviewOrchestratorServer()
}
