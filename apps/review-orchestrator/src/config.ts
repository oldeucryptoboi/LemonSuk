import { defaultReviewQueueKey } from '../../../packages/shared/src/constants'

const defaultInternalServiceToken = 'lemonsuk-dev-internal-service-token'
const defaultWebhookSecret = 'lemonsuk-dev-eddie-webhook-secret'
const defaultInternalApiBaseUrl = 'http://localhost:8787/api/v1'

const reviewOrchestratorConfig = {
  host: process.env.REVIEW_HOST ?? '0.0.0.0',
  port: Number(process.env.REVIEW_PORT ?? 8790),
  reviewBasePath: '/review',
  apiInternalBaseUrl:
    process.env.API_INTERNAL_BASE_URL ?? defaultInternalApiBaseUrl,
  internalServiceToken:
    process.env.INTERNAL_SERVICE_TOKEN ?? defaultInternalServiceToken,
  redisUrl: process.env.REDIS_URL ?? '',
  reviewQueueKey: process.env.REVIEW_QUEUE_KEY ?? defaultReviewQueueKey,
  eddieBaseUrl: process.env.EDDIE_BASE_URL ?? '',
  eddieApiKey: process.env.EDDIE_API_KEY ?? '',
  reviewToken:
    process.env.LEMONSUK_REVIEW_TOKEN ?? process.env.EDDIE_REVIEW_TOKEN ?? '',
  eddieWebhookSecret:
    process.env.LEMONSUK_REVIEW_WEBHOOK_SECRET ??
    process.env.EDDIE_WEBHOOK_SECRET ??
    defaultWebhookSecret,
  fetchTimeoutMs: Number(process.env.REVIEW_FETCH_TIMEOUT_MS ?? 10_000),
  maxSnapshotBytes: Number(process.env.REVIEW_MAX_SNAPSHOT_BYTES ?? 262_144),
  workerEnabled: process.env.REVIEW_WORKER_ENABLED !== 'false',
}

function assertProductionReviewConfig(): void {
  if ((process.env.NODE_ENV ?? 'development') !== 'production') {
    return
  }

  if (
    reviewOrchestratorConfig.apiInternalBaseUrl === defaultInternalApiBaseUrl ||
    reviewOrchestratorConfig.apiInternalBaseUrl.includes('localhost')
  ) {
    throw new Error(
      'Production API_INTERNAL_BASE_URL must point to the deployed LemonSuk API.',
    )
  }

  if (reviewOrchestratorConfig.internalServiceToken === defaultInternalServiceToken) {
    throw new Error('Production INTERNAL_SERVICE_TOKEN must be overridden.')
  }

  if (reviewOrchestratorConfig.eddieWebhookSecret === defaultWebhookSecret) {
    throw new Error(
      'Production LEMONSUK_REVIEW_WEBHOOK_SECRET must be overridden.',
    )
  }

  if (reviewOrchestratorConfig.workerEnabled) {
    if (!reviewOrchestratorConfig.eddieBaseUrl) {
      throw new Error('Production EDDIE_BASE_URL is required when the worker is enabled.')
    }

    if (!reviewOrchestratorConfig.reviewToken) {
      throw new Error(
        'Production LEMONSUK_REVIEW_TOKEN is required when the worker is enabled.',
      )
    }
  }
}

assertProductionReviewConfig()

export { reviewOrchestratorConfig }
