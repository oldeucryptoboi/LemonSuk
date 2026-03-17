import { load } from 'cheerio'

import type { SearchResult } from '../shared'
import { searchResultSchema } from '../shared'
import { createSourceId, domainFromUrl } from '../services/utils'
import { inferSourceType } from '../services/source-type'

const userAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'

function sanitizeText(input: string): string {
  return input.replace(/\s+/g, ' ').trim()
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(8000),
  })

  return response.text()
}

async function searchBing(query: string): Promise<SearchResult[]> {
  const url = new URL('https://www.bing.com/search')
  url.searchParams.set('q', query)

  const html = await fetchText(url.toString())
  const $ = load(html)

  return $('li.b_algo')
    .toArray()
    .slice(0, 6)
    .map((entry) => {
      const anchor = $(entry).find('h2 a').first()
      const href = anchor.attr('href')

      if (!href) {
        return null
      }

      const title = sanitizeText(anchor.text())
      const snippet = sanitizeText($(entry).find('.b_caption p').first().text())
      const domain = domainFromUrl(href)

      return searchResultSchema.parse({
        id: createSourceId(title || domain, href),
        query,
        title,
        url: href,
        domain,
        snippet,
        sourceType: inferSourceType(href),
        fetchedText: null,
        fetchedTitle: null,
        publishedAt: null,
      })
    })
    .filter((entry): entry is SearchResult => entry !== null)
}

function extractPublishedAt($: ReturnType<typeof load>): string | null {
  const raw =
    $('meta[property="article:published_time"]').attr('content') ??
    $('meta[name="article:published_time"]').attr('content') ??
    $('meta[itemprop="datePublished"]').attr('content') ??
    $('time').first().attr('datetime') ??
    null

  if (!raw) {
    return null
  }

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

async function hydrateResult(result: SearchResult): Promise<SearchResult> {
  try {
    const html = await fetchText(result.url)
    const $ = load(html)
    const title =
      sanitizeText($('meta[property="og:title"]').attr('content') ?? '') ||
      sanitizeText($('title').first().text()) ||
      result.title
    const description = sanitizeText(
      $('meta[name="description"]').attr('content') ??
        $('meta[property="og:description"]').attr('content') ??
        '',
    )
    const paragraphs = $('article p, p')
      .toArray()
      .slice(0, 8)
      .map((entry) => sanitizeText($(entry).text()))
      .filter(Boolean)
      .join(' ')

    return searchResultSchema.parse({
      ...result,
      fetchedTitle: title || null,
      fetchedText:
        sanitizeText(`${description} ${paragraphs}`).slice(0, 2800) || null,
      publishedAt: extractPublishedAt($),
    })
  } catch {
    return result
  }
}

function expandQueries(query: string): string[] {
  return [
    query,
    `${query} site:tesla.com`,
    `${query} site:spacex.com`,
    `${query} site:boringcompany.com`,
    `${query} site:neuralink.com`,
    `${query} site:x.ai`,
    `${query} site:x.com/elonmusk/status`,
    `${query} site:twitter.com/elonmusk/status`,
    `${query} site:electrek.co`,
    `${query} site:techcrunch.com`,
    `${query} site:cnbc.com`,
    `${query} site:wired.com`,
    `${query} site:space.com`,
    `${query} site:whitehouse.gov`,
    `${query} site:motherfrunker.ca`,
  ]
}

export async function discoverSources(query: string): Promise<SearchResult[]> {
  const results = await Promise.allSettled(expandQueries(query).map(searchBing))
  const merged = results.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : [],
  )
  const deduped = Array.from(
    new Map(merged.map((result) => [result.url, result])).values(),
  ).slice(0, 18)
  const hydrated = await Promise.all(deduped.map(hydrateResult))

  return hydrated
}
