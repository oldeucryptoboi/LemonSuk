import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { discoverSources } from './search-provider'

const bingHtml = `
  <html>
    <body>
      <li class="b_algo">
        <h2><a href="https://x.com/elonmusk/status/1">X Post</a></h2>
        <div class="b_caption"><p>robotaxi on 8/8</p></div>
      </li>
      <li class="b_algo">
        <h2><a href="https://www.tesla.com/blog/optimus">Tesla Blog</a></h2>
        <div class="b_caption"><p>Optimus by end of next year</p></div>
      </li>
      <li class="b_algo">
        <h2><a href="https://motherfrunker.ca/fsd/">Motherfrunker</a></h2>
        <div class="b_caption"><p>timeline</p></div>
      </li>
      <li class="b_algo">
        <h2><a href="https://www.reuters.com/world/us/robotaxi-story/">Reuters</a></h2>
        <div class="b_caption"><p>news report</p></div>
      </li>
      <li class="b_algo">
        <h2><a href="https://example.com/blog-post">Blog Post</a></h2>
        <div class="b_caption"><p>blog story</p></div>
      </li>
    </body>
  </html>
`

function hydratedHtml(title: string, description: string, publishedAt?: string) {
  return `
    <html>
      <head>
        <title>${title}</title>
        <meta property="og:title" content="${title}" />
        <meta name="description" content="${description}" />
        ${publishedAt ? `<meta property="article:published_time" content="${publishedAt}" />` : ''}
      </head>
      <body>
        <article><p>${description}</p><p>More detail here.</p></article>
      </body>
    </html>
  `
}

describe('discoverSources', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = input.toString()
      if (url.includes('bing.com/search')) {
        if (url.includes('site%3Aelectrek.co')) {
          throw new Error('search failed')
        }

        return new Response(bingHtml)
      }

      if (url.includes('x.com')) {
        return new Response(
          hydratedHtml('X Post', 'Tesla Robotaxi unveil on 8/8', '2024-04-05T00:00:00.000Z'),
        )
      }

      if (url.includes('tesla.com')) {
        return new Response(
          hydratedHtml(
            'Tesla Blog',
            'Optimus will work by the end of next year.',
            '2024-04-23T00:00:00.000Z',
          ),
        )
      }

      if (url.includes('motherfrunker.ca')) {
        return new Response(hydratedHtml('Motherfrunker', 'Timeline tracker'))
      }

      if (url.includes('reuters.com')) {
        return new Response(
          hydratedHtml(
            'Reuters',
            'Musk says robotaxi production starting in 2029',
            '2024-01-01T00:00:00.000Z',
          ),
        )
      }

      if (url.includes('example.com/blog-post')) {
        throw new Error('hydrate failed')
      }

      return new Response('<html></html>')
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('discovers, hydrates, deduplicates, and classifies multiple source types', async () => {
    const results = await discoverSources('Elon Musk Tesla deadline promises')

    expect(results).toHaveLength(5)
    expect(results.map((entry) => entry.sourceType).sort()).toEqual(
      ['blog', 'news', 'official', 'reference', 'x'].sort(),
    )
    expect(results.find((entry) => entry.domain === 'x.com')?.fetchedTitle).toBe(
      'X Post',
    )
    expect(
      results.find((entry) => entry.domain === 'example.com')?.fetchedText,
    ).toBeNull()
  })

  it('falls back to document titles, result titles, and og descriptions during hydration', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = input.toString()

      if (url.includes('bing.com/search')) {
        return new Response(`
          <html>
            <body>
              <li class="b_algo">
                <h2><a>Missing href</a></h2>
                <div class="b_caption"><p>ignored result</p></div>
              </li>
              <li class="b_algo">
                <h2><a href="https://example.com/no-og"></a></h2>
                <div class="b_caption"><p>fallback snippet</p></div>
              </li>
              <li class="b_algo">
                <h2><a href="https://example.com/no-head">Only Search Title</a></h2>
                <div class="b_caption"><p>fallback snippet</p></div>
              </li>
              <li class="b_algo">
                <h2><a href="https://example.com/empty-head"></a></h2>
                <div class="b_caption"><p></p></div>
              </li>
            </body>
          </html>
        `)
      }

      if (url.includes('no-og')) {
        return new Response(`
          <html>
            <head>
              <title>Title Tag Only</title>
              <meta property="og:description" content="OG description only" />
              <meta property="article:published_time" content="not-a-date" />
            </head>
            <body><p>body text</p></body>
          </html>
        `)
      }

      return new Response(`
        <html>
          <head></head>
          <body>${url.includes('empty-head') ? '' : '<p>body text</p>'}</body>
        </html>
      `)
    }))

    const results = await discoverSources('fallback coverage')

    expect(results.find((entry) => entry.url.includes('no-og'))?.fetchedTitle).toBe(
      'Title Tag Only',
    )
    expect(results.find((entry) => entry.url.includes('no-og'))?.title).toBe('')
    expect(results.find((entry) => entry.url.includes('no-og'))?.id).toContain(
      'example-com',
    )
    expect(results.find((entry) => entry.url.includes('no-og'))?.fetchedText).toContain(
      'OG description only',
    )
    expect(results.find((entry) => entry.url.includes('no-og'))?.publishedAt).toBeNull()
    expect(results.find((entry) => entry.url.includes('no-head'))?.fetchedTitle).toBe(
      'Only Search Title',
    )
    expect(results.find((entry) => entry.url.includes('no-head'))?.fetchedText).toBe(
      'body text',
    )
    expect(results.find((entry) => entry.url.includes('empty-head'))?.fetchedTitle).toBeNull()
    expect(results.find((entry) => entry.url.includes('empty-head'))?.fetchedText).toBeNull()
  })
})
