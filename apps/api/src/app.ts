import cors from 'cors'
import express, { type Express } from 'express'
import { ZodError } from 'zod'

import { apiConfig } from './config'
import { createRateLimitMiddleware } from './middleware/rate-limit'
import { createAuthRouter } from './routes/auth'
import { createBetRouter } from './routes/bets'
import { createCatalogRouter } from './routes/catalog'
import { createDashboardRouter } from './routes/dashboard'
import { createDiscussionRouter } from './routes/discussion'
import { createInternalRouter } from './routes/internal'
import { createMaintenanceRouter } from './routes/maintenance'
import { createMarketRouter } from './routes/markets'

export function buildApp(): Express {
  const app = express()

  app.use(
    cors({
      origin: apiConfig.allowedOrigin === '*' ? true : apiConfig.allowedOrigin,
    }),
  )
  app.use(express.json())

  app.get('/health', (_request, response) => {
    response.json({ ok: true })
  })

  app.use(
    apiConfig.apiBasePath,
    createInternalRouter(),
    createRateLimitMiddleware({
      bucket: 'api',
      limit: 100,
      windowMs: 60_000,
    }),
    createCatalogRouter(),
    createDashboardRouter(),
    createBetRouter(),
    createDiscussionRouter(),
    createMarketRouter(),
    createMaintenanceRouter(),
  )
  app.use(`${apiConfig.apiBasePath}/auth`, createAuthRouter())

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
      response.status(400).json({
        message: error.issues[0]?.message ?? 'Invalid request payload.',
      })
      return
    }

    response.status(500).json({
      message:
        error instanceof Error ? error.message : 'Internal server error.',
    })
  })

  return app
}
