const defaultDatabaseUrl = 'postgresql://localhost:5432/lemonsuk'
const defaultInternalServiceToken = 'lemonsuk-dev-internal-service-token'
const defaultJwtSecret = 'lemonsuk-dev-jwt-secret'
const defaultApiPublicUrl = 'http://localhost:8787'

const apiConfig = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 8787),
  apiBasePath: '/api/v1',
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  apiPublicUrl: process.env.API_PUBLIC_URL ?? defaultApiPublicUrl,
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? '*',
  databaseUrl: process.env.DATABASE_URL ?? defaultDatabaseUrl,
  databaseSsl: process.env.PGSSLMODE === 'require',
  redisUrl: process.env.REDIS_URL ?? '',
  internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN ?? defaultInternalServiceToken,
  reviewQueueKey: process.env.REVIEW_QUEUE_KEY ?? 'lemonsuk:review-requested',
  jwtSecret: process.env.JWT_SECRET ?? defaultJwtSecret,
  sendGridApiKey: process.env.SENDGRID_API_KEY ?? '',
  sendGridFromEmail: process.env.SENDGRID_FROM_EMAIL ?? '',
  avatarS3Bucket: process.env.AVATAR_S3_BUCKET ?? '',
  avatarS3Region: process.env.AVATAR_S3_REGION ?? process.env.AWS_REGION ?? '',
  avatarCloudFrontBaseUrl: process.env.AVATAR_CLOUDFRONT_BASE_URL ?? '',
  avatarS3Prefix: process.env.AVATAR_S3_PREFIX ?? 'agent-avatars',
  xClientId: process.env.X_CLIENT_ID ?? process.env.TWITTER_CLIENT_ID ?? '',
  xClientSecret:
    process.env.X_CLIENT_SECRET ?? process.env.TWITTER_CLIENT_SECRET ?? '',
  xBearerToken:
    process.env.X_BEARER_TOKEN ?? process.env.TWITTER_BEARER_TOKEN ?? '',
  xOauthAuthorizeUrl:
    process.env.X_OAUTH_AUTHORIZE_URL ?? 'https://x.com/i/oauth2/authorize',
  xOauthTokenUrl:
    process.env.X_OAUTH_TOKEN_URL ?? 'https://api.x.com/2/oauth2/token',
  xApiBaseUrl: process.env.X_API_BASE_URL ?? 'https://api.x.com/2',
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

  if (
    apiConfig.apiPublicUrl === defaultApiPublicUrl ||
    /:\/\/(?:127\.0\.0\.1|localhost)(?::|\/)/.test(apiConfig.apiPublicUrl)
  ) {
    throw new Error('Production API_PUBLIC_URL must point to the deployed API origin.')
  }

  const avatarStorageConfigValues = [
    apiConfig.avatarS3Bucket,
    apiConfig.avatarS3Region,
    apiConfig.avatarCloudFrontBaseUrl,
  ]
  const hasSomeAvatarStorageConfig = avatarStorageConfigValues.some(Boolean)
  const hasFullAvatarStorageConfig = avatarStorageConfigValues.every(Boolean)

  if (hasSomeAvatarStorageConfig && !hasFullAvatarStorageConfig) {
    throw new Error(
      'Production avatar storage config is incomplete. Set AVATAR_S3_BUCKET, AVATAR_S3_REGION, and AVATAR_CLOUDFRONT_BASE_URL together.',
    )
  }
}

assertProductionApiConfig()

export { apiConfig }
