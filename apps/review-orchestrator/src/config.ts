import { defaultReviewQueueKey } from '../../../packages/shared/src/constants'

export const reviewOrchestratorConfig = {
  host: process.env.REVIEW_HOST ?? '0.0.0.0',
  port: Number(process.env.REVIEW_PORT ?? 8790),
  reviewBasePath: '/review',
  apiInternalBaseUrl:
    process.env.API_INTERNAL_BASE_URL ?? 'http://localhost:8787/api/v1',
  internalServiceToken:
    process.env.INTERNAL_SERVICE_TOKEN ??
    'lemonsuk-dev-internal-service-token',
  redisUrl: process.env.REDIS_URL ?? '',
  reviewQueueKey: process.env.REVIEW_QUEUE_KEY ?? defaultReviewQueueKey,
  eddieBaseUrl: process.env.EDDIE_BASE_URL ?? '',
  eddieApiKey: process.env.EDDIE_API_KEY ?? '',
  eddieWebhookSecret:
    process.env.EDDIE_WEBHOOK_SECRET ?? 'lemonsuk-dev-eddie-webhook-secret',
  fetchTimeoutMs: Number(process.env.REVIEW_FETCH_TIMEOUT_MS ?? 10_000),
  maxSnapshotBytes: Number(process.env.REVIEW_MAX_SNAPSHOT_BYTES ?? 262_144),
  workerEnabled: process.env.REVIEW_WORKER_ENABLED !== 'false',
}
