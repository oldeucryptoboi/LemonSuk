import { afterEach, describe, expect, it, vi } from 'vitest'

describe('apiConfig', () => {
  const mutableEnv = process.env as Record<string, string | undefined>
  const currentNodeEnv = process.env.NODE_ENV ?? 'development'

  afterEach(() => {
    delete process.env.HOST
    delete process.env.PORT
    delete process.env.APP_URL
    delete process.env.ALLOWED_ORIGIN
    delete process.env.DATABASE_URL
    delete process.env.PGSSLMODE
    delete process.env.REDIS_URL
    delete process.env.INTERNAL_SERVICE_TOKEN
    delete process.env.REVIEW_QUEUE_KEY
    delete process.env.JWT_SECRET
    delete process.env.SENDGRID_API_KEY
    delete process.env.SENDGRID_FROM_EMAIL
    mutableEnv.NODE_ENV = currentNodeEnv
    vi.resetModules()
  })

  it('uses defaults when environment variables are absent', async () => {
    delete mutableEnv.NODE_ENV
    const { apiConfig } = await import('./config')

    expect(apiConfig).toEqual({
      nodeEnv: 'development',
      host: '0.0.0.0',
      port: 8787,
      apiBasePath: '/api/v1',
      appUrl: 'http://localhost:5173',
      allowedOrigin: '*',
      databaseUrl: 'postgresql://localhost:5432/lemonsuk',
      databaseSsl: false,
      redisUrl: '',
      internalServiceToken: 'lemonsuk-dev-internal-service-token',
      reviewQueueKey: 'lemonsuk:review-requested',
      jwtSecret: 'lemonsuk-dev-jwt-secret',
      sendGridApiKey: '',
      sendGridFromEmail: '',
    })
  })

  it('reads explicit environment overrides', async () => {
    mutableEnv.NODE_ENV = 'production'
    process.env.HOST = '127.0.0.1'
    process.env.PORT = '9999'
    process.env.APP_URL = 'https://lemonsuk.example'
    process.env.ALLOWED_ORIGIN = 'https://www.lemonsuk.example'
    process.env.DATABASE_URL = 'postgresql://example/test'
    process.env.PGSSLMODE = 'require'
    process.env.REDIS_URL = 'redis://localhost:6379'
    process.env.INTERNAL_SERVICE_TOKEN = 'internal-secret'
    process.env.REVIEW_QUEUE_KEY = 'review-queue'
    process.env.JWT_SECRET = 'secret'
    process.env.SENDGRID_API_KEY = 'sg-key'
    process.env.SENDGRID_FROM_EMAIL = 'alerts@lemonsuk.example'

    const { apiConfig } = await import('./config')

    expect(apiConfig.nodeEnv).toBe('production')
    expect(apiConfig.host).toBe('127.0.0.1')
    expect(apiConfig.port).toBe(9999)
    expect(apiConfig.appUrl).toBe('https://lemonsuk.example')
    expect(apiConfig.allowedOrigin).toBe('https://www.lemonsuk.example')
    expect(apiConfig.databaseUrl).toBe('postgresql://example/test')
    expect(apiConfig.databaseSsl).toBe(true)
    expect(apiConfig.redisUrl).toBe('redis://localhost:6379')
    expect(apiConfig.internalServiceToken).toBe('internal-secret')
    expect(apiConfig.reviewQueueKey).toBe('review-queue')
    expect(apiConfig.jwtSecret).toBe('secret')
    expect(apiConfig.sendGridApiKey).toBe('sg-key')
    expect(apiConfig.sendGridFromEmail).toBe('alerts@lemonsuk.example')
  })
})
