export const apiConfig = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 8787),
  apiBasePath: '/api/v1',
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? '*',
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgresql://localhost:5432/lemonsuk',
  databaseSsl: process.env.PGSSLMODE === 'require',
  redisUrl: process.env.REDIS_URL ?? '',
  internalServiceToken:
    process.env.INTERNAL_SERVICE_TOKEN ??
    'lemonsuk-dev-internal-service-token',
  reviewQueueKey: process.env.REVIEW_QUEUE_KEY ?? 'lemonsuk:review-requested',
  jwtSecret: process.env.JWT_SECRET ?? 'lemonsuk-dev-jwt-secret',
  sendGridApiKey: process.env.SENDGRID_API_KEY ?? '',
  sendGridFromEmail: process.env.SENDGRID_FROM_EMAIL ?? '',
}
