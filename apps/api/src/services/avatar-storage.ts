import { randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

import { apiConfig } from '../config'

const avatarMaxBytes = 5 * 1024 * 1024
const avatarAllowedContentTypes = new Map<string, string>([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])

let avatarS3Client: S3Client | null = null

type AvatarFormat = {
  contentType: string
  extension: string
}

function getAvatarS3Client(): S3Client {
  if (!avatarS3Client) {
    avatarS3Client = new S3Client({
      region: apiConfig.avatarS3Region,
    })
  }

  return avatarS3Client
}

function normalizeSlashlessPrefix(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, '')
}

function normalizeCloudFrontBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/g, '')
}

function assertAvatarStorageConfigured(): void {
  if (
    !apiConfig.avatarS3Bucket ||
    !apiConfig.avatarS3Region ||
    !apiConfig.avatarCloudFrontBaseUrl
  ) {
    throw new Error('Avatar storage is not configured right now.')
  }
}

function detectAvatarFormat(buffer: Buffer): AvatarFormat | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { contentType: 'image/png', extension: 'png' }
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { contentType: 'image/jpeg', extension: 'jpg' }
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { contentType: 'image/webp', extension: 'webp' }
  }

  if (
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
      buffer.subarray(0, 6).toString('ascii') === 'GIF89a')
  ) {
    return { contentType: 'image/gif', extension: 'gif' }
  }

  return null
}

function normalizeAvatarSourceUrl(value: string): URL {
  let parsed: URL

  try {
    parsed = new URL(value.trim())
  } catch {
    throw new Error('Avatar URL is invalid.')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Avatar URL must use HTTP or HTTPS.')
  }

  return parsed
}

function normalizeIpForPrivateCheck(value: string): string {
  if (!value.startsWith('::ffff:')) {
    return value
  }

  const mapped = value.slice('::ffff:'.length)
  if (mapped.includes('.')) {
    return mapped
  }

  const match = mapped.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
  if (!match) {
    return mapped
  }

  const first = Number.parseInt(match[1], 16)
  const second = Number.parseInt(match[2], 16)
  return [
    (first >> 8) & 0xff,
    first & 0xff,
    (second >> 8) & 0xff,
    second & 0xff,
  ].join('.')
}

function normalizeHostForNetworkCheck(value: string): string {
  const trimmed = value.trim().toLowerCase()
  return trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed
}

function isPrivateIpAddress(address: string): boolean {
  const normalized = normalizeIpForPrivateCheck(address)

  if (normalized === '::1') {
    return true
  }

  const version = isIP(normalized)
  if (version === 4) {
    const [a, b] = normalized.split('.').map((segment) => Number(segment))

    if (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      return true
    }

    return false
  }

  if (version === 6) {
    const lowered = normalized.toLowerCase()
    return lowered.startsWith('fc') || lowered.startsWith('fd') || lowered.startsWith('fe80:')
  }

  return false
}

async function assertPublicAvatarHost(hostname: string): Promise<void> {
  const lowered = normalizeHostForNetworkCheck(hostname)

  if (!lowered || lowered === 'localhost') {
    throw new Error('Avatar URL must not point to a private or local network host.')
  }

  const literalVersion = isIP(lowered)
  if (literalVersion) {
    if (isPrivateIpAddress(lowered)) {
      throw new Error('Avatar URL must not point to a private or local network host.')
    }
    return
  }

  let addresses: Array<{ address: string }> = []
  try {
    addresses = await lookup(lowered, { all: true, verbatim: true })
  } catch {
    throw new Error('Avatar host could not be resolved.')
  }

  if (addresses.length === 0 || addresses.some((entry) => isPrivateIpAddress(entry.address))) {
    throw new Error('Avatar URL must not point to a private or local network host.')
  }
}

function buildAvatarObjectKey(agentHandle: string, extension: string): string {
  const prefix = normalizeSlashlessPrefix(apiConfig.avatarS3Prefix)
  const key = `${agentHandle}/${randomUUID().replace(/-/g, '')}.${extension}`
  return prefix ? `${prefix}/${key}` : key
}

function buildManagedAvatarUrl(key: string): string {
  return `${normalizeCloudFrontBaseUrl(apiConfig.avatarCloudFrontBaseUrl)}/${key}`
}

function extractManagedAvatarKey(url: string): string | null {
  if (!apiConfig.avatarCloudFrontBaseUrl) {
    return null
  }

  const managedBase = new URL(normalizeCloudFrontBaseUrl(apiConfig.avatarCloudFrontBaseUrl))
  const parsed = new URL(url)

  if (parsed.origin !== managedBase.origin) {
    return null
  }

  const basePath = managedBase.pathname.replace(/\/+$/g, '')
  if (basePath && !parsed.pathname.startsWith(`${basePath}/`)) {
    return null
  }

  const relativePath = basePath
    ? parsed.pathname.slice(basePath.length)
    : parsed.pathname

  const key = relativePath.replace(/^\/+/g, '')
  return key || null
}

export function isManagedAvatarUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false
  }

  try {
    return Boolean(extractManagedAvatarKey(url))
  } catch {
    return false
  }
}

export async function ingestAgentAvatarFromUrl(
  sourceUrl: string,
  agentHandle: string,
): Promise<string> {
  assertAvatarStorageConfigured()

  if (isManagedAvatarUrl(sourceUrl)) {
    return sourceUrl.trim()
  }

  const parsedUrl = normalizeAvatarSourceUrl(sourceUrl)
  await assertPublicAvatarHost(parsedUrl.hostname)

  let response: Response
  try {
    response = await fetch(parsedUrl.toString(), {
      redirect: 'follow',
      headers: {
        accept: 'image/*',
        'user-agent': 'LemonSukAvatarFetcher/1.0',
      },
    })
  } catch {
    throw new Error('Could not fetch that avatar image.')
  }

  if (!response.ok) {
    throw new Error('Could not fetch that avatar image.')
  }

  const declaredLength = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declaredLength) && declaredLength > avatarMaxBytes) {
    throw new Error('Avatar image must be 5 MB or smaller.')
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length === 0) {
    throw new Error('Avatar image was empty.')
  }

  if (buffer.length > avatarMaxBytes) {
    throw new Error('Avatar image must be 5 MB or smaller.')
  }

  const detectedFormat = detectAvatarFormat(buffer)
  const declaredType = response.headers
    .get('content-type')
    ?.split(';', 1)[0]
    ?.trim()
    ?.toLowerCase()

  const format =
    detectedFormat ??
    (declaredType ? avatarAllowedContentTypes.get(declaredType) : null)

  if (!format) {
    throw new Error('Avatar image must be PNG, JPEG, WEBP, or GIF.')
  }

  const resolvedFormat =
    typeof format === 'string'
      ? { contentType: declaredType!, extension: format }
      : format

  const objectKey = buildAvatarObjectKey(agentHandle, resolvedFormat.extension)

  await getAvatarS3Client().send(
    new PutObjectCommand({
      Bucket: apiConfig.avatarS3Bucket,
      Key: objectKey,
      Body: buffer,
      ContentType: resolvedFormat.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )

  return buildManagedAvatarUrl(objectKey)
}

export async function deleteManagedAvatarUrl(url: string): Promise<void> {
  assertAvatarStorageConfigured()

  const objectKey = extractManagedAvatarKey(url)
  if (!objectKey) {
    return
  }

  await getAvatarS3Client().send(
    new DeleteObjectCommand({
      Bucket: apiConfig.avatarS3Bucket,
      Key: objectKey,
    }),
  )
}
