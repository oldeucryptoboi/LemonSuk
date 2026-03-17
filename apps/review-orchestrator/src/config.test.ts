import { afterEach, describe, expect, it, vi } from 'vitest'

describe('reviewOrchestratorConfig', () => {
  afterEach(() => {
    delete process.env.REVIEW_HOST
    delete process.env.REVIEW_PORT
    delete process.env.API_INTERNAL_BASE_URL
    delete process.env.INTERNAL_SERVICE_TOKEN
    delete process.env.REDIS_URL
    delete process.env.REVIEW_QUEUE_KEY
    delete process.env.EDDIE_BASE_URL
    delete process.env.EDDIE_API_KEY
    delete process.env.EDDIE_WEBHOOK_SECRET
    delete process.env.REVIEW_FETCH_TIMEOUT_MS
    delete process.env.REVIEW_MAX_SNAPSHOT_BYTES
    delete process.env.REVIEW_WORKER_ENABLED
    vi.resetModules()
  })

  it('uses defaults when review environment variables are absent', async () => {
    const { reviewOrchestratorConfig } = await import('./config')

    expect(reviewOrchestratorConfig).toEqual({
      host: '0.0.0.0',
      port: 8790,
      reviewBasePath: '/review',
      apiInternalBaseUrl: 'http://localhost:8787/api/v1',
      internalServiceToken: 'lemonsuk-dev-internal-service-token',
      redisUrl: '',
      reviewQueueKey: 'lemonsuk:review-requested',
      eddieBaseUrl: '',
      eddieApiKey: '',
      eddieWebhookSecret: 'lemonsuk-dev-eddie-webhook-secret',
      fetchTimeoutMs: 10_000,
      maxSnapshotBytes: 262_144,
      workerEnabled: true,
    })
  })

  it('reads explicit review environment overrides', async () => {
    process.env.REVIEW_HOST = '127.0.0.1'
    process.env.REVIEW_PORT = '9001'
    process.env.API_INTERNAL_BASE_URL = 'http://api:8787/api/v1'
    process.env.INTERNAL_SERVICE_TOKEN = 'internal-review-secret'
    process.env.REDIS_URL = 'redis://redis:6379'
    process.env.REVIEW_QUEUE_KEY = 'custom-review-queue'
    process.env.EDDIE_BASE_URL = 'https://eddie.example'
    process.env.EDDIE_API_KEY = 'eddie-key'
    process.env.EDDIE_WEBHOOK_SECRET = 'eddie-secret'
    process.env.REVIEW_FETCH_TIMEOUT_MS = '2500'
    process.env.REVIEW_MAX_SNAPSHOT_BYTES = '1024'
    process.env.REVIEW_WORKER_ENABLED = 'false'

    const { reviewOrchestratorConfig } = await import('./config')

    expect(reviewOrchestratorConfig.host).toBe('127.0.0.1')
    expect(reviewOrchestratorConfig.port).toBe(9001)
    expect(reviewOrchestratorConfig.apiInternalBaseUrl).toBe(
      'http://api:8787/api/v1',
    )
    expect(reviewOrchestratorConfig.internalServiceToken).toBe(
      'internal-review-secret',
    )
    expect(reviewOrchestratorConfig.redisUrl).toBe('redis://redis:6379')
    expect(reviewOrchestratorConfig.reviewQueueKey).toBe('custom-review-queue')
    expect(reviewOrchestratorConfig.eddieBaseUrl).toBe(
      'https://eddie.example',
    )
    expect(reviewOrchestratorConfig.eddieApiKey).toBe('eddie-key')
    expect(reviewOrchestratorConfig.eddieWebhookSecret).toBe('eddie-secret')
    expect(reviewOrchestratorConfig.fetchTimeoutMs).toBe(2500)
    expect(reviewOrchestratorConfig.maxSnapshotBytes).toBe(1024)
    expect(reviewOrchestratorConfig.workerEnabled).toBe(false)
  })
})
