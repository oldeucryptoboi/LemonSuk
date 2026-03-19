import { afterEach, describe, expect, it, vi } from 'vitest'

describe('apiConfig', () => {
  const mutableEnv = process.env as Record<string, string | undefined>
  const currentNodeEnv = process.env.NODE_ENV ?? 'development'

  afterEach(() => {
    delete process.env.HOST
    delete process.env.PORT
    delete process.env.APP_URL
    delete process.env.API_PUBLIC_URL
    delete process.env.ALLOWED_ORIGIN
    delete process.env.DATABASE_URL
    delete process.env.PGSSLMODE
    delete process.env.REDIS_URL
    delete process.env.INTERNAL_SERVICE_TOKEN
    delete process.env.REVIEW_QUEUE_KEY
    delete process.env.JWT_SECRET
    delete process.env.SENDGRID_API_KEY
    delete process.env.SENDGRID_FROM_EMAIL
    delete process.env.X_CLIENT_ID
    delete process.env.X_CLIENT_SECRET
    delete process.env.TWITTER_CLIENT_ID
    delete process.env.TWITTER_CLIENT_SECRET
    delete process.env.X_BEARER_TOKEN
    delete process.env.TWITTER_BEARER_TOKEN
    delete process.env.X_OAUTH_AUTHORIZE_URL
    delete process.env.X_OAUTH_TOKEN_URL
    delete process.env.X_API_BASE_URL
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
      apiPublicUrl: 'http://localhost:8787',
      allowedOrigin: '*',
      databaseUrl: 'postgresql://localhost:5432/lemonsuk',
      databaseSsl: false,
      redisUrl: '',
      internalServiceToken: 'lemonsuk-dev-internal-service-token',
      reviewQueueKey: 'lemonsuk:review-requested',
      jwtSecret: 'lemonsuk-dev-jwt-secret',
      sendGridApiKey: '',
      sendGridFromEmail: '',
      xClientId: '',
      xClientSecret: '',
      xBearerToken: '',
      xOauthAuthorizeUrl: 'https://x.com/i/oauth2/authorize',
      xOauthTokenUrl: 'https://api.x.com/2/oauth2/token',
      xApiBaseUrl: 'https://api.x.com/2',
    })
  })

  it('reads explicit environment overrides', async () => {
    mutableEnv.NODE_ENV = 'production'
    process.env.HOST = '127.0.0.1'
    process.env.PORT = '9999'
    process.env.APP_URL = 'https://lemonsuk.example'
    process.env.API_PUBLIC_URL = 'https://api.lemonsuk.example'
    process.env.ALLOWED_ORIGIN = 'https://www.lemonsuk.example'
    process.env.DATABASE_URL = 'postgresql://example/test'
    process.env.PGSSLMODE = 'require'
    process.env.REDIS_URL = 'redis://localhost:6379'
    process.env.INTERNAL_SERVICE_TOKEN = 'internal-secret'
    process.env.REVIEW_QUEUE_KEY = 'review-queue'
    process.env.JWT_SECRET = 'secret'
    process.env.SENDGRID_API_KEY = 'sg-key'
    process.env.SENDGRID_FROM_EMAIL = 'alerts@lemonsuk.example'
    process.env.X_CLIENT_ID = 'x-client-id'
    process.env.X_CLIENT_SECRET = 'x-client-secret'
    process.env.TWITTER_BEARER_TOKEN = 'x-bearer-token'
    process.env.X_OAUTH_AUTHORIZE_URL = 'https://auth.example/authorize'
    process.env.X_OAUTH_TOKEN_URL = 'https://auth.example/token'
    process.env.X_API_BASE_URL = 'https://auth.example/api'

    const { apiConfig } = await import('./config')

    expect(apiConfig.nodeEnv).toBe('production')
    expect(apiConfig.host).toBe('127.0.0.1')
    expect(apiConfig.port).toBe(9999)
    expect(apiConfig.appUrl).toBe('https://lemonsuk.example')
    expect(apiConfig.apiPublicUrl).toBe('https://api.lemonsuk.example')
    expect(apiConfig.allowedOrigin).toBe('https://www.lemonsuk.example')
    expect(apiConfig.databaseUrl).toBe('postgresql://example/test')
    expect(apiConfig.databaseSsl).toBe(true)
    expect(apiConfig.redisUrl).toBe('redis://localhost:6379')
    expect(apiConfig.internalServiceToken).toBe('internal-secret')
    expect(apiConfig.reviewQueueKey).toBe('review-queue')
    expect(apiConfig.jwtSecret).toBe('secret')
    expect(apiConfig.sendGridApiKey).toBe('sg-key')
    expect(apiConfig.sendGridFromEmail).toBe('alerts@lemonsuk.example')
    expect(apiConfig.xClientId).toBe('x-client-id')
    expect(apiConfig.xClientSecret).toBe('x-client-secret')
    expect(apiConfig.xBearerToken).toBe('x-bearer-token')
    expect(apiConfig.xOauthAuthorizeUrl).toBe('https://auth.example/authorize')
    expect(apiConfig.xOauthTokenUrl).toBe('https://auth.example/token')
    expect(apiConfig.xApiBaseUrl).toBe('https://auth.example/api')
  })

  it('falls back to twitter-named X oauth variables', async () => {
    process.env.TWITTER_CLIENT_ID = 'twitter-client-id'
    process.env.TWITTER_CLIENT_SECRET = 'twitter-client-secret'

    const { apiConfig } = await import('./config')

    expect(apiConfig.xClientId).toBe('twitter-client-id')
    expect(apiConfig.xClientSecret).toBe('twitter-client-secret')
  })

  it('rejects unsafe production defaults', async () => {
    mutableEnv.NODE_ENV = 'production'
    delete process.env.DATABASE_URL
    delete process.env.INTERNAL_SERVICE_TOKEN
    delete process.env.JWT_SECRET

    await expect(import('./config')).rejects.toThrow(
      'Production DATABASE_URL must point to the deployed database service.',
    )
  })

  it('rejects the production default internal token after the database is configured', async () => {
    mutableEnv.NODE_ENV = 'production'
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@db.internal/lemonsuk'
    delete process.env.INTERNAL_SERVICE_TOKEN
    process.env.JWT_SECRET = 'safe-production-secret'

    await expect(import('./config')).rejects.toThrow(
      'Production INTERNAL_SERVICE_TOKEN must be overridden.',
    )
  })

  it('rejects the production default jwt secret after the database and internal token are configured', async () => {
    mutableEnv.NODE_ENV = 'production'
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@db.internal/lemonsuk'
    process.env.INTERNAL_SERVICE_TOKEN = 'safe-internal-token'
    process.env.API_PUBLIC_URL = 'https://api.lemonsuk.example'
    delete process.env.JWT_SECRET

    await expect(import('./config')).rejects.toThrow(
      'Production JWT_SECRET must be overridden.',
    )
  })

  it('rejects the production default api public url after secrets are configured', async () => {
    mutableEnv.NODE_ENV = 'production'
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@db.internal/lemonsuk'
    process.env.INTERNAL_SERVICE_TOKEN = 'safe-internal-token'
    process.env.JWT_SECRET = 'safe-production-secret'
    delete process.env.API_PUBLIC_URL

    await expect(import('./config')).rejects.toThrow(
      'Production API_PUBLIC_URL must point to the deployed API origin.',
    )
  })
})
