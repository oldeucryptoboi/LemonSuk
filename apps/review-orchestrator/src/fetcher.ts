import { load } from 'cheerio'

import { fetchedSnapshotSchema } from './types'
import type { FetchedSnapshot } from './types'
import { reviewOrchestratorConfig } from './config'

const blockedHosts = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254',
  'metadata.google.internal',
])

function isPrivateIpv4(hostname: string): boolean {
  if (/^10\./.test(hostname)) {
    return true
  }

  if (/^192\.168\./.test(hostname)) {
    return true
  }

  const match = hostname.match(/^172\.(\d+)\./)
  if (match) {
    const secondOctet = Number(match[1])
    return secondOctet >= 16 && secondOctet <= 31
  }

  return false
}

function assertSafeUrl(input: string): URL {
  const parsed = new URL(input)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only http and https review URLs are allowed.')
  }

  if (blockedHosts.has(parsed.hostname) || isPrivateIpv4(parsed.hostname)) {
    throw new Error('That review URL points to a blocked host.')
  }

  return parsed
}

function normalizeSnapshotText(contentType: string, body: string): string {
  if (contentType.includes('html')) {
    const document = load(
      body.replace(
        /<(\/?(?:p|div|section|article|header|footer|aside|main|nav|ul|ol|li|table|thead|tbody|tr|td|th|blockquote|pre|h[1-6]|br))\b/gi,
        ' <$1',
      ),
    )
    return document.root().text().replace(/\s+/g, ' ').trim()
  }

  return body.replace(/\s+/g, ' ').trim()
}

export async function fetchReviewSnapshot(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchedSnapshot> {
  const safeUrl = assertSafeUrl(url)
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    reviewOrchestratorConfig.fetchTimeoutMs,
  )

  try {
    const response = await fetchImpl(safeUrl, {
      redirect: 'follow',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Review fetch failed with status ${response.status}.`)
    }

    const contentType = response.headers.get('content-type') ?? 'text/plain'
    if (
      !contentType.includes('text/plain') &&
      !contentType.includes('text/html') &&
      !contentType.includes('application/xhtml+xml')
    ) {
      throw new Error('Unsupported review content type.')
    }

    const body = await response.text()
    if (body.length > reviewOrchestratorConfig.maxSnapshotBytes) {
      throw new Error('Review snapshot exceeds the maximum allowed size.')
    }

    return fetchedSnapshotSchema.parse({
      finalUrl: response.url || safeUrl.toString(),
      contentType,
      snapshotText: normalizeSnapshotText(contentType, body),
      snapshotRef: null,
    })
  } finally {
    clearTimeout(timeout)
  }
}
