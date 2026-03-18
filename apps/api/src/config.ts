const defaultDatabaseUrl = 'postgresql://localhost:5432/lemonsuk'
const defaultInternalServiceToken = 'lemonsuk-dev-internal-service-token'
const defaultJwtSecret = 'lemonsuk-dev-jwt-secret'

const apiConfig = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 8787),
  apiBasePath: '/api/v1',
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? '*',
  databaseUrl: process.env.DATABASE_URL ?? defaultDatabaseUrl,
  databaseSsl: process.env.PGSSLMODE === 'require',
  redisUrl: process.env.REDIS_URL ?? '',
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN ?? defaultInternalServiceToken,
  reviewQueueKey: process.env.REVIEW_QUEUE_KEY ?? 'lemonsuk:review-requested',
  jwtSecret: process.env.JWT_SECRET ?? defaultJwtSecret,
  sendGridApiKey: process.env.SENDGRID_API_KEY ?? '',
  sendGridFromEmail: process.env.SENDGRID_FROM_EMAIL ?? '',
}

function assertProductionApiConfig(): void {
  if (apiConfig.nodeEnv !== 'production') {
    return
  }

  if (
    apiConfig.databaseUrl === defaultDatabaseUrl ||
    /:\/\/(?:127\.0\.0\.1|localhost)(?::|\/)/.test(apiConfig.databaseUrl)
  ) {
    throw new Error('Production DATABASE_URL must point to the deployed database service.')
  }

  if (apiConfig.internalServiceToken === defaultInternalServiceToken) {
    throw new Error('Production INTERNAL_SERVICE_TOKEN must be overridden.')
  }

  if (apiConfig.jwtSecret === defaultJwtSecret) {
    throw new Error('Production JWT_SECRET must be overridden.')
  }
}

assertProductionApiConfig()

export { apiConfig }
